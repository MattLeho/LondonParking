import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { httpError } from '../../lib/http-error.js';

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

const baseQuerySchema = z
  .object({
    borough: z.string().min(1).optional(),
    since: isoDate.optional(),
    until: isoDate.optional(),
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

type LeaderboardEntry = {
  label: string;
  borough: string;
  tickets: number;
  estMinP: number;
  estMaxP: number;
};

type StreetEntry = LeaderboardEntry & { street: string };

const OFFICER_FIXTURES: LeaderboardEntry[] = [
  {
    label: 'Parking Officer 1',
    borough: 'Camden',
    tickets: 26,
    estMinP: 156000,
    estMaxP: 338000,
  },
  {
    label: 'Parking Officer 2',
    borough: 'Westminster',
    tickets: 19,
    estMinP: 114000,
    estMaxP: 247000,
  },
];

const STREET_FIXTURES: StreetEntry[] = [
  {
    label: 'Strand',
    street: 'Strand',
    borough: 'Westminster',
    tickets: 15,
    estMinP: 90000,
    estMaxP: 195000,
  },
  {
    label: 'Camden High St',
    street: 'Camden High St',
    borough: 'Camden',
    tickets: 12,
    estMinP: 72000,
    estMaxP: 156000,
  },
];

const filterByQuery = <T extends LeaderboardEntry>(
  rows: readonly T[],
  query: z.infer<typeof baseQuerySchema>,
): T[] => {
  return rows
    .filter((row) => (query.borough ? row.borough.toLowerCase() === query.borough.toLowerCase() : true))
    .slice()
    .sort((a, b) => b.estMaxP - a.estMaxP);
};

export const registerLeaderboardRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/leaderboard/officers',
    { preHandler: app.requireGuest, logLevel: 'warn' },
    (request) => {
      const parsed = baseQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        app.log.debug({ errors: parsed.error.issues }, 'invalid officer leaderboard query');
        throw httpError(400, 'Invalid query parameters');
      }

      const data = filterByQuery(OFFICER_FIXTURES, parsed.data).map((entry, index) => ({
        rank: index + 1,
        label: entry.label,
        borough: entry.borough,
        tickets: entry.tickets,
        estimatedPenaltyPence: { min: entry.estMinP, max: entry.estMaxP },
      }));

      return {
        data,
        meta: {
          count: data.length,
          borough: parsed.data.borough ?? null,
          since: parsed.data.since?.toISOString() ?? null,
          until: parsed.data.until?.toISOString() ?? null,
        },
      };
    },
  );

  app.get(
    '/api/leaderboard/streets',
    { preHandler: app.requireGuest, logLevel: 'warn' },
    (request) => {
      const parsed = baseQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        app.log.debug({ errors: parsed.error.issues }, 'invalid street leaderboard query');
        throw httpError(400, 'Invalid query parameters');
      }

      const data = filterByQuery(STREET_FIXTURES, parsed.data).map((entry, index) => ({
        rank: index + 1,
        street: entry.street,
        borough: entry.borough,
        tickets: entry.tickets,
        estimatedPenaltyPence: { min: entry.estMinP, max: entry.estMaxP },
      }));

      return {
        data,
        meta: {
          count: data.length,
          borough: parsed.data.borough ?? null,
          since: parsed.data.since?.toISOString() ?? null,
          until: parsed.data.until?.toISOString() ?? null,
        },
      };
    },
  );

  done();
};

export default registerLeaderboardRoutes;
