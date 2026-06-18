import { Activity, Dumbbell, Flame, Hexagon, Shield, Zap } from "lucide-react"

import { Wrap } from "@/components/landing/wrap"

const LOGOS = [
  { Icon: Dumbbell, label: "IronType" },
  { Icon: Flame, label: "Apex Barbell" },
  { Icon: Hexagon, label: "Forge Lab" },
  { Icon: Activity, label: "Tempo Co." },
  { Icon: Shield, label: "Strenuus" },
  { Icon: Zap, label: "Voltage" },
]

export function LogosStrip() {
  return (
    <section className="pt-[clamp(3rem,6vw,4.5rem)]">
      <Wrap>
        <p className="mb-7 text-center text-[0.8125rem] text-muted-foreground">
          Trusted by lifters, coaches, and barbell clubs everywhere
        </p>
        <div className="flex flex-wrap items-center justify-center gap-[clamp(1.5rem,5vw,3.5rem)] opacity-70">
          {LOGOS.map(({ Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-[0.4375rem] text-lg font-semibold tracking-[-0.02em] text-foreground [&_svg]:size-5"
            >
              <Icon /> {label}
            </span>
          ))}
        </div>
      </Wrap>
    </section>
  )
}
