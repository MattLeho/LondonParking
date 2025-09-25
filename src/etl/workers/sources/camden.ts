import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { TicketRow } from '../../../services/tickets.js';

const SOURCE_ID = 'camden-open-data';

type CamdenFixture = {
  id: string;
  issuedAt: string;
  code: string;
  desc: string;
  level: 'higher' | 'lower';
  band: 'A' | 'B';
  estMinP: number;
  estMaxP: number;
  street: string;
  accuracy: 'kerbside' | 'approximate' | 'unknown';
  lat: number;
  lon: number;
};

const CAMDEN_FIXTURES: CamdenFixture[] = [
  {
    id: 'camden-2024-0001',
    issuedAt: '2024-02-01T08:12:00Z',
    code: '01',
    desc: 'Parked in a restricted street during prescribed hours',
    level: 'higher',
    band: 'A',
    estMinP: 6000,
    estMaxP: 13000,
    street: 'Camden High St',
    accuracy: 'kerbside',
    lat: 51.54123,
    lon: -0.14012,
  },
  {
    id: 'camden-2024-0002',
    issuedAt: '2024-02-01T09:15:00Z',
    code: '12',
    desc: 'Parked in a residents or shared use parking place without clearly displaying a valid permit',
    level: 'higher',
    band: 'A',
    estMinP: 6000,
    estMaxP: 13000,
    street: 'Bayham St',
    accuracy: 'approximate',
    lat: 51.53892,
    lon: -0.14231,
  },
  {
    id: 'camden-2024-0003',
    issuedAt: '2024-02-01T09:45:00Z',
    code: '05',
    desc: 'Parked after the expiry of paid for time',
    level: 'lower',
    band: 'B',
    estMinP: 4000,
    estMaxP: 8000,
    street: 'Eversholt St',
    accuracy: 'kerbside',
    lat: 51.53421,
    lon: -0.13452,
  },
];

export const ingestCamden = async (prisma: PrismaClient) => {
  const watermark = await prisma.ingestWatermark.findUnique({ where: { source: SOURCE_ID } });
  const lastIssued = watermark?.lastIssued ?? null;

  const batch = CAMDEN_FIXTURES.filter((ticket) => {
    if (!lastIssued) {
      return true;
    }
    return new Date(ticket.issuedAt) > lastIssued;
  }).sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());

  if (batch.length === 0) {
    await prisma.ingestWatermark.upsert({
      where: { source: SOURCE_ID },
      update: { lastSeenAt: new Date() },
      create: { source: SOURCE_ID, lastSeenAt: new Date() },
    });
    return { inserted: 0 as const };
  }

  let inserted = 0;

  const latestFixture =
    batch.at(-1) ?? (() => {
      throw new Error('Unexpected empty Camden batch.');
    })();

  await prisma.$transaction(async (tx) => {
    for (const ticket of batch) {
      const result = await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO pcn_ticket (id, source, borough, issued_at, code, "desc", level, band, est_min_p, est_max_p, street, accuracy, geom)
          VALUES (
            ${ticket.id},
            ${SOURCE_ID},
            ${'Camden'},
            ${ticket.issuedAt},
            ${ticket.code},
            ${ticket.desc},
            ${ticket.level},
            ${ticket.band},
            ${ticket.estMinP},
            ${ticket.estMaxP},
            ${ticket.street},
            ${ticket.accuracy},
            ST_SetSRID(ST_MakePoint(${ticket.lon}, ${ticket.lat}), 4326)::geography
          )
          ON CONFLICT (id) DO NOTHING
        `,
      );

      inserted += result;
    }

    const latestIssued = new Date(latestFixture.issuedAt);

    await tx.ingestWatermark.upsert({
      where: { source: SOURCE_ID },
      update: { lastIssued: latestIssued, lastSeenAt: new Date() },
      create: { source: SOURCE_ID, lastIssued: latestIssued, lastSeenAt: new Date() },
    });
  });

  const latestTicket: TicketRow = {
    id: latestFixture.id,
    issuedAt: new Date(latestFixture.issuedAt),
    borough: 'Camden',
    source: SOURCE_ID,
    street: latestFixture.street,
    contravention: latestFixture.desc,
    accuracy: latestFixture.accuracy,
    estMinP: latestFixture.estMinP,
    estMaxP: latestFixture.estMaxP,
    lat: latestFixture.lat,
    lon: latestFixture.lon,
  };

  return { inserted, latestTicket };
};
