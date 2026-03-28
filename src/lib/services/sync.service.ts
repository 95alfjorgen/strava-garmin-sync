import { prisma } from '@/lib/db';
import { stravaService } from './strava.service';
import { garminService } from './garmin.service';
import { conversionService } from './conversion.service';
import type { SyncStatus, SyncRecord } from '@prisma/client';

export interface SyncResult {
  success: boolean;
  garminActivityId?: string;
  error?: string;
}

export class SyncService {
  private static instance: SyncService;

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Sync a single activity from Strava to Garmin
   */
  async syncActivity(
    userId: string,
    stravaActivityId: number,
    syncRecordId: string
  ): Promise<SyncResult> {
    // Update status to processing
    await this.updateSyncRecord(syncRecordId, {
      status: 'PROCESSING',
    });

    try {
      // Get valid Strava access token
      const accessToken = await stravaService.getValidAccessToken(userId);

      // Fetch activity details
      const activity = await stravaService.getActivity(accessToken, stravaActivityId);

      // Update record with activity info
      await this.updateSyncRecord(syncRecordId, {
        activityType: activity.sport_type || activity.type,
        activityName: activity.name,
      });

      // Fetch activity streams
      const streams = await stravaService.getActivityStreams(
        accessToken,
        stravaActivityId
      );

      // Convert to FIT format
      const fitFile = conversionService.convertToFit(activity, streams);
      const fileName = conversionService.generateFileName(activity);

      // Upload to Garmin
      const uploadResult = await garminService.uploadActivity(
        userId,
        fitFile,
        fileName
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Update record as completed
      await this.updateSyncRecord(syncRecordId, {
        status: 'COMPLETED',
        garminActivityId: uploadResult.activityId,
        syncedAt: new Date(),
        errorMessage: null,
      });

      return {
        success: true,
        garminActivityId: uploadResult.activityId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Increment retry count and update error
      const record = await prisma.syncRecord.findUnique({
        where: { id: syncRecordId },
        select: { retryCount: true },
      });

      const newRetryCount = (record?.retryCount || 0) + 1;
      const maxRetries = 3;

      await this.updateSyncRecord(syncRecordId, {
        status: newRetryCount >= maxRetries ? 'FAILED' : 'PENDING',
        errorMessage,
        retryCount: newRetryCount,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update a sync record
   */
  private async updateSyncRecord(
    id: string,
    data: {
      status?: SyncStatus;
      garminActivityId?: string | null;
      syncedAt?: Date | null;
      errorMessage?: string | null;
      retryCount?: number;
      activityType?: string;
      activityName?: string;
    }
  ): Promise<void> {
    await prisma.syncRecord.update({
      where: { id },
      data,
    });
  }

  /**
   * Get sync history for a user
   */
  async getSyncHistory(
    userId: string,
    options: { limit?: number; offset?: number; status?: SyncStatus } = {}
  ) {
    const { limit = 50, offset = 0, status } = options;

    const where: { userId: string; status?: SyncStatus } = { userId };
    if (status) {
      where.status = status;
    }

    const [records, total] = await Promise.all([
      prisma.syncRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.syncRecord.count({ where }),
    ]);

    return {
      records: records.map((r: SyncRecord) => ({
        ...r,
        stravaActivityId: r.stravaActivityId.toString(),
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get sync statistics for a user
   */
  async getSyncStats(userId: string) {
    const [total, completed, failed, pending] = await Promise.all([
      prisma.syncRecord.count({ where: { userId } }),
      prisma.syncRecord.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.syncRecord.count({ where: { userId, status: 'FAILED' } }),
      prisma.syncRecord.count({
        where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      }),
    ]);

    return { total, completed, failed, pending };
  }

  /**
   * Retry a failed sync
   */
  async retrySyncRecord(syncRecordId: string, userId: string): Promise<void> {
    const record = await prisma.syncRecord.findUnique({
      where: { id: syncRecordId },
    });

    if (!record || record.userId !== userId) {
      throw new Error('Sync record not found');
    }

    if (record.status !== 'FAILED') {
      throw new Error('Can only retry failed syncs');
    }

    // Reset status and queue for retry
    await prisma.syncRecord.update({
      where: { id: syncRecordId },
      data: {
        status: 'PENDING',
        errorMessage: null,
        retryCount: 0,
      },
    });

    // Import dynamically to avoid circular dependency
    const { addSyncJob } = await import('@/lib/queue');
    await addSyncJob({
      syncRecordId,
      userId,
      stravaActivityId: Number(record.stravaActivityId),
    });
  }

  /**
   * Manually trigger sync for an activity
   */
  async triggerManualSync(
    userId: string,
    stravaActivityId: number
  ): Promise<{ syncRecordId: string }> {
    // Check if already synced
    const existing = await prisma.syncRecord.findUnique({
      where: { stravaActivityId: BigInt(stravaActivityId) },
    });

    if (existing && existing.status === 'COMPLETED') {
      throw new Error('Activity already synced');
    }

    // Create or update sync record
    const syncRecord = existing
      ? await prisma.syncRecord.update({
          where: { id: existing.id },
          data: { status: 'PENDING', errorMessage: null },
        })
      : await prisma.syncRecord.create({
          data: {
            userId,
            stravaActivityId: BigInt(stravaActivityId),
            status: 'PENDING',
          },
        });

    // Process sync directly (no queue for now)
    // This runs synchronously but is simpler than setting up Redis
    await this.syncActivity(userId, stravaActivityId, syncRecord.id);

    return { syncRecordId: syncRecord.id };
  }
}

export const syncService = SyncService.getInstance();
