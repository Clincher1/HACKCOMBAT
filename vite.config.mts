import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';

const API_ROUTES = new Set([
  'telegram',
  'init',
  'click',
  'buy-card',
  'missions',
  'hire',
  'daily',
  'skin',
  'prestige',
  'leaderboard',
  'pets',
  'base',
  'tier',
  'track',
  'ping',
]);

/**
 * Dev-серверный адаптер Vercel Functions (/api/*):
 * В локальной разработке и Live Preview обрабатывает все /api/* через те же TypeScript-хендлеры,
 * что деплоятся на Vercel Serverless Functions.
 */
function vercelApiDevPlugin(): Plugin {
  return {
    name: 'vercel-api-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '';
        if (!rawUrl.startsWith('/api/')) {
          return next();
        }
        const routeName = rawUrl.replace(/^\/api\//, '').split('?')[0].replace(/\/$/, '');
        if (!API_ROUTES.has(routeName)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: `Unknown API route: /api/${routeName}` }));
          return;
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${routeName}.ts`);
          await mod.default(req, res);
        } catch (err) {
          console.error(`[API /api/${routeName}]`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Internal API error',
              })
            );
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), tailwindcss(), vercelApiDevPlugin()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            sdk: ['@telegram-apps/sdk-react', '@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
