/// <reference types="vite/client" />

/**
 * v6.4: билд-тайм флаг демо-витрины. `false` в прод-сборке — тогда страница
 * /demo и её чанк не попадают в бандл (см. vite.config.mts).
 */
declare const __HK_DEMO__: boolean;
