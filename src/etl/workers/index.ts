/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { Worker } from 'bullmq';

import { env } from '../../config/env.js';
import { publishStreamEvent } from '../../lib/events.js';
import { prisma } from '../../lib/prisma.js';
import type { TicketRow } from '../../services/tickets.js';
import { INGEST_QUEUE_NAME } from '../ingest-queue.js';
import { ingestCamden } from './sources/camden.js';

type IngestJob = {
  source: string;
};

type IngestResult = {
  inserted: number;
  latestTicket?: TicketRow;
};

const sources: Record<string, () => Promise<IngestResult>> = {
  camden: async () => ingestCamden(prisma),
};

const hasRedisConnection = typeof env.REDIS_URL === 'string' && env.REDIS_URL.length > 0;

export const ingestWorker = hasRedisConnection
  ? new Worker<IngestJob>(
      INGEST_QUEUE_NAME,
      async (job) => {
        const handler = sources[job.data.source];
        if (!handler) {
          throw new Error(`Unknown source ${job.data.source}`);
        }

        const result = await handler();
        if (result.latestTicket) {
          publishStreamEvent('ticket', {
            id: result.latestTicket.id,
            issuedAt: result.latestTicket.issuedAt.toISOString(),
            borough: result.latestTicket.borough,
            location: {
              lat: result.latestTicket.lat,
              lon: result.latestTicket.lon,
            },
          });
          publishStreamEvent('leaderboard', {
            scope: 'officers',
            borough: result.latestTicket.borough,
            updatedAt: new Date().toISOString(),
          });
        }
        return result;
      },
      {
        connection: { url: env.REDIS_URL ?? '' },
      },
    )
  : null;

export type { IngestResult };
