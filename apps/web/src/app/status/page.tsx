import Link from "next/link";

import { BrandMark } from "../../components/brand-mark";
import { StatusBadge } from "../../components/status-badge";
import { getReadinessSnapshot, type ReadinessState } from "../../lib/readiness";

export const dynamic = "force-dynamic";

const STATE_UI: Record<
  ReadinessState,
  { label: string; tone: "passed" | "live" | "warning" | "failed" }
> = {
  ready: { label: "Ready", tone: "passed" },
  configured: { label: "Configured · unverified", tone: "live" },
  unconfigured: { label: "Unconfigured", tone: "warning" },
  degraded: { label: "Degraded", tone: "failed" },
};

export default function StatusPage() {
  const readiness = getReadinessSnapshot();

  return (
    <main className="status-page">
      <header className="status-page__header">
        <Link aria-label="PortVerdict home" href="/">
          <BrandMark />
        </Link>
        <Link className="text-link" href="/">
          Back home
        </Link>
      </header>

      <section className="status-page__intro">
        <p className="section-kicker">Public readiness</p>
        <h1>Integration status</h1>
        <p>
          This page reports capability state without exposing credentials. Unconfigured services
          never masquerade as healthy live execution.
        </p>
      </section>

      <div className="service-list">
        {readiness.services.map((service) => {
          const stateUi = STATE_UI[service.state];

          return (
            <article key={service.id}>
              <div>
                <h2>{service.name}</h2>
                <p>{service.detail}</p>
              </div>
              <StatusBadge tone={stateUi.tone}>{stateUi.label}</StatusBadge>
            </article>
          );
        })}
      </div>

      <aside className="status-note">
        <strong>Honest replay policy</strong>
        <p>
          Until authenticated smoke tests succeed, all sample artifacts remain marked as development
          fixtures and no exact Token Factory model ID is claimed.
        </p>
      </aside>
    </main>
  );
}
