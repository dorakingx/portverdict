import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

export const IdentifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");

export const RunIdSchema = IdentifierSchema;
export const CandidateIdSchema = IdentifierSchema;
export const EvidenceIdSchema = IdentifierSchema;
export const ArtifactIdSchema = IdentifierSchema;
export const EventKeySchema = IdentifierSchema;

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 digest");

export const GitCommitShaSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/, "Expected a full lowercase Git commit SHA");

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const HttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Only HTTPS URLs are accepted",
  });

export const RelativeArtifactPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.startsWith("/") && !value.includes("\\"), {
    message: "Artifact paths must be relative POSIX paths",
  })
  .refine((value) => value.split("/").every((segment) => segment !== ".." && segment !== ""), {
    message: "Artifact paths cannot traverse directories",
  });

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
