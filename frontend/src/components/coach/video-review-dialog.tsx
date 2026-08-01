import { useState } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronLeft, ChevronRight, CircleCheck, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { MAX_NOTE_LENGTH } from "@/hooks/use-coach-notes"
import { usePostCoachNote } from "@/hooks/use-coach-notes"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useReviewVideo } from "@/hooks/use-review-video"
import { sessionVideosQueryKey } from "@/hooks/use-set-videos"
import { formatReps, type Exercise, type SetBlock } from "@/lib/program-data"
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
  const filmed = blockLogs.flatMap((log, index) => {
    const video = log.id ? videosBySetLogId.get(log.id) : undefined
    return video?.status === "ready" ? [{ log, index, video }] : []
  })

  const isMobile = useIsMobile()

  const [cursor, setCursor] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [playbackFailed, setPlaybackFailed] = useState(false)

  const current = filmed[Math.min(cursor, filmed.length - 1)]
  const video = current?.video
  const videoId = video?.id ?? ""
  const feedback = drafts[videoId] ?? ""

  const queryClient = useQueryClient()
  const reviewVideo = useReviewVideo(sessionId)
  const postNote = usePostCoachNote(linkId)

  const step = (delta: number) => {
    setCursor((c) => Math.min(filmed.length - 1, Math.max(0, c + delta)))
    setPlaybackFailed(false)
  }

  const retryPlayback = () => {
    setPlaybackFailed(false)
    if (sessionId) {
      void queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(sessionId) })
    }
  }

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
      setDrafts((d) => ({ ...d, [video.id!]: "" }))
      toast.success("Feedback sent to the athlete.")
    } catch {
      toast.error("Couldn't send your feedback. Try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent layout="sheet" className="md:max-w-lg">
        <DialogHeader className="px-4 pt-2.5 md:px-0 md:pt-0">
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
              {exNum}
            </span>
            {exercise.name}
          </DialogTitle>
          <DialogDescription>
            {block.sets} × {formatReps(block.repsMin, block.repsMax)}
            {block.prescribedLoad != null ? ` at ${block.prescribedLoad} lb` : ""}
            {block.rpe != null ? ` · RPE ${block.rpe}` : ""}
          </DialogDescription>
        </DialogHeader>

        {!current || !video ? (
          <p className="px-4 py-6 text-center text-[0.8125rem] text-muted-foreground md:px-0">
            Nothing filmed on this block yet.
          </p>
        ) : (
          <div className="contents md:flex md:flex-col md:gap-3">
            <DialogBody className="gap-3">
              {playbackFailed || !video.playbackUrl ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-md border bg-muted/40 p-6 text-center text-[0.8125rem] text-muted-foreground">
                  <span>This clip couldn't be played — its link may have expired.</span>
                  <Button size="sm" variant="outline" onClick={retryPlayback}>
                    <RotateCw className="size-3.5" />
                    Retry
                  </Button>
                </div>
              ) : (
                <video
                  key={video.id}
                  src={video.playbackUrl}
                  controls
                  playsInline
                  onError={() => setPlaybackFailed(true)}
                  className="aspect-[4/3] max-h-80 w-full rounded-md bg-black md:aspect-auto"
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
                      onClick={() => step(-1)}
                      className="h-9 w-11 md:h-8 md:w-auto"
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cursor >= filmed.length - 1}
                      aria-label="Next clip"
                      onClick={() => step(1)}
                      className="h-9 w-11 md:h-8 md:w-auto"
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

              <Textarea
                value={feedback}
                onChange={(e) => setDrafts((d) => ({ ...d, [videoId]: e.target.value }))}
                placeholder="Send feedback on this set…"
                aria-label="Feedback on this set"
                rows={2}
                maxLength={MAX_NOTE_LENGTH}
                className="resize-none text-base md:text-[0.8125rem]"
              />
            </DialogBody>

            <div
              className="flex items-center justify-between gap-2 border-t bg-muted/50 px-4 py-3 md:border-0 md:bg-transparent md:px-0 md:py-0 [&>button]:h-11 [&>button]:flex-1 md:[&>button]:h-8 md:[&>button]:flex-none"
              style={
                isMobile
                  ? { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }
                  : undefined
              }
            >
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
        )}
      </DialogContent>
    </Dialog>
  )
}
