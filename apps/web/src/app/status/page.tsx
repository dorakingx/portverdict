import Link from "next/link";

import { BrandMark } from "../../components/brand-mark";
import { StatusBadge } from "../../components/status-badge";
import { getReadinessSnapshot, type ReadinessState } from "../../lib/readiness";

export const dynamic = "force-dynamic";

const STATE_UI: Record<
  ReadinessState,
  { label: string; tone: "passed" | "live" | "warning" | "failed" }
> = {
  verified: { label: "Verified", tone: "passed" },
  "configured-unverified": { label: "Configured · unverified", tone: "live" },
  verifying: { label: "Verifying", tone: "live" },
  unconfigured: { label: "Unconfigured", tone: "warning" },
  stale: { label: "Stale", tone: "warning" },
  degraded: { label: "Degraded", tone: "failed" },
};

export default async function StatusPage() {
  const readiness = await getReadinessSnapshot();

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
        <strong>Overall state: {STATE_UI[readiness.overall].label}</strong>
        <p>
          {readiness.overall === "verified"
            ? `Run ${readiness.runId} was recorded with ${readiness.exactModelId}. Evidence expires ${readiness.expiresAt}; this is a one-run observation, not a statistical claim.`
            : "Only a fresh, integrity-checked promoted bundle can be labeled verified. Synthetic artifacts remain visibly marked as development fixtures."}
        </p>
      </aside>
    </main>
  );
}
