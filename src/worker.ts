/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { IngestResult } from './etl/workers/index.js';
import { ingestWorker } from './etl/workers/index.js';

if (!ingestWorker) {
  console.error('Redis connection not configured. Set REDIS_URL before starting the worker.');
  process.exit(1);
}

ingestWorker.on('ready', () => {
  console.log('Ingest worker ready');
});
ingestWorker.on('failed', (job, err) => {
  const jobId = job?.id ?? 'unknown';
  console.error('Ingest job failed', { jobId, err });
});
ingestWorker.on('completed', (job, result: IngestResult | undefined) => {
  const jobId = job?.id ?? 'unknown';
  console.log('Ingest job completed', { jobId, result });
});
