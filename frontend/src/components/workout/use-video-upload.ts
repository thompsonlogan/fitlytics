import { useReducer, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { fmtBytes, type StagedFile } from "@/components/workout/video-format"
import { probeDuration } from "@/components/workout/video-probe"
import {
  isAllowedVideoType,
  MAX_VIDEO_BYTES,
  sessionVideosQueryKey,
  useDeleteSetVideo,
  useUpdateVideoNote,
  useUploadSetVideo,
} from "@/hooks/use-set-videos"
import { type SetBlock } from "@/lib/program-data"
import { type SetLogResponse, type VideoResponse } from "@/services/generated"

export type EnsureSetLog = (
  setIdx: number
) => Promise<{ sessionId: string; setLogId: string } | undefined>

type UseVideoUploadOpts = {
  block: SetBlock
  // The block's set logs (empty before the session is started); index aligns
  // with the set picker.
  blockLogs: SetLogResponse[]
  videosBySetLogId: Map<string, VideoResponse>
  sessionId: string | undefined
  initialSet: number
  // ensureSetLog lazily starts the session (if needed) and returns the ids for
  // the chosen physical set so an upload can target it.
  ensureSetLog: EnsureSetLog
  onOpenChange: (open: boolean) => void
}

// useVideoUpload owns the set-video dialog's state and the stage → reserve →
// PUT → finalize lifecycle. Extracted from VideoUploadDialog so that component
// stays a thin view (react-doctor/prefer-useReducer + no-giant-component);
// keeping it as a hook (rather than a reducer) preserves the existing behavior
// verbatim and makes the flow unit-testable without the dialog's portal.
export function useVideoUpload({
  block,
  blockLogs,
  videosBySetLogId,
  sessionId,
  initialSet,
  ensureSetLog,
  onOpenChange,
}: UseVideoUploadOpts) {
  const [setIdx, setSetIdx] = useState(initialSet)
  const [dragOver, setDragOver] = useState(false)
  const [uploadingSet, setUploadingSet] = useState<number | null>(null)
  const [progress, setProgress] = useReducer((_current: number, nextProgress: number) => nextProgress, 0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({})
  // Files the user has picked but not yet uploaded, keyed by set index so a
  // staged clip survives switching sets (mirrors noteDrafts). The bytes only
  // leave the browser when the user confirms the upload.
  const [stagedBySet, setStagedBySet] = useState<Record<number, StagedFile>>({})
  // The last source whose <video> failed to decode. Compared against the
  // current src (not a bare boolean) so it self-clears when the source changes
  // — no effect needed to reset it.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const refreshedIdsRef = useRef<Set<string>>(new Set())

  const upload = useUploadSetVideo()
  const remove = useDeleteSetVideo()
  const updateNote = useUpdateVideoNote()

  const videoFor = (i: number): VideoResponse | undefined => {
    const log = blockLogs[i]
    return log ? videosBySetLogId.get(log.id!) : undefined
  }

  const filmed = Array.from({ length: block.sets }, (_, i) => videoFor(i)?.status === "ready")
  const uploadingArr = Array.from({ length: block.sets }, (_, i) => uploadingSet === i)
  const filmedCount = filmed.filter(Boolean).length

  const currentVideo = videoFor(setIdx)
  const staged = stagedBySet[setIdx]
  const isUploading = uploadingSet === setIdx
  const isReady = currentVideo?.status === "ready"

  const noteValue = noteDrafts[setIdx] ?? currentVideo?.note ?? ""

  // Saved-clip URLs are presigned and can expire while a dialog stays open.
  // Try one list refetch per video id before surfacing the codec warning.
  function handlePlaybackError(src: string) {
    if (currentVideo?.id && sessionId && !refreshedIdsRef.current.has(currentVideo.id)) {
      refreshedIdsRef.current.add(currentVideo.id)
      void queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(sessionId) })
      return
    }
    setErroredSrc(src)
  }

  // stageFile validates the pick and shows it for local preview. It does NOT
  // upload — the bytes only leave the browser when the user confirms.
  async function stageFile(file: File) {
    setLocalError(null)
    setErroredSrc(null)
    if (!isAllowedVideoType(file.type)) {
      setLocalError("Use an MP4, MOV or WebM video.")
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setLocalError(`That file is over the ${fmtBytes(MAX_VIDEO_BYTES)} limit.`)
      return
    }

    const durationSec = await probeDuration(file)
    const url = URL.createObjectURL(file)
    setStagedBySet((prev) => {
      const existing = prev[setIdx]
      if (existing) URL.revokeObjectURL(existing.url)
      return { ...prev, [setIdx]: { file, url, durationSec } }
    })
  }

  function discardStaged(idx: number) {
    setStagedBySet((prev) => {
      const existing = prev[idx]
      if (!existing) return prev
      URL.revokeObjectURL(existing.url)
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  // confirmUpload runs the reserve → PUT → finalize lifecycle for the staged
  // file, then clears the local preview so the server copy becomes the source.
  async function confirmUpload() {
    const idx = setIdx
    const stagedFile = stagedBySet[idx]
    if (!stagedFile) return

    const resolved = await ensureSetLog(idx)
    if (!resolved) {
      toast.error("Couldn't prepare the set for upload.")
      return
    }

    setUploadingSet(idx)
    setProgress(0)
    try {
      await upload.mutateAsync({
        sessionId: resolved.sessionId,
        setLogId: resolved.setLogId,
        file: stagedFile.file,
        durationSec: stagedFile.durationSec,
        note: noteDrafts[idx] || undefined,
        onProgress: (f) => setProgress(f),
      })
      discardStaged(idx)
    } catch {
      toast.error("Upload failed. Check your connection and try again.")
    } finally {
      setUploadingSet(null)
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void stageFile(f)
    e.target.value = ""
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void stageFile(f)
  }

  // Closing the dialog drops any un-uploaded picks and frees their object URLs.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setStagedBySet((prev) => {
        for (const s of Object.values(prev)) URL.revokeObjectURL(s.url)
        return {}
      })
      setLocalError(null)
      setErroredSrc(null)
    }
    onOpenChange(next)
  }

  async function handleRemove() {
    if (!currentVideo?.id || !sessionId) return
    try {
      await remove.mutateAsync({ sessionId, videoId: currentVideo.id })
    } catch {
      toast.error("Couldn't remove the video.")
    }
  }

  // setNoteDraft records the in-flight per-set note; commitNote persists it on
  // blur, skipping the write when nothing changed.
  const setNoteDraft = (value: string) =>
    setNoteDrafts((prev) => ({ ...prev, [setIdx]: value }))

  function commitNote() {
    const draft = noteDrafts[setIdx]
    if (draft == null || !currentVideo?.id || !sessionId) return
    if (draft === (currentVideo.note ?? "")) return
    updateNote.mutate({ sessionId, videoId: currentVideo.id, note: draft })
  }

  return {
    setIdx,
    setSetIdx,
    dragOver,
    setDragOver,
    progress,
    localError,
    noteValue,
    setNoteDraft,
    commitNote,
    staged,
    currentVideo,
    isUploading,
    isReady,
    filmed,
    uploadingArr,
    filmedCount,
    erroredSrc,
    setErroredSrc,
    handlePlaybackError,
    fileRef,
    onPick,
    onDrop,
    handleOpenChange,
    handleRemove,
    confirmUpload,
    discardStaged,
    removing: remove.isPending,
    submitting: upload.isPending,
  }
}
