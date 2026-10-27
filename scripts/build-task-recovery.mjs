import { build } from 'vite';
import { resolve } from 'node:path';

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
    lib: { entry: resolve('scripts/live-task-repair.ts'), name: 'ShiftTaskTimingRecovery', formats: ['iife'], fileName: () => 'task-timing-recovery.js' },
  },
});
