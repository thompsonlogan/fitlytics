import { Check, Info, Trash2, UploadCloud, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { SetVideoPicker } from "@/components/workout/set-video-picker"
import { type EnsureSetLog, useVideoUpload } from "@/components/workout/use-video-upload"
import { VideoMediaRegion } from "@/components/workout/video-media-region"
import { type Exercise, type SetBlock } from "@/lib/program-data"
import { kgToLbRounded } from "@/lib/units"
import { type SetLogResponse, type VideoResponse } from "@/services/generated"

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
// All state + the upload lifecycle live in useVideoUpload; this is the view.
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
  const {
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
    fileRef,
    onPick,
    onDrop,
    handleOpenChange,
    handleRemove,
    confirmUpload,
    discardStaged,
    removing,
    submitting,
  } = useVideoUpload({
    block,
    blockLogs,
    videosBySetLogId,
    sessionId,
    initialSet,
    ensureSetLog,
    onOpenChange,
  })

  const loadUsedKg = blockLogs[0]?.actualLoadKg
  const loadUsed = loadUsedKg == null ? "—" : String(kgToLbRounded(loadUsedKg))

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
        <VideoMediaRegion
          isUploading={isUploading}
          progress={progress}
          staged={staged}
          isReady={isReady}
          currentVideo={currentVideo}
          erroredSrc={erroredSrc}
          setErroredSrc={setErroredSrc}
          fileRef={fileRef}
          exercise={exercise}
          setIdx={setIdx}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={onDrop}
          localError={localError}
        />

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
          <ContextCell label="Load" value={loadUsed} unit="lb" />
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
            onChange={(e) => setNoteDraft(e.target.value)}
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
          removing={removing}
          submitting={submitting}
        />

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          hidden
          aria-label="Choose a video file to upload"
          onChange={onPick}
        />
      </DialogContent>
    </Dialog>
  )
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
        {unit ? (
          <span className="ml-px text-[0.625rem] font-normal text-muted-foreground">{unit}</span>
        ) : null}
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
