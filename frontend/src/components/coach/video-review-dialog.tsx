import { useState } from "react"

import { Check, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { usePostCoachNote } from "@/hooks/use-coach-notes"
import { useReviewVideo } from "@/hooks/use-review-video"
import type { Exercise, SetBlock } from "@/lib/program-data"
import { cn } from "@/lib/utils"
import type { SetLogResponse, VideoResponse } from "@/services/generated"

type VideoReviewDialogProps = {
  open: boolean
  onClose: () => void
  exercise: Exercise
  exNum: number
  block: SetBlock
  blockLogs: SetLogResponse[]
  videosBySetLogId: Map<string, VideoResponse>
  sessionId: string | undefined
  linkId: string | undefined
}

export function VideoReviewDialog({
  open,
  onClose,
  exercise,
  exNum,
  block,
  blockLogs,
  videosBySetLogId,
  sessionId,
  linkId,
}: VideoReviewDialogProps) {
  const filmed = blockLogs
    .map((log, index) => ({ log, index, video: log.id ? videosBySetLogId.get(log.id) : undefined }))
    .filter((s) => s.video?.status === "ready")

  const [cursor, setCursor] = useState(0)
  const [feedback, setFeedback] = useState("")
  const [playbackFailed, setPlaybackFailed] = useState(false)

  const current = filmed[Math.min(cursor, filmed.length - 1)]
  const video = current?.video

  const reviewVideo = useReviewVideo(sessionId)
  const postNote = usePostCoachNote(linkId)

  const markReviewed = async () => {
    if (!video?.id) return
    try {
      await reviewVideo.mutateAsync(video.id)
    } catch {
      toast.error("Couldn't mark this clip reviewed. Try again.")
    }
  }

  const sendFeedback = async () => {
    const body = feedback.trim()
    if (!body || !video?.id) return
    try {
      await postNote.mutateAsync({ body, setVideoId: video.id })
      setFeedback("")
      toast.success("Feedback sent to the athlete.")
    } catch {
      toast.error("Couldn't send your feedback. Try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
              {exNum}
            </span>
            {exercise.name}
          </DialogTitle>
          <DialogDescription>
            {block.sets} × {block.reps}
            {block.prescribedLoad != null ? ` at ${block.prescribedLoad} lb` : ""}
            {block.rpe != null ? ` · RPE ${block.rpe}` : ""}
          </DialogDescription>
        </DialogHeader>

        {!current || !video ? (
          <p className="py-6 text-center text-[0.8125rem] text-muted-foreground">
            Nothing filmed on this block yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {playbackFailed || !video.playbackUrl ? (
              <div className="flex min-h-40 items-center justify-center rounded-md border bg-muted/40 p-6 text-center text-[0.8125rem] text-muted-foreground">
                This clip couldn't be played. The link may have expired — reopen the dialog to get a
                fresh one.
              </div>
            ) : (
              <video
                key={video.id}
                src={video.playbackUrl}
                controls
                playsInline
                onError={() => setPlaybackFailed(true)}
                className="max-h-80 w-full rounded-md bg-black"
              />
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.75rem] text-muted-foreground">
                Set {current.index + 1}
                {filmed.length > 1 ? ` · clip ${cursor + 1} of ${filmed.length}` : ""}
              </span>

              {filmed.length > 1 && (
                <span className="inline-flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cursor === 0}
                    aria-label="Previous clip"
                    onClick={() => {
                      setCursor((c) => Math.max(0, c - 1))
                      setPlaybackFailed(false)
                    }}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cursor >= filmed.length - 1}
                    aria-label="Next clip"
                    onClick={() => {
                      setCursor((c) => Math.min(filmed.length - 1, c + 1))
                      setPlaybackFailed(false)
                    }}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </span>
              )}
            </div>

            {video.note && (
              <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                <div className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
                  Athlete's note
                </div>
                <p className="mt-0.5 text-[0.8125rem] whitespace-pre-wrap">{video.note}</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Send feedback on this set…"
                aria-label="Feedback on this set"
                rows={2}
                className="resize-none text-[0.8125rem]"
              />
              <div className="flex items-center justify-between gap-2">
                {video.reviewedAt ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[0.75rem]",
                      "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    <CircleCheck className="size-3.5" />
                    Reviewed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void markReviewed()}
                    disabled={reviewVideo.isPending}
                  >
                    <Check className="size-3.5" />
                    Mark reviewed
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => void sendFeedback()}
                  disabled={!feedback.trim() || postNote.isPending}
                >
                  Send feedback
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
