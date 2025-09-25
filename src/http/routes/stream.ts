import type { FastifyPluginCallback } from 'fastify';

const HEARTBEAT_INTERVAL_MS = 30_000;

type StreamEvent = {
  event: string;
  data: Record<string, unknown> | string;
};

const formatEvent = (event: StreamEvent): string => {
  const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  return `event: ${event.event}\ndata: ${payload}\n\n`;
};

export const registerStreamRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/stream',
    { preHandler: app.requireGuest, logLevel: 'warn' },
    (request, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.hijack();

      const send = (event: StreamEvent) => {
        reply.raw.write(formatEvent(event));
      };

      send({ event: 'welcome', data: { message: 'connected', timestamp: new Date().toISOString() } });

      const heartbeat = setInterval(() => {
        send({ event: 'heartbeat', data: {} });
      }, HEARTBEAT_INTERVAL_MS);

      const close = () => {
        clearInterval(heartbeat);
        request.raw.off('close', close);
        request.raw.off('error', close);
      };

      request.raw.on('close', close);
      request.raw.on('error', close);
    },
  );

  done();
};

export default registerStreamRoutes;
