import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { httpError } from '../../lib/http-error.js';

const paramsSchema = z.object({
  source: z.string().min(1),
});

export const registerAdminRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.post(
    '/api/admin/ingest/:source',
    { preHandler: app.requireAdmin, logLevel: 'warn' },
    (request) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        app.log.debug({ errors: parsed.error.issues }, 'invalid admin ingest params');
        throw httpError(400, 'Invalid source parameter');
      }

      const { source } = parsed.data;

      return {
        status: 'accepted',
        source,
        queuedAt: new Date().toISOString(),
      };
    },
  );

  done();
};

export default registerAdminRoutes;
