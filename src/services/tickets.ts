import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { Bbox } from '../lib/bounds.js';

export type TicketRow = {
  id: string;
  issuedAt: Date;
  borough: string;
  source: string;
  street: string | null;
  contravention: string | null;
  accuracy: string | null;
  estMinP: number | null;
  estMaxP: number | null;
  lat: number;
  lon: number;
};

export type TicketQuery = {
  bbox: Bbox;
  since?: Date;
  until?: Date;
  limit: number;
};

const ticketColumns = Prisma.sql`
  t.id,
  t.issued_at as "issuedAt",
  t.borough,
  t.source,
  t.street,
  t.desc as "contravention",
  t.accuracy,
  t.est_min_p as "estMinP",
  t.est_max_p as "estMaxP",
  ST_Y(t.geom::geometry) as "lat",
  ST_X(t.geom::geometry) as "lon"
`;

export const fetchTickets = async (
  prisma: PrismaClient,
  query: TicketQuery,
): Promise<TicketRow[]> => {
  const { bbox, since, until, limit } = query;

  const conditions = [
    Prisma.sql`ST_Intersects(t.geom::geometry, ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326))`,
  ];

  if (since) {
    conditions.push(Prisma.sql`t.issued_at >= ${since}`);
  }

  if (until) {
    conditions.push(Prisma.sql`t.issued_at <= ${until}`);
  }

  const where = Prisma.join(conditions, ' AND ');

  const rows = await prisma.$queryRaw<TicketRow[]>(Prisma.sql`
    SELECT ${ticketColumns}
    FROM pcn_ticket t
    WHERE ${where}
    ORDER BY t.issued_at DESC
    LIMIT ${limit}
  `);

  return rows;
};
