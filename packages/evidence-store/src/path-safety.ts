import path from "node:path";

import { EvidencePathError, EvidenceStoreError } from "./errors";

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value) || value === "." || value === "..") {
    throw new EvidenceStoreError(
      "INVALID_IDENTIFIER",
      `${label} must be 1-128 safe identifier characters`,
    );
  }
}

export function assertSafeRelativePath(value: string): void {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.posix.isAbsolute(value)
  ) {
    throw new EvidencePathError("Manifest paths must be non-empty POSIX relative paths");
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new EvidencePathError("Manifest paths cannot contain empty or traversal segments");
  }
}

export function resolveContainedPath(root: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  const relative = path.relative(resolvedRoot, resolved);

  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new EvidencePathError("Resolved path escapes its run directory");
  }

  return resolved;
}
