import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import {
  type CreateVideoUploadResponse,
  type StoragePresignedUpload,
  type VideoResponse,
} from "@/services/generated"

// Pre-upload UX hints, configurable via Vite env (VITE_*). These only drive
// client-side validation messages and the dropzone caption — the server
// enforces the real limits regardless. Defaults match the backend defaults.
export const MAX_VIDEO_BYTES = Number(import.meta.env.VITE_MAX_VIDEO_BYTES) || 500 * 1024 * 1024

export const ALLOWED_VIDEO_TYPES: readonly string[] = import.meta.env.VITE_ALLOWED_VIDEO_TYPES
  ? import.meta.env.VITE_ALLOWED_VIDEO_TYPES.split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  : ["video/mp4", "video/quicktime", "video/webm"]

export function isAllowedVideoType(type: string, allowed?: string[]): boolean {
  return (allowed ?? (ALLOWED_VIDEO_TYPES as readonly string[])).includes(type)
}

// sessionVideosQueryKey scopes the per-session video list. Exported so callers
// can invalidate it after a mutation.
export const sessionVideosQueryKey = (sessionId: string) =>
  ["session-videos", sessionId] as const

// useSessionVideos loads every video attached to the session's sets in one
// request. Returns [] until a session exists. Videos rarely change outside the
// user's own actions, so a generous stale window avoids refetch churn.
export function useSessionVideos(sessionId: string | undefined) {
  const { videosApi } = useServices()

  return useQuery({
    queryKey: sessionId ? sessionVideosQueryKey(sessionId) : ["session-videos", "disabled"],
    enabled: !!sessionId,
    queryFn: (): Promise<VideoResponse[]> =>
      videosApi.apiSessionsSessionIdVideosGet({ sessionId: sessionId! }),
    staleTime: 60 * 1000,
  })
}

// Headers the browser sets itself and forbids scripts from setting. The signed
// upload only needs Content-Type from us; Content-Length is applied by the
// browser from the blob (and already matches the size we presigned with).
const FORBIDDEN_UPLOAD_HEADERS = new Set(["content-length", "host"])

// putToStorage performs the direct browser→R2 upload via XHR (fetch can't
// report upload progress). It replays exactly the signed headers the backend
// returned, minus the ones browsers won't let scripts set.
function putToStorage(
  upload: StoragePresignedUpload,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!upload.url) {
      reject(new Error("missing upload url"))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method || "PUT", upload.url, true)
    for (const [key, value] of Object.entries(upload.headers ?? {})) {
      if (FORBIDDEN_UPLOAD_HEADERS.has(key.toLowerCase())) continue
      xhr.setRequestHeader(key, value)
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`upload failed with status ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error("network error during upload"))
    xhr.send(file)
  })
}

// sessionId travels in the mutation vars (not a hook closure) so a video
// uploaded to a freshly-created session targets the right cache slot even
// before React has re-rendered with the new id.
export type UploadSetVideoVars = {
  sessionId: string
  setLogId: string
  file: File
  durationSec?: number
  note?: string
  onProgress?: (fraction: number) => void
}

// useUploadSetVideo runs the full upload lifecycle as one mutation:
// reserve (create) → direct PUT to storage → finalize. On success the session
// video list is invalidated so the table indicator + dialog reflect the new clip.
export function useUploadSetVideo() {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: UploadSetVideoVars): Promise<VideoResponse> => {
      const created: CreateVideoUploadResponse =
        await videosApi.apiSessionsSessionIdSetLogsSetLogIdVideosPost({
          sessionId: vars.sessionId,
          setLogId: vars.setLogId,
          body: {
            filename: vars.file.name,
            contentType: vars.file.type,
            sizeBytes: vars.file.size,
            durationSec: vars.durationSec,
            note: vars.note,
          },
        })

      if (!created.upload || !created.video?.id) {
        throw new Error("upload was not reserved")
      }

      await putToStorage(created.upload, vars.file, vars.onProgress)

      return videosApi.apiVideosVideoIdFinalizePost({ videoId: created.video.id })
    },
    // Reserving an upload replaces the previous video server-side before the
    // bytes move, so the list must be refetched even when the upload fails.
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(vars.sessionId) })
    },
  })
}

export type DeleteSetVideoVars = { sessionId: string; videoId: string }

export function useDeleteSetVideo() {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: DeleteSetVideoVars): Promise<void> => {
      await videosApi.apiVideosVideoIdDelete({ videoId: vars.videoId })
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(vars.sessionId) })
    },
  })
}

export type UpdateVideoNoteVars = { sessionId: string; videoId: string; note: string }

export function useUpdateVideoNote() {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: UpdateVideoNoteVars): Promise<VideoResponse> =>
      videosApi.apiVideosVideoIdPatch({ videoId: vars.videoId, body: { note: vars.note } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(vars.sessionId) })
    },
  })
}
