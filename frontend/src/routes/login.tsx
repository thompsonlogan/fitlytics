import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

// LoginPage is the unauthenticated landing screen. The "Sign in" button hands
// off to the backend's /auth/login endpoint, which 302s through WorkOS and
// eventually drops the user back at /today via /auth/callback.
//
// auth_error is set by the backend on a failed code exchange or CSRF mismatch
// (see backend/internal/handlers/auth.go) and surfaced here as a banner.
export function LoginPage({ authError }: { authError?: string }) {
  const { signIn } = useAuth()

  return (
    <div className="grid h-svh place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground">
          F
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Fitlytics</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Sign in to continue.</p>
        {authError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Sign-in failed: {authError}
          </p>
        )}
        <Button onClick={signIn} size="lg">
          Sign in
        </Button>
      </div>
    </div>
  )
}
