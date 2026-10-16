import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        // Keep the existing initial dependency set together; deferred routes/editor stay lazy.
        codeSplitting: {
          groups: [{ name: 'initial', tags: ['$initial'], priority: 2 }, {
            name: 'mantine', test: /node_modules[\\/]@mantine[\\/]core/,
            entriesAware: true, entriesAwareMergeThreshold: 30_000,
          }],
        },
      },
    },
  },
});
