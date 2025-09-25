import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { httpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import {
  fetchOfficerLeaderboard,
  fetchStreetLeaderboard,
} from '../../services/leaderboard.js';

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

export const registerLeaderboardRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    '/api/leaderboard/officers',
    { preHandler: app.requireGuest, logLevel: 'warn' },
    async (request) => {
      const parsed = baseQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        app.log.debug({ errors: parsed.error.issues }, 'invalid officer leaderboard query');
        throw httpError(400, 'Invalid query parameters');
      }

      const rows = await fetchOfficerLeaderboard(prisma, parsed.data, {
        dailySecret: env.LEADERBOARD_DAILY_SECRET,
      });

      const data = rows.map((entry) => ({
        rank: entry.rank,
        label: entry.label,
        borough: entry.borough,
        centroid: entry.centroid,
        tickets: entry.tickets,
        activity: {
          firstSeen: entry.firstSeen.toISOString(),
          lastSeen: entry.lastSeen.toISOString(),
        },
        estimatedPenaltyPence: {
          min: entry.estMinP,
          max: entry.estMaxP,
        },
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
    async (request) => {
      const parsed = baseQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        app.log.debug({ errors: parsed.error.issues }, 'invalid street leaderboard query');
        throw httpError(400, 'Invalid query parameters');
      }

      const rows = await fetchStreetLeaderboard(prisma, parsed.data);

      const data = rows.map((entry, index) => ({
        rank: index + 1,
        street: entry.street,
        borough: entry.borough,
        tickets: entry.tickets,
        estimatedPenaltyPence: {
          min: entry.estMinP,
          max: entry.estMaxP,
        },
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
