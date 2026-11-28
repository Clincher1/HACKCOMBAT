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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  // v1.1: билд-флаг демо-витрины удалён вместе с самой витриной — define-ветки
  // больше нет, поэтому и мёртвых чанков в сборке не появляется.
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
            // v1.4: чанк `sdk` удалён вместе со статическим импортом Telegram SDK.
            // Он всё равно был отдельным файлом, но `index.html` его
            // modulepreload-ил, поэтому 23.2 kB gzip уезжали в стартовый payload.
            // Теперь `src/lib/telegram.ts` грузит SDK через import() перед первым
            // запросом к API, и Rollup кладёт его в ленивый чанк сам.
          },
        },
      },
    },
  };
});
