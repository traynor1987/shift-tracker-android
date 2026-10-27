import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only generated build output is removed. Source/public files, runtime state,
// and production/local tracker data live outside this directory.
export async function cleanGeneratedBuild(projectRoot) {
  await rm(join(resolve(projectRoot), "dist"), { recursive: true, force: true });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanGeneratedBuild(dirname(dirname(fileURLToPath(import.meta.url))));
}
