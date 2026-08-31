import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  {
    name: "GitHub token",
    regex: /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/u },
  {
    name: "assigned credential",
    regex:
      /\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET)\s*=\s*["']?[A-Za-z0-9_./+=-]{24,}/u,
  },
];
const allowedFiles = new Set([".env.example"]);
const { stdout } = await execFileAsync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
    maxBuffer: 20_000_000,
  },
);
const findings = [];

for (const path of stdout.split("\0").filter(Boolean)) {
  if (allowedFiles.has(path)) continue;
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    continue;
  }
  if (bytes.length > 2_000_000 || bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) findings.push(`${path}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential repository secrets found:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Tracked and untracked repository-file secret heuristics passed. Run gitleaks when available.\n",
  );
}
