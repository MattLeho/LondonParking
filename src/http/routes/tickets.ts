import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { parseBbox } from '../../lib/bounds.js';
import { httpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { fetchTickets } from '../../services/tickets.js';

const isoDate = z.string().transform((value, ctx) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid ISO 8601 datetime',
    });
    return z.NEVER;
  }

  return new Date(timestamp);
});

const querySchema = z
  .object({
    bbox: z.string().transform((value, ctx) => {
      try {
        return parseBbox(value);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: (error as Error).message,
          path: ['bbox'],
        });
        return z.NEVER;
      }
    }),
    since: isoDate.optional(),
    until: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(500),
  })
  .superRefine((value, ctx) => {
    if (value.since && value.until && value.since > value.until) {
      ctx.addIssue({
        code: 'custom',
        message: '`since` must be earlier than `until`',
        path: ['since'],
      });
    }
  });

export const registerTicketRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/tickets',
    {
      preHandler: app.requireGuest,
      logLevel: 'warn',
    },
    async (request) => {
      const parseResult = querySchema.safeParse(request.query);
      if (!parseResult.success) {
        app.log.debug({ errors: parseResult.error.issues }, 'invalid ticket query parameters');
        throw httpError(400, 'Invalid query parameters');
      }

      const { bbox, since, until, limit } = parseResult.data;

      const rows = await fetchTickets(prisma, { bbox, since, until, limit });

      const data = rows.map((ticket) => ({
        id: ticket.id,
        issuedAt: ticket.issuedAt.toISOString(),
        borough: ticket.borough,
        source: ticket.source,
        location: { lat: ticket.lat, lon: ticket.lon },
        street: ticket.street,
        contravention: ticket.contravention,
        accuracy: ticket.accuracy,
        estimatedPenaltyPence: {
          min: ticket.estMinP ?? 0,
          max: ticket.estMaxP ?? 0,
        },
      }));

      return {
        data,
        meta: {
          count: data.length,
          limit,
          bbox,
          since: since?.toISOString() ?? null,
          until: until?.toISOString() ?? null,
        },
      };
    },
  );

  done();
};

export default registerTicketRoutes;
