import type { Queue, Worker, Job } from 'bullmq';

export interface SyncJobData {
  syncRecordId: string;
  userId: string;
  stravaActivityId: number;
}

// Re-export Job type for convenience
export type { Job };

// Singleton queue instance
let syncQueue: Queue<SyncJobData> | null = null;

// Dynamic import helper to avoid loading bullmq during build
async function loadBullMQ() {
  const [{ Queue: QueueClass, Worker: WorkerClass }, { default: Redis }] = await Promise.all([
    import('bullmq'),
    import('ioredis'),
  ]);
  return { Queue: QueueClass, Worker: WorkerClass, Redis };
}

export async function getSyncQueue(): Promise<Queue<SyncJobData>> {
  if (!syncQueue) {
    const { Queue, Redis } = await loadBullMQ();
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    syncQueue = new Queue<SyncJobData>('activity-sync', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 1000,
        },
        removeOnFail: {
          count: 500,
        },
      },
    });
  }
  return syncQueue;
}

/**
 * Add a sync job to the queue
 */
export async function addSyncJob(data: SyncJobData): Promise<Job<SyncJobData>> {
  const queue = await getSyncQueue();
  return queue.add('sync', data, {
    jobId: `sync-${data.stravaActivityId}`,
  });
}

/**
 * Create a worker to process sync jobs
 * This is called from the worker process
 */
export async function createSyncWorker(
  processor: (job: Job<SyncJobData>) => Promise<void>
): Promise<Worker<SyncJobData>> {
  const { Worker, Redis } = await loadBullMQ();
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<SyncJobData>('activity-sync', processor, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job: Job<SyncJobData>) => {
    console.log(`Job ${job.id} completed for activity ${job.data.stravaActivityId}`);
  });

  worker.on('failed', (job: Job<SyncJobData> | undefined, err: Error) => {
    console.error(
      `Job ${job?.id} failed for activity ${job?.data.stravaActivityId}:`,
      err.message
    );
  });

  worker.on('error', (err: Error) => {
    console.error('Worker error:', err);
  });

  return worker;
}

/**
 * Close queue connections (for graceful shutdown)
 */
export async function closeQueue(): Promise<void> {
  if (syncQueue) {
    await syncQueue.close();
    syncQueue = null;
  }
}
