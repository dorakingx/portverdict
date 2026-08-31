"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { segment: "workflow", label: "Workflow" },
  { segment: "compare", label: "Compare" },
  { segment: "report", label: "Report" },
] as const;

export function RunNavigation({ runId }: Readonly<{ runId: string }>) {
  const pathname = usePathname();

  return (
    <nav className="run-navigation" aria-label="Run views">
      {NAV_ITEMS.map((item) => {
        const href = `/runs/${encodeURIComponent(runId)}/${item.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link aria-current={active ? "page" : undefined} href={href} key={item.segment}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
