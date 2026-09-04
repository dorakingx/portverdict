import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function decodeValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/gu, "\n");
  }
  return trimmed;
}

export async function loadLocalEnvironment(): Promise<void> {
  const file = path.resolve(process.cwd(), ".env.local");
  try {
    const metadata = await stat(file);
    if ((metadata.mode & 0o077) !== 0) {
      throw new Error(".env.local permissions must be 600 before live commands can read it.");
    }
    const text = await readFile(file, "utf8");
    for (const rawLine of text.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error(".env.local contains an invalid assignment.");
      const name = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
        throw new Error(".env.local contains an invalid variable name.");
      }
      if (process.env[name] === undefined)
        process.env[name] = decodeValue(line.slice(separator + 1));
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}
