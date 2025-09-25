import { Queue } from 'bullmq';

import { env } from '../config/env.js';

export const INGEST_QUEUE_NAME = 'pcn-ingest';

type IngestPayload = {
  source: string;
};

const connection = env.REDIS_URL
  ? {
      url: env.REDIS_URL,
    }
  : undefined;

export const ingestQueue = connection
  ? new Queue<IngestPayload>(INGEST_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
  : null;

export const enqueueIngestJob = async (source: string) => {
  if (!ingestQueue) {
    return { enqueued: false, reason: 'redis-not-configured' as const };
  }

  const job = await ingestQueue.add('ingest-source', { source });
  return { enqueued: true, jobId: job.id } as const;
};
