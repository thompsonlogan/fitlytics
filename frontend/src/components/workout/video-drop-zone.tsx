import { Camera, FolderOpen, UploadCloud, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/hooks/use-set-videos"
import { fmtBytes } from "@/components/workout/video-format"
import { cn } from "@/lib/utils"

type VideoDropZoneProps = {
  isMobile: boolean
  setNumber: number
  onBrowse: () => void
  onRecord: () => void
  dragOver: boolean
  setDragOver: (over: boolean) => void
  onDrop: (e: React.DragEvent) => void
}

export function VideoDropZone({
  isMobile,
  setNumber,
  onBrowse,
  onRecord,
  dragOver,
  setDragOver,
  onDrop,
}: VideoDropZoneProps) {
  const formats = `${ALLOWED_VIDEO_TYPES.map((t) => t.split("/")[1]?.toUpperCase()).join(", ")} · up to ${fmtBytes(MAX_VIDEO_BYTES)}`

  if (isMobile) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed bg-muted/40 px-4 py-5 text-center text-muted-foreground">
        <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
          <Video className="size-5" />
        </span>
        <span className="text-sm font-semibold text-foreground">Film set {setNumber}</span>
        <span className="text-[0.8125rem]">Record it now or pick a clip from your library</span>
        <div className="mt-2 mb-1 flex w-full gap-2">
          <Button className="h-11 flex-1" onClick={onRecord}>
            <Camera className="size-4" />
            Record
          </Button>
          <Button variant="outline" className="h-11 flex-1" onClick={onBrowse}>
            <FolderOpen className="size-4" />
            Library
          </Button>
        </div>
        <span className="text-[0.6875rem] opacity-80">{formats}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onBrowse}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex min-h-40 w-full flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed p-6 text-center text-muted-foreground transition-colors",
        dragOver
          ? "border-solid border-foreground bg-muted"
          : "border-border bg-background hover:border-ring hover:bg-muted"
      )}
    >
      <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
        <UploadCloud className="size-5.5" />
      </span>
      <span className="text-sm font-semibold text-foreground">Drag &amp; drop your lift video</span>
      <span className="text-[0.8125rem]">
        or <u className="underline-offset-2">browse files</u> to upload
      </span>
      <span className="mt-1 text-[0.6875rem] opacity-80">{formats}</span>
    </button>
  )
}
