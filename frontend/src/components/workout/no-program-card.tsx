export function NoProgramCard() {
  return (
    <main className="grid flex-1 place-items-center px-6 py-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-base font-semibold">No program yet</h2>
        <p className="text-sm text-muted-foreground">
          Your account is ready, but there's no training program attached to it yet. Once a program
          is added to your account, your workouts will show up here.
        </p>
      </div>
    </main>
  )
}
