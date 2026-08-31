export function BrandMark({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <span className="brand-lockup">
      <svg aria-hidden="true" className="brand-symbol" viewBox="0 0 32 32" width="32" height="32">
        <path d="M5 5v7c0 2.2 1.8 4 4 4h4" />
        <path d="M13 16h5c2.2 0 4-1.8 4-4V7" />
        <path d="M13 16h5c2.2 0 4 1.8 4 4v7" />
        <path d="M13 16v11" />
        <path className="brand-symbol-stop" d="M3 5h4" />
        <path className="brand-symbol-verdict" d="m20 6 2 2 4-4" />
      </svg>
      {compact ? null : (
        <span className="brand-name">
          Port<span>Verdict</span>
        </span>
      )}
    </span>
  );
}
