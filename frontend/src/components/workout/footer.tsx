export function Footer() {
  return (
    <footer className="flex items-center gap-3 border-t bg-background px-5 py-1.5 text-[0.6875rem] text-muted-foreground">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <span>Synced</span>
      <span className="text-border">·</span>
      <span>Fitlytics v0.0.1</span>
      <span className="text-border">·</span>
      <span>Block 3, Mesocycle 2</span>
      <span className="flex-1" />
      {/* Placeholder destinations — rendered as plain text until the pages exist
          (a dead href="#" is a keyboard/accessibility trap). Swap to a Link or
          real href once Changelog / Help ship. */}
      <span>Changelog</span>
      <span className="text-border">·</span>
      <span>Help</span>
      <span className="text-border">·</span>
      <span>
        Press{" "}
        <kbd className="rounded-sm border bg-muted px-1 font-mono text-[0.625rem] text-muted-foreground">
          ?
        </kbd>{" "}
        for shortcuts
      </span>
    </footer>
  )
}
