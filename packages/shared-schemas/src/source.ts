import { z } from "zod";

import {
  GitCommitShaSchema,
  HttpsUrlSchema,
  IdentifierSchema,
  Sha256Schema,
} from "./primitives.js";

export const FixtureSourceRequestSchema = z
  .object({
    kind: z.literal("fixture"),
    fixtureId: IdentifierSchema,
  })
  .strict();

export const GitHubRepositoryUrlSchema = HttpsUrlSchema.superRefine((value, context) => {
  const url = new URL(value);
  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (url.hostname.toLowerCase() !== "github.com") {
    context.addIssue({ code: "custom", message: "Expected an exact github.com host" });
  }

  if (url.username || url.password || url.search || url.hash || segments.length !== 2) {
    context.addIssue({
      code: "custom",
      message: "Expected a canonical public GitHub repository URL",
    });
  }
  if (segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) {
    context.addIssue({ code: "custom", message: "Repository path contains invalid characters" });
  }
});

export const GitHubSourceRequestSchema = z
  .object({
    kind: z.literal("github"),
    url: GitHubRepositoryUrlSchema,
  })
  .strict();

export const SourceRequestSchema = z.discriminatedUnion("kind", [
  FixtureSourceRequestSchema,
  GitHubSourceRequestSchema,
]);

export const FixtureSourceRevisionSchema = z
  .object({
    kind: z.literal("fixture"),
    fixtureId: IdentifierSchema,
    revision: IdentifierSchema,
    displayName: z.string().trim().min(1).max(160),
    contentSha256: Sha256Schema,
  })
  .strict();

export const GitHubSourceRevisionSchema = z
  .object({
    kind: z.literal("github"),
    url: GitHubRepositoryUrlSchema,
    owner: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/),
    repository: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/),
    commitSha: GitCommitShaSchema,
    archiveSha256: Sha256Schema,
  })
  .strict()
  .superRefine((source, context) => {
    const [urlOwner, urlRepositoryWithSuffix] = new URL(source.url).pathname
      .split("/")
      .filter(Boolean);
    const urlRepository = urlRepositoryWithSuffix?.replace(/\.git$/, "");
    if (
      urlOwner?.toLowerCase() !== source.owner.toLowerCase() ||
      urlRepository?.toLowerCase() !== source.repository.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "Resolved owner and repository must match the canonical URL",
      });
    }
  });

export const SourceRevisionSchema = z.discriminatedUnion("kind", [
  FixtureSourceRevisionSchema,
  GitHubSourceRevisionSchema,
]);

export type FixtureSourceRequest = z.infer<typeof FixtureSourceRequestSchema>;
export type GitHubSourceRequest = z.infer<typeof GitHubSourceRequestSchema>;
export type SourceRequest = z.infer<typeof SourceRequestSchema>;
export type FixtureSourceRevision = z.infer<typeof FixtureSourceRevisionSchema>;
export type GitHubSourceRevision = z.infer<typeof GitHubSourceRevisionSchema>;
export type SourceRevision = z.infer<typeof SourceRevisionSchema>;

export function sourceRevisionId(source: SourceRevision): string {
  return source.kind === "fixture" ? source.revision : source.commitSha;
}
