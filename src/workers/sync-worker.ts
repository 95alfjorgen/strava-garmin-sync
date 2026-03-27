import 'dotenv/config';
import { createSyncWorker, type SyncJobData, type Job } from '@/lib/queue';
import { syncService } from '@/lib/services/sync.service';

async function main() {
  console.log('Starting sync worker...');

  const worker = await createSyncWorker(async (job: Job<SyncJobData>) => {
    const { syncRecordId, userId, stravaActivityId } = job.data;

    console.log(`Processing sync job for activity ${stravaActivityId}`);

    const result = await syncService.syncActivity(
      userId,
      stravaActivityId,
      syncRecordId
    );

    if (!result.success) {
      throw new Error(result.error || 'Sync failed');
    }

    console.log(
      `Successfully synced activity ${stravaActivityId} to Garmin (${result.garminActivityId})`
    );
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down worker...');
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('Sync worker is ready and waiting for jobs...');
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
