import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev`: the Gemma API routes run inside the Vite dev server, so one command starts everything.
// `vite build --mode preview`: one self-contained HTML file (no server) for a hosted preview.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'gemma-api',
      async configureServer(server) {
        const { apiMiddleware } = await import('./lib/routes.js');
        server.middlewares.use((req, res, next) => (req.url.startsWith('/api/') ? apiMiddleware(req, res, next) : next()));
      },
    },
    ...(mode === 'preview' ? [viteSingleFile()] : []),
  ],
  define: mode === 'preview' ? { 'import.meta.env.VITE_HOSTED_PREVIEW': '"1"' } : {},
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist' },
}));
