import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { parseBbox } from '../../lib/bounds.js';
import { httpError } from '../../lib/http-error.js';

const isoDate = z.iso.datetime().transform((value) => new Date(value));

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

type TicketRecord = {
  id: string;
  issuedAt: Date;
  lat: number;
  lon: number;
  borough: string;
  source: string;
  street: string | null;
  contravention: string;
  accuracy: 'kerbside' | 'approximate' | 'unknown';
  estMinP: number;
  estMaxP: number;
};

const TICKET_FIXTURES: TicketRecord[] = [
  {
    id: 'camden-2024-0001',
    issuedAt: new Date('2024-02-01T08:12:00Z'),
    lat: 51.54123,
    lon: -0.14012,
    borough: 'Camden',
    source: 'camden-open-data',
    street: 'Camden High St',
    contravention: 'Parked in a restricted street during prescribed hours',
    accuracy: 'kerbside',
    estMinP: 6000,
    estMaxP: 13000,
  },
  {
    id: 'westminster-2024-0002',
    issuedAt: new Date('2024-02-01T09:45:00Z'),
    lat: 51.51211,
    lon: -0.12763,
    borough: 'Westminster',
    source: 'westminster-open-data',
    street: 'Strand',
    contravention: 'Parked without clearly displaying a valid pay & display ticket',
    accuracy: 'approximate',
    estMinP: 4000,
    estMaxP: 8000,
  },
];

const withinBbox = (bbox: ReturnType<typeof parseBbox>, ticket: TicketRecord) => {
  return (
    ticket.lon >= bbox.west &&
    ticket.lon <= bbox.east &&
    ticket.lat >= bbox.south &&
    ticket.lat <= bbox.north
  );
};

export const registerTicketRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/tickets',
    {
      preHandler: app.requireGuest,
      logLevel: 'warn',
    },
    (request) => {
      const parseResult = querySchema.safeParse(request.query);
      if (!parseResult.success) {
        app.log.debug({ errors: parseResult.error.issues }, 'invalid ticket query parameters');
        throw httpError(400, 'Invalid query parameters');
      }

      const { bbox, since, until, limit } = parseResult.data;

      const filtered = TICKET_FIXTURES.filter((ticket) => {
        if (!withinBbox(bbox, ticket)) {
          return false;
        }

        if (since && ticket.issuedAt < since) {
          return false;
        }

        if (until && ticket.issuedAt > until) {
          return false;
        }

        return true;
      })
        .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
        .slice(0, limit)
        .map((ticket) => ({
          id: ticket.id,
          issuedAt: ticket.issuedAt.toISOString(),
          borough: ticket.borough,
          source: ticket.source,
          location: { lat: ticket.lat, lon: ticket.lon },
          street: ticket.street,
          contravention: ticket.contravention,
          accuracy: ticket.accuracy,
          estimatedPenaltyPence: { min: ticket.estMinP, max: ticket.estMaxP },
        }));

      return {
        data: filtered,
        meta: {
          count: filtered.length,
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
