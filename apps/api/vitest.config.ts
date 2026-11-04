import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    root: './',
    // Integration tests run against the dev database; keep them serial so a
    // wipe-and-import in one file cannot race another.
    fileParallelism: false,
    // Set before any module is imported, so ThrottlerModule.forRoot sees it.
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
