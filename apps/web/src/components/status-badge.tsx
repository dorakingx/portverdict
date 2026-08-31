import type { ReactNode } from "react";

type StatusTone = "replay" | "live" | "passed" | "failed" | "warning" | "neutral";

const STATUS_ICONS: Record<StatusTone, ReactNode> = {
  replay: "◆",
  live: "●",
  passed: "✓",
  failed: "×",
  warning: "!",
  neutral: "○",
};

export function StatusBadge({
  children,
  tone,
}: Readonly<{ children: ReactNode; tone: StatusTone }>) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span aria-hidden="true">{STATUS_ICONS[tone]}</span>
      {children}
    </span>
  );
}
