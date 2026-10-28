import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';

/**
 * Dev-серверный адаптер Vercel Functions (/api/*):
 * В локальной разработке и Live Preview обрабатывает все /api/* через тот же роутер,
 * что деплоится на Vercel одной catch-all функцией (api/[...path].ts -> api/_router.ts).
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
        try {
          const mod = await server.ssrLoadModule('/api/_router.ts');
          await mod.dispatchApiRequest(req, res);
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
            // Framer Motion is used by the desk and modal routes only. Do not
            // promote it into the entry preload: keep the first Telegram paint
            // free of animation code and load it with the route that needs it.
            sdk: ['@telegram-apps/sdk-react', '@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
