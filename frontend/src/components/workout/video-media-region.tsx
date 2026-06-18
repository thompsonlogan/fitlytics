import { CircleCheck, Film, Repeat2, UploadCloud } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { type Exercise } from "@/lib/program-data"
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/hooks/use-set-videos"
import { type VideoResponse } from "@/services/generated"
import { fmtBytes, fmtTime, type StagedFile } from "@/components/workout/video-format"

function cnDrop(dragOver: boolean): string {
  return [
    "flex min-h-40 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed p-6 text-center text-muted-foreground transition-colors",
    dragOver
      ? "border-foreground border-solid bg-muted"
      : "border-border bg-background hover:border-ring hover:bg-muted",
  ].join(" ")
}

type VideoMediaRegionProps = {
  isUploading: boolean
  progress: number
  staged: StagedFile | undefined
  isReady: boolean
  currentVideo: VideoResponse | undefined
  erroredSrc: string | null
  setErroredSrc: (src: string | null) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  exercise: Exercise
  setIdx: number
  dragOver: boolean
  setDragOver: (over: boolean) => void
  onDrop: (e: React.DragEvent) => void
  localError: string | null
}

// VideoMediaRegion is the dialog's main visual: the uploading progress card,
// the staged-file preview, the saved-clip player, or the empty drop-zone —
// whichever the current state calls for. Purely presentational; all state and
// handlers live in VideoUploadDialog.
export function VideoMediaRegion({
  isUploading,
  progress,
  staged,
  isReady,
  currentVideo,
  erroredSrc,
  setErroredSrc,
  fileRef,
  exercise,
  setIdx,
  dragOver,
  setDragOver,
  onDrop,
  localError,
}: VideoMediaRegionProps) {
  return (
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
            aria-label={`Preview of ${staged.file.name} for set ${setIdx + 1}`}
            onError={() => setErroredSrc(staged.url)}
            className="aspect-video max-h-72 w-full rounded-md border bg-black"
          >
            {/* User-recorded lift clips ship without a caption file; an
                empty captions track satisfies the a11y contract without
                claiming captions that don't exist. */}
            <track kind="captions" />
          </video>
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
            aria-label={`${exercise.name} — set ${setIdx + 1} video`}
            onError={() => setErroredSrc(currentVideo.playbackUrl!)}
            className="aspect-video max-h-72 w-full rounded-md border bg-black"
          >
            <track kind="captions" />
          </video>
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
