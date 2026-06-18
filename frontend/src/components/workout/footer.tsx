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
      <a href="/changelog" className="text-muted-foreground hover:text-foreground">
        Changelog
      </a>
      <span className="text-border">·</span>
      <a href="/help" className="text-muted-foreground hover:text-foreground">
        Help
      </a>
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
