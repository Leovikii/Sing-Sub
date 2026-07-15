import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [{
    name: 'text-yaml-modules',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.yml')) return null;
      return { code: `export default ${JSON.stringify(source)}`, map: null };
    },
  }],
  test: {
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
