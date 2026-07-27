export const queryKeys = {
  me: ["me"] as const,
  program: {
    active: ["program", "active"] as const,
    byId: (programId: string) => ["program", programId] as const,
  },
  coachRoster: ["coach", "roster"] as const,
  coachNotes: {
    byLink: (linkId: string) => ["coach-notes", linkId] as const,
    disabled: ["coach-notes", "disabled"] as const,
  },
  session: {
    byDay: (programId: string, programDayId: string) =>
      ["session", programId, programDayId] as const,
    disabled: ["session", "disabled"] as const,
  },
  dayCompletions: {
    byProgram: (programId: string) => ["day-completions", programId] as const,
    disabled: ["day-completions", "disabled"] as const,
  },
  sessionVideos: {
    bySession: (sessionId: string) => ["session-videos", sessionId] as const,
    disabled: ["session-videos", "disabled"] as const,
  },
} as const
