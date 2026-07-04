import { VideoUploadDialog } from "@/components/workout/video-upload-dialog"
import { type ProgramDay } from "@/lib/program-data"
import { type SessionResponse, type SetLogResponse, type VideoResponse } from "@/services/generated"

type BlockVideoDialogProps = {
  // dialog is the open request (which block row, which set to land on), or null
  // when nothing is open. Resolving it back to an exercise/block is shared by
  // both the desktop table and the mobile card list, so it lives here.
  dialog: { rowKey: string; initialSet: number } | null
  onClose: () => void
  day: ProgramDay
  session: SessionResponse | null | undefined
  blockLogsByKey: Map<string, SetLogResponse[]>
  videosBySetLogId: Map<string, VideoResponse>
  ensureSetLog: (
    rowKey: string,
    setIdx: number
  ) => Promise<{ sessionId: string; setLogId: string } | undefined>
}

// BlockVideoDialog resolves an open video request (rowKey `${exIdx}-${blIdx}`)
// to its exercise + block and renders the shared VideoUploadDialog. Returns
// null when closed or when the row can't be resolved.
export function BlockVideoDialog({
  dialog,
  onClose,
  day,
  session,
  blockLogsByKey,
  videosBySetLogId,
  ensureSetLog,
}: BlockVideoDialogProps) {
  if (!dialog) return null
  const [exIdx, blIdx] = dialog.rowKey.split("-").map(Number)
  const exercise = day.exercises?.[exIdx]
  const block = exercise?.blocks[blIdx]
  if (!exercise || !block) return null

  return (
    <VideoUploadDialog
      key={`${dialog.rowKey}:${dialog.initialSet}`}
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      sessionId={session?.id}
      exercise={exercise}
      exNum={exIdx + 1}
      block={block}
      blockLogs={blockLogsByKey.get(dialog.rowKey) ?? []}
      videosBySetLogId={videosBySetLogId}
      initialSet={dialog.initialSet}
      ensureSetLog={(setIdx) => ensureSetLog(dialog.rowKey, setIdx)}
    />
  )
}
