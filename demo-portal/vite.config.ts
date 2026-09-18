import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;

export default defineConfig({
  root: rootDir,
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        kyc: resolve(rootDir, 'kyc.html'),
        calibration: resolve(rootDir, 'calibration.html'),
        shadow: resolve(rootDir, 'shadow.html'),
        frames: resolve(rootDir, 'frames.html'),
        frameForm: resolve(rootDir, 'frame-form.html'),
        dynamic: resolve(rootDir, 'dynamic.html'),
        hidden: resolve(rootDir, 'hidden.html'),
        piiZoo: resolve(rootDir, 'pii-zoo.html'),
        search: resolve(rootDir, 'search.html'),
        injection: resolve(rootDir, 'injection.html'),
        login: resolve(rootDir, 'login.html'),
      },
    },
  },
});
