"use client";

import { BrandMark } from "../components/brand-mark";

export default function ApplicationError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="error-page">
      <BrandMark />
      <p className="section-kicker">Application boundary</p>
      <h1>The requested evidence view could not be rendered.</h1>
      <p>
        The failure was contained. Retry the view, or return to the previous verified run state.
      </p>
      {error.digest ? <code className="error-reference">Reference: {error.digest}</code> : null}
      <button className="button button--primary" type="button" onClick={reset}>
        Retry this view
      </button>
    </main>
  );
}
