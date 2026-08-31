import Link from "next/link";

import { BrandMark } from "../components/brand-mark";

export default function NotFoundPage() {
  return (
    <main className="error-page">
      <BrandMark />
      <p className="section-kicker">404 · Route not found</p>
      <h1>This evidence path does not exist.</h1>
      <p>
        The requested run or evidence record is unavailable. No replacement value has been inferred.
      </p>
      <Link className="button button--primary" href="/">
        Return home
      </Link>
    </main>
  );
}
