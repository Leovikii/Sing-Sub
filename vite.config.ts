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
        // Merge small shared UI chunks without pulling deferred features into the entry.
        codeSplitting: {
          groups: [{
            name: 'mantine', test: /node_modules[\\/]@mantine[\\/]core/,
            entriesAware: true, entriesAwareMergeThreshold: 30_000,
          }],
        },
      },
    },
  },
});
