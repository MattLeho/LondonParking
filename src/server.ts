import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

import { env } from './config/env.js';
import authPlugin from './http/plugins/auth.js';
import registerAdminRoutes from './http/routes/admin.js';
import registerHealthRoutes from './http/routes/health.js';
import registerLeaderboardRoutes from './http/routes/leaderboard.js';
import registerStreamRoutes from './http/routes/stream.js';
import registerTicketRoutes from './http/routes/tickets.js';
import './etl/workers/index.js';

const buildServer = () => {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
    },
    trustProxy: true,
  });

  app.register(sensible);
  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  app.register(cors, {
    origin: true,
    credentials: false,
  });
  app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    ban: 5,
    allowList: [],
  });

  app.register(authPlugin);

  app.register(registerHealthRoutes);
  app.register(registerTicketRoutes);
  app.register(registerLeaderboardRoutes);
  app.register(registerStreamRoutes);
  app.register(registerAdminRoutes);

  return app;
};

const start = async () => {
  const app = buildServer();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info({ port: env.PORT, host: env.HOST }, 'API listening');
  } catch (error) {
    app.log.error({ err: error }, 'failed to start server');
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}

export type AppServer = ReturnType<typeof buildServer>;
export { buildServer };
