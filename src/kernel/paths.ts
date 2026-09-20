import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function projectRoot(): string {
  if (process.env.SIREFIK_ROOT) return process.env.SIREFIK_ROOT;
  return join(here, "..", "..");
}

export function publicDir(): string {
  if (process.env.SIREFIK_PUBLIC) return process.env.SIREFIK_PUBLIC;
  return join(projectRoot(), "public");
}

export function dataDir(): string {
  const dir = process.env.SIREFIK_DATA ?? join(projectRoot(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function uploadsDir(): string {
  const dir = join(dataDir(), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}
