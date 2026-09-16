import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;

export default defineConfig({
  root: rootDir,
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        kyc: resolve(rootDir, 'kyc.html'),
      },
    },
  },
});
