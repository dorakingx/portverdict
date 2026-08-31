"use client";

export default function GlobalError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <html lang="en">
      <body>
        <main className="error-page">
          <p className="section-kicker">PortVerdict recovery boundary</p>
          <h1>The application shell could not be rendered.</h1>
          <p>No migration verdict has been changed or inferred because of this display failure.</p>
          <button className="button button--primary" type="button" onClick={reset}>
            Retry application
          </button>
        </main>
      </body>
    </html>
  );
}
