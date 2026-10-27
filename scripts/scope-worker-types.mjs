import { appendFileSync } from "node:fs";
// Generated runtime declarations must be a module: browser code needs DOM types.
appendFileSync(new URL("../worker-configuration.d.ts", import.meta.url),
  "\n// Keep Worker runtime declarations scoped away from browser DOM globals.\nexport type { D1Database, Fetcher, R2Bucket };\n");
