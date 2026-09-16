import { defineConfig } from 'vite';

/**
 * A second dev server instance (port 5175) so frames.html can embed a genuinely cross-origin
 * iframe (same machine, different port = different origin) for the Stage 1 frame-mapping tests.
 * Serves the exact same files as the main portal — only `frame-form.html` is actually used from
 * here, but there's no reason to duplicate the directory for that.
 */
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
});
