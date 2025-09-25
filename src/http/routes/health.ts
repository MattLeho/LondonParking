import type { FastifyPluginCallback } from 'fastify';

export const registerHealthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/healthz',
    { logLevel: 'warn' },
    () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );

  done();
};

export default registerHealthRoutes;
