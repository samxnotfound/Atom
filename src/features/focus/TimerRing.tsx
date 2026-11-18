import type { ReactNode } from "react";

interface TimerRingProps {
  /** 0..1; stopwatch passes null for an open-ended decorative ring. */
  progress: number | null;
  size?: number;
  children: ReactNode;
}

const STROKE = 10;

export function TimerRing({ progress, size = 280, children }: TimerRingProps) {
  const r = (size - STROKE * 2) / 2;
  const c = 2 * Math.PI * r;
  const shown = progress === null ? 0 : Math.min(1, Math.max(0, progress));
  const gradId = `ring-grad-${size}`;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5AB0FF" />
            <stop offset="100%" stopColor="#2F7BFF" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={STROKE}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          opacity={progress === null ? 0.35 : 1}
          style={{
            transition: "stroke-dashoffset 0.25s linear",
            filter: "drop-shadow(0 0 10px rgba(47,123,255,0.45))",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
