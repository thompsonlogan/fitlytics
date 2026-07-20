import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import type { CoachNoteResponse } from "@/services/generated"

export const coachNotesQueryKey = (linkId: string) => ["coach-notes", linkId] as const

export type CoachNote = {
  id: string
  authorUserId: string
  authorName: string
  body: string
  createdAt: Date | null
  setVideoId: string | null
}

function toNote(row: CoachNoteResponse): CoachNote {
  return {
    id: row.id ?? "",
    authorUserId: row.authorUserId ?? "",
    authorName: row.authorName ?? "Unknown",
    body: row.body ?? "",
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    setVideoId: row.setVideoId ?? null,
  }
}

export function useCoachNotes(linkId: string | undefined) {
  const { coachingApi } = useServices()

  return useQuery({
    queryKey: linkId ? coachNotesQueryKey(linkId) : ["coach-notes", "disabled"],
    enabled: !!linkId,
    queryFn: async (): Promise<CoachNote[]> => {
      const rows = await coachingApi.apiCoachingLinksLinkIdNotesGet({ linkId: linkId! })
      return rows.map(toNote)
    },
    staleTime: 60 * 1000,
  })
}

export type PostNoteVars = {
  body: string
  setVideoId?: string
}

export function usePostCoachNote(linkId: string | undefined) {
  const { coachingApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: PostNoteVars): Promise<CoachNoteResponse> => {
      if (!linkId) throw new Error("missing link id")
      return coachingApi.apiCoachingLinksLinkIdNotesPost({
        linkId,
        request: { body: vars.body, setVideoId: vars.setVideoId },
      })
    },
    onSuccess: () => {
      if (!linkId) return
      void queryClient.invalidateQueries({ queryKey: coachNotesQueryKey(linkId) })
    },
  })
}
