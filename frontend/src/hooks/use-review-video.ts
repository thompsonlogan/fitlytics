import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import type { VideoResponse } from "@/services/generated"
import { queryKeys } from "@/services/query-keys"

export function useReviewVideo(sessionId: string | undefined) {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (videoId: string): Promise<VideoResponse> =>
      videosApi.apiVideosVideoIdReviewedPost({ videoId }),

    onSuccess: (updated) => {
      if (sessionId) {
        queryClient.setQueryData<VideoResponse[]>(
          queryKeys.sessionVideos.bySession(sessionId),
          (prev) => prev?.map((v) => (v.id === updated.id ? updated : v))
        )
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachRoster })
    },
  })
}
