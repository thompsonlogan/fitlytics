import { useRef, useState } from "react"
import { Check, CircleCheck, Film, Info, Repeat2, Trash2, UploadCloud, Video } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { SetVideoPicker } from "@/components/workout/set-video-picker"
import { type Exercise, type SetBlock } from "@/lib/program-data"
import {
  ALLOWED_VIDEO_TYPES,
  isAllowedVideoType,
  MAX_VIDEO_BYTES,
  useDeleteSetVideo,
  useUpdateVideoNote,
  useUploadSetVideo,
} from "@/hooks/use-set-videos"
import { type SetLogResponse, type VideoResponse } from "@/services/generated"

// ── formatting helpers ──────────────────────────────────────────
function fmtBytes(n: number | undefined): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function fmtTime(s: number | undefined): string {
  if (s == null) return "0:00"
  const r = Math.round(s)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`
}

// probeDuration reads a video file's duration via an off-DOM element so the
// client can send it as a hint with the upload (best-effort).
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement("video")
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      const d = el.duration
      URL.revokeObjectURL(el.src)
      resolve(Number.isFinite(d) ? d : undefined)
    }
    el.onerror = () => resolve(undefined)
    el.src = URL.createObjectURL(file)
  })
}

type EnsureSetLog = (setIdx: number) => Promise<{ sessionId: string; setLogId: string } | undefined>

// A file the user has picked but not yet uploaded. The object URL drives the
// in-dialog preview and is revoked once the pick is uploaded or discarded.
type StagedFile = { file: File; url: string; durationSec?: number }

type VideoUploadDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string | undefined
  exercise: Exercise
  exNum: number
  block: SetBlock
  // The block's set logs (empty before the session is started); index aligns
  // with the set picker.
  blockLogs: SetLogResponse[]
  videosBySetLogId: Map<string, VideoResponse>
  initialSet: number
  // ensureSetLog lazily starts the session (if needed) and returns the ids for
  // the chosen physical set so an upload can target it.
  ensureSetLog: EnsureSetLog
}

// VideoUploadDialog is the stacked set-video uploader/reviewer: drop-zone →
// progress → inline player, plus a set picker, prescription context, and note.
export function VideoUploadDialog({
  open,
  onOpenChange,
  sessionId,
  exercise,
  exNum,
  block,
  blockLogs,
  videosBySetLogId,
  initialSet,
  ensureSetLog,
}: VideoUploadDialogProps) {
  const [setIdx, setSetIdx] = useState(initialSet)
  const [dragOver, setDragOver] = useState(false)
  const [uploadingSet, setUploadingSet] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
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

  function commitNote() {
    const draft = noteDrafts[setIdx]
    if (draft == null || !currentVideo?.id || !sessionId) return
    if (draft === (currentVideo.note ?? "")) return
    updateNote.mutate({ sessionId, videoId: currentVideo.id, note: draft })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            <Video className="size-3" />
            Set video
          </span>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
              {exNum}
            </span>
            {exercise.name}
          </DialogTitle>
          <DialogDescription>
            {exercise.sub ? `${exercise.sub} · ` : ""}rest {exercise.rest} min
          </DialogDescription>
        </DialogHeader>

        {/* media region */}
        <div>
          {isUploading ? (
            <div className="flex min-h-40 items-center">
              <div className="flex w-full items-center gap-3 rounded-md border bg-background p-3.5">
                <div className="flex size-13 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Film className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">Uploading…</span>
                    <span className="ml-auto text-xs font-semibold tabular-nums">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <Progress value={progress * 100} className="my-1.5" />
                </div>
              </div>
            </div>
          ) : staged ? (
            <div className="flex flex-col gap-2.5">
              <video
                key={staged.url}
                src={staged.url}
                controls
                playsInline
                preload="metadata"
                onError={() => setErroredSrc(staged.url)}
                className="aspect-video max-h-72 w-full rounded-md border bg-black"
              />
              {erroredSrc === staged.url ? <FormatWarning staged /> : null}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Film className="size-3.5" />
                <span className="max-w-44 truncate font-medium text-foreground">
                  {staged.file.name}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {fmtBytes(staged.file.size)} · {fmtTime(staged.durationSec)}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                >
                  <Repeat2 className="size-3" />
                  Change
                </button>
              </div>
            </div>
          ) : isReady && currentVideo?.playbackUrl ? (
            <div className="flex flex-col gap-2.5">
              <video
                key={currentVideo.playbackUrl}
                src={currentVideo.playbackUrl}
                controls
                playsInline
                preload="metadata"
                onError={() => setErroredSrc(currentVideo.playbackUrl!)}
                className="aspect-video max-h-72 w-full rounded-md border bg-black"
              />
              {erroredSrc === currentVideo.playbackUrl ? <FormatWarning /> : null}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleCheck className="size-3.5 text-emerald-500" />
                <span className="max-w-44 truncate font-medium text-foreground">
                  {currentVideo.originalName}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {fmtBytes(currentVideo.sizeBytes)} · {fmtTime(currentVideo.durationSec)}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                >
                  <Repeat2 className="size-3" />
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cnDrop(dragOver)}
            >
              <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                <UploadCloud className="size-5.5" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                Drag &amp; drop your lift video
              </span>
              <span className="text-[0.8125rem]">
                or <u className="underline-offset-2">browse files</u> to upload
              </span>
              <span className="mt-1 text-[0.6875rem] opacity-80">
                {ALLOWED_VIDEO_TYPES.map((t) => t.split("/")[1]?.toUpperCase()).join(", ")} · up to{" "}
                {fmtBytes(MAX_VIDEO_BYTES)}
              </span>
            </button>
          )}
          {localError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        {/* set picker */}
        {block.sets > 1 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1.5 text-xs font-semibold text-foreground">
              Which set?
              <span className="ml-auto text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
                {filmedCount}/{block.sets} filmed
              </span>
            </div>
            <SetVideoPicker
              count={block.sets}
              value={setIdx}
              filmed={filmed}
              uploading={uploadingArr}
              onChange={setSetIdx}
            />
          </div>
        ) : null}

        {/* prescription context */}
        <div className="grid grid-cols-4 overflow-hidden rounded-md border">
          <ContextCell label="Set" value={`${setIdx + 1}`} unit={`/${block.sets}`} />
          <ContextCell label="Reps" value={block.reps} />
          <ContextCell label="Load" value={block.used === "" ? "—" : String(block.used)} unit="lb" />
          <ContextCell label="RPE" value={block.rpe == null ? "—" : String(block.rpe)} last />
        </div>

        {/* note */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5 text-xs font-semibold text-foreground">
            Note
            <span className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
              optional
            </span>
          </div>
          <Textarea
            value={noteValue}
            placeholder="How did it feel? e.g. felt heavy, slight knee cave, good bar speed…"
            onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [setIdx]: e.target.value }))}
            onBlur={commitNote}
            className="min-h-18 resize-none text-[0.8125rem]"
          />
        </div>

        {/* footer */}
        <DialogFooterRow
          status={isUploading ? "uploading" : staged ? "staged" : isReady ? "ready" : "empty"}
          setNumber={setIdx + 1}
          onRemove={handleRemove}
          onDone={() => handleOpenChange(false)}
          onChooseFile={() => fileRef.current?.click()}
          onUpload={() => void confirmUpload()}
          onDiscard={() => discardStaged(setIdx)}
          removing={remove.isPending}
          submitting={upload.isPending}
        />

        <input ref={fileRef} type="file" accept="video/*" hidden onChange={onPick} />
      </DialogContent>
    </Dialog>
  )
}

function cnDrop(dragOver: boolean): string {
  return [
    "flex min-h-40 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed p-6 text-center text-muted-foreground transition-colors",
    dragOver
      ? "border-foreground border-solid bg-muted"
      : "border-border bg-background hover:border-ring hover:bg-muted",
  ].join(" ")
}

function ContextCell({
  label,
  value,
  unit,
  last,
}: {
  label: string
  value: string
  unit?: string
  last?: boolean
}) {
  return (
    <div className={["flex flex-col gap-0.5 px-2.5 py-2", last ? "" : "border-r"].join(" ")}>
      <span className="text-[0.5625rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-[0.9375rem] font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-px text-[0.625rem] font-normal text-muted-foreground">{unit}</span> : null}
      </span>
    </div>
  )
}

function DialogFooterRow({
  status,
  setNumber,
  onRemove,
  onDone,
  onChooseFile,
  onUpload,
  onDiscard,
  removing,
  submitting,
}: {
  status: "ready" | "uploading" | "staged" | "empty"
  setNumber: number
  onRemove: () => void
  onDone: () => void
  onChooseFile: () => void
  onUpload: () => void
  onDiscard: () => void
  removing: boolean
  submitting: boolean
}) {
  return (
    <div className="-mx-4 -mb-4 flex items-center gap-2 rounded-b-xl border-t bg-muted/50 px-4 py-3">
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {status === "ready" ? (
          <>
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Saved to set {setNumber}
          </>
        ) : status === "uploading" ? (
          <>
            <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
            Uploading…
          </>
        ) : status === "staged" ? (
          <>
            <span className="size-1.5 rounded-full bg-foreground" />
            Ready to upload to <b className="font-semibold text-foreground">set {setNumber}</b>
          </>
        ) : (
          <>
            <Info className="size-3" />
            Video attaches to <b className="font-semibold text-foreground">set {setNumber}</b>
          </>
        )}
      </div>
      <span className="flex-1" />
      {status === "ready" ? (
        <>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={removing}>
            <Trash2 className="size-3.5" />
            Remove
          </Button>
          <Button size="sm" onClick={onDone}>
            <Check className="size-3.5" />
            Done
          </Button>
        </>
      ) : status === "uploading" ? (
        <Button variant="outline" size="sm" disabled>
          Uploading…
        </Button>
      ) : status === "staged" ? (
        <>
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={submitting}>
            <Trash2 className="size-3.5" />
            Discard
          </Button>
          <Button size="sm" onClick={onUpload} disabled={submitting}>
            <UploadCloud className="size-3.5" />
            Upload to set {setNumber}
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={onChooseFile}>
          <UploadCloud className="size-3.5" />
          Choose file
        </Button>
      )}
    </div>
  )
}

// FormatWarning explains the common case where a browser can't decode an
// uploaded clip — almost always an iPhone HEVC (H.265) .mov, which Chrome and
// Firefox can't play even though the file is intact.
function FormatWarning({ staged }: { staged?: boolean }) {
  return (
    <p className="text-xs text-muted-foreground" role="status">
      This video can&rsquo;t be played in this browser &mdash; likely an iPhone HEVC
      (H.265) .mov, which Chrome and Firefox can&rsquo;t decode.{" "}
      {staged
        ? "You can still upload it; it will play on devices that support the format, such as Safari or iOS."
        : "The file is saved and will play in browsers that support the format, such as Safari or iOS."}
    </p>
  )
}
