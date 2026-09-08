import { createInterface } from "node:readline";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

// Read the short-lived preview share capability from stdin, never command arguments/logs.
const reader = createInterface({ input: process.stdin, terminal: false });
let shareUrl;
for await (const line of reader) {
  shareUrl = new URL(line.trim());
  break;
}
reader.close();
if (!shareUrl || shareUrl.protocol !== "https:" || !shareUrl.hostname.endsWith(".vercel.app"))
  throw new Error("Expected a Vercel preview URL");
const directory = resolve(".private/evidence/preview-auth");
await mkdir(directory, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  headless: true,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(shareUrl.toString(), { waitUntil: "networkidle" });
  if (!(await page.title()).includes("PortVerdict"))
    throw new Error("Preview access did not reach PortVerdict");
  await context.storageState({ path: resolve(directory, "state.json") });
  console.log("Preview authentication state saved privately; no capability printed.");
} finally {
  await browser.close();
}
