import type { FastifyPluginCallback } from 'fastify';
import { onStreamEvent, type StreamEventName } from '../../lib/events.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

const formatEvent = (event: StreamEventName, data: Record<string, unknown> | string): string => {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
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
      const send = (event: StreamEventName, data: Record<string, unknown> | string) => {
        reply.raw.write(formatEvent(event, data));
      };

      send('heartbeat', { timestamp: new Date().toISOString() });

      const unsubscribers = (['ticket', 'patrol', 'leaderboard'] satisfies StreamEventName[]).map((event) =>
        onStreamEvent(event, (payload) => {
          send(event, payload);
        }),
      );

      const heartbeat = setInterval(() => {
        send('heartbeat', { timestamp: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribers.forEach((unsubscribe) => {
          unsubscribe();
        });

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
