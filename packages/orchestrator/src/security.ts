import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalJson,
  redactForPersistence,
  redactText,
  sha256CanonicalJson,
  type JsonValue,
} from "@portverdict/evidence-store";

export const PRIVATE_EVIDENCE_ROOT = path.resolve(process.cwd(), ".private", "evidence");
export const PUBLIC_EVIDENCE_ROOT = path.resolve(process.cwd(), "fixtures", "verified-live");
export const WEB_PUBLIC_EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  "apps",
  "web",
  "public",
  "evidence",
  "verified-live",
);

export function withIntegrity<T extends Record<string, unknown>>(
  value: T,
): T & { integritySha256: string } {
  const withoutIntegrity = { ...value };
  delete withoutIntegrity.integritySha256;
  return { ...value, integritySha256: sha256CanonicalJson(withoutIntegrity) };
}

export function verifyIntegrity(value: Record<string, unknown>): boolean {
  const supplied = value.integritySha256;
  const withoutIntegrity = { ...value };
  delete withoutIntegrity.integritySha256;
  return typeof supplied === "string" && supplied === sha256CanonicalJson(withoutIntegrity);
}

export function assertSanitized(value: unknown): void {
  const serialized = canonicalJson(value);
  const textRedaction = redactText(serialized);
  const structuredRedaction = redactForPersistence(JSON.parse(serialized) as JsonValue);
  if (
    textRedaction.findings > 0 ||
    textRedaction.value !== serialized ||
    structuredRedaction.findings > 0 ||
    canonicalJson(structuredRedaction.value) !== serialized
  ) {
    throw new Error("Evidence contains a secret-shaped value and cannot be persisted or promoted.");
  }
}

export async function writePrivateJson(
  runId: string,
  name: string,
  value: unknown,
): Promise<string> {
  assertSanitized(value);
  const directory = path.join(PRIVATE_EVIDENCE_ROOT, runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, name);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${canonicalJson(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export function expiresAt(recordedAt: string): string {
  return new Date(Date.parse(recordedAt) + 7 * 24 * 60 * 60 * 1_000).toISOString();
}
