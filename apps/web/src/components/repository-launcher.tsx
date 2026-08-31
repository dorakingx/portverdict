"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type ApiFailure = { detail?: string };

export function RepositoryLauncher() {
  const router = useRouter();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createRun(mode: "replay" | "live") {
    setBusy(true);
    setMessage(null);
    try {
      const payload =
        mode === "replay"
          ? {
              mode,
              source: { kind: "fixture", fixtureId: "fixture-weather-tool-migration" },
              idempotencyKey: crypto.randomUUID(),
            }
          : {
              mode,
              source: { kind: "github", url: repositoryUrl.trim() },
              idempotencyKey: crypto.randomUUID(),
            };
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { runId?: string } & ApiFailure;
      if (!response.ok || !result.runId) {
        setMessage(result.detail ?? "The run could not be created.");
        return;
      }
      router.push(`/runs/${result.runId}/workflow`);
    } catch {
      setMessage(
        "The run service is temporarily unavailable. The sample remains directly accessible.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createRun("live");
  }

  return (
    <form className="repository-launcher" onSubmit={submit} aria-describedby="launch-disclosure">
      <div className="repository-launcher__primary">
        <button
          className="button button--primary"
          type="button"
          disabled={busy}
          onClick={() => void createRun("replay")}
        >
          {busy ? "Preparing…" : "Run recorded sample"} <span aria-hidden="true">→</span>
        </button>
        <span>or inspect a public repository</span>
      </div>
      <div className="repository-launcher__input">
        <label htmlFor="repository-url">Public GitHub repository</label>
        <div>
          <input
            id="repository-url"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repository"
            value={repositoryUrl}
            maxLength={500}
            pattern="https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?"
            required
            onChange={(event) => setRepositoryUrl(event.target.value)}
          />
          <button className="button button--secondary" type="submit" disabled={busy}>
            Start live trial
          </button>
        </div>
      </div>
      <p id="launch-disclosure" className="repository-launcher__disclosure" aria-live="polite">
        {message ??
          "Replay needs no account. Live trials stay disabled until server-side sponsor credentials pass authenticated smoke checks."}
      </p>
    </form>
  );
}
