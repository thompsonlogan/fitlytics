import { useMutation, useQueryClient } from "@tanstack/react-query"

import { COACH_ROSTER_QUERY_KEY } from "@/hooks/use-coach-roster"
import { sessionVideosQueryKey } from "@/hooks/use-set-videos"
import { useServices } from "@/services/context"
import type { VideoResponse } from "@/services/generated"

export function useReviewVideo(sessionId: string | undefined) {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoId: string): Promise<VideoResponse> =>
      videosApi.apiVideosVideoIdReviewedPost({ videoId }),

    onSuccess: (updated) => {
      if (sessionId) {
        queryClient.setQueryData<VideoResponse[]>(sessionVideosQueryKey(sessionId), (prev) =>
          prev?.map((v) => (v.id === updated.id ? updated : v))
        )
      }
      void queryClient.invalidateQueries({ queryKey: COACH_ROSTER_QUERY_KEY })
    },
  })
}
