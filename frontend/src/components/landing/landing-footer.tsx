import { Link } from "@tanstack/react-router"

import { Wrap } from "@/components/landing/wrap"
import { Separator } from "@/components/ui/separator"

const SOCIAL = "inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&_svg]:size-4"
const COL_LINK = "block py-[0.3125rem] text-sm text-muted-foreground transition-colors hover:text-foreground"
const LEGAL_LINK = "text-[0.8125rem] text-muted-foreground hover:text-foreground"

export function LandingFooter() {
  return (
    <footer className="border-t border-border pt-[clamp(3rem,6vw,4.5rem)] pb-8">
      <Wrap>
        <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-8 max-[980px]:grid-cols-2">
          <div className="max-[980px]:col-span-full">
            <a className="mb-4 inline-flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.01em]" href="#top">
              <span className="inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-sm bg-primary text-sm font-bold text-primary-foreground">
                F
              </span>
              <span>Fitlytics</span>
            </a>
            <p className="max-w-[28ch] text-sm leading-[1.55] text-muted-foreground">
              The training system for lifters who log. Track, build, and analyze every block.
            </p>
            <div className="mt-5 flex gap-2">
              <a href="/x" aria-label="X" className={SOCIAL}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
                </svg>
              </a>
              <a href="/instagram" aria-label="Instagram" className={SOCIAL}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="/youtube" aria-label="YouTube" className={SOCIAL}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.5 6.5a3.02 3.02 0 0 0-2.12-2.14C19.5 3.85 12 3.85 12 3.85s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51A3.02 3.02 0 0 0 23.5 17.5C24 15.6 24 12 24 12s0-3.6-.5-5.5ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
                </svg>
              </a>
              <a href="/github" aria-label="GitHub" className={SOCIAL}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <h4 className="mb-[0.875rem] text-[0.8125rem] font-semibold tracking-[0.01em]">Product</h4>
            <a href="#tracking" className={COL_LINK}>Tracking</a>
            <a href="#builder" className={COL_LINK}>Program builder</a>
            <a href="#analytics" className={COL_LINK}>Analytics</a>
            <a href="#pricing" className={COL_LINK}>Pricing</a>
            <Link to="/today" className={COL_LINK}>Open app</Link>
          </div>
          <div>
            <h4 className="mb-[0.875rem] text-[0.8125rem] font-semibold tracking-[0.01em]">Resources</h4>
            <a href="/exercises" className={COL_LINK}>Exercise library</a>
            <a href="/templates" className={COL_LINK}>Program templates</a>
            <a href="/coaching" className={COL_LINK}>Coaching guide</a>
            <a href="/changelog" className={COL_LINK}>Changelog</a>
          </div>
          <div>
            <h4 className="mb-[0.875rem] text-[0.8125rem] font-semibold tracking-[0.01em]">Company</h4>
            <a href="/about" className={COL_LINK}>About</a>
            <a href="/blog" className={COL_LINK}>Blog</a>
            <a href="/careers" className={COL_LINK}>Careers</a>
            <a href="/contact" className={COL_LINK}>Contact</a>
          </div>
          <div>
            <h4 className="mb-[0.875rem] text-[0.8125rem] font-semibold tracking-[0.01em]">Legal</h4>
            <a href="/privacy" className={COL_LINK}>Privacy</a>
            <a href="/terms" className={COL_LINK}>Terms</a>
            <a href="/security" className={COL_LINK}>Security</a>
          </div>
        </div>
        <Separator className="mt-[clamp(2.5rem,5vw,3.5rem)]" />
        <div className="flex flex-wrap items-center gap-4 pt-6">
          <span className="text-[0.8125rem] text-muted-foreground">© 2026 Fitlytics. All rights reserved.</span>
          <span className="flex-1" />
          <span className="flex gap-5">
            <a href="/privacy" className={LEGAL_LINK}>Privacy</a>
            <a href="/terms" className={LEGAL_LINK}>Terms</a>
            <a href="/status" className={LEGAL_LINK}>Status</a>
          </span>
        </div>
      </Wrap>
    </footer>
  )
}
