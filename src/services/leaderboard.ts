import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { DecoratedOfficerSequence, TicketPoint } from './leaderboard-sequences.js';
import { buildSequences, decorateSequences } from './leaderboard-sequences.js';

export type LeaderboardQuery = {
  borough?: string;
  since?: Date;
  until?: Date;
};

export type OfficerLeaderboardRow = DecoratedOfficerSequence;

export type StreetLeaderboardRow = {
  street: string;
  borough: string;
  tickets: number;
  estMinP: number;
  estMaxP: number;
};

type LeaderboardOptions = {
  dailySecret: string;
};

export const fetchOfficerLeaderboard = async (
  prisma: PrismaClient,
  query: LeaderboardQuery,
  options: LeaderboardOptions,
): Promise<OfficerLeaderboardRow[]> => {
  const { borough, since, until } = query;

  const conditions: Prisma.Sql[] = [Prisma.sql`t.geom IS NOT NULL`];
  if (borough) {
    conditions.push(Prisma.sql`t.borough = ${borough}`);
  }
  if (since) {
    conditions.push(Prisma.sql`t.issued_at >= ${since}`);
  }
  if (until) {
    conditions.push(Prisma.sql`t.issued_at <= ${until}`);
  }

  const whereClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.sql``;

  const points = await prisma.$queryRaw<TicketPoint[]>(Prisma.sql`
    SELECT
      t.id,
      t.borough,
      t.issued_at as "issuedAt",
      t.est_min_p as "estMinP",
      t.est_max_p as "estMaxP",
      jsonb_build_object(
        'lat', ST_Y(t.geom::geometry),
        'lon', ST_X(t.geom::geometry)
      ) as coordinate
    FROM pcn_ticket t
    ${whereClause}
    ORDER BY t.borough, DATE_TRUNC('day', t.issued_at), t.issued_at
  `);

  const sequences = buildSequences(points);

  return decorateSequences(sequences, options.dailySecret);
};

export const fetchStreetLeaderboard = async (
  prisma: PrismaClient,
  query: LeaderboardQuery,
): Promise<StreetLeaderboardRow[]> => {
  const { borough, since, until } = query;

  const conditions: Prisma.Sql[] = [Prisma.sql`t.street IS NOT NULL`];
  if (borough) {
    conditions.push(Prisma.sql`t.borough = ${borough}`);
  }
  if (since) {
    conditions.push(Prisma.sql`t.issued_at >= ${since}`);
  }
  if (until) {
    conditions.push(Prisma.sql`t.issued_at <= ${until}`);
  }

  const whereClause = Prisma.join(conditions, ' AND ');

  const rows = await prisma.$queryRaw<StreetLeaderboardRow[]>(Prisma.sql`
    SELECT
      t.street as street,
      t.borough,
      COUNT(*)::int as tickets,
      COALESCE(SUM(t.est_min_p), 0)::int as "estMinP",
      COALESCE(SUM(t.est_max_p), 0)::int as "estMaxP"
    FROM pcn_ticket t
    WHERE ${whereClause}
    GROUP BY t.street, t.borough
    ORDER BY COUNT(*) DESC, SUM(t.est_max_p) DESC
  `);

  return rows;
};
