#!/usr/bin/env tsx
/**
 * Strava to Garmin Sync Script
 *
 * Syncs recent Strava activities to Garmin Connect.
 *
 * Usage:
 *   npm run sync
 *   # or
 *   npx tsx scripts/sync.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';
import { StravaService } from '../src/services/strava';
import { GarminService } from '../src/services/garmin';
import { convertToFit, generateFileName } from '../src/services/conversion';

interface SyncedActivity {
  garminId: number;
  syncedAt: string;
  name: string;
}

interface SyncHistory {
  syncedActivities: Record<string, SyncedActivity>;
  lastSync: string | null;
}

const HISTORY_FILE = 'sync-history.json';

function loadSyncHistory(dataDir: string): SyncHistory {
  const historyPath = path.join(dataDir, HISTORY_FILE);

  if (!fs.existsSync(historyPath)) {
    return {
      syncedActivities: {},
      lastSync: null,
    };
  }

  const content = fs.readFileSync(historyPath, 'utf-8');
  return JSON.parse(content);
}

function saveSyncHistory(dataDir: string, history: SyncHistory): void {
  const historyPath = path.join(dataDir, HISTORY_FILE);

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

function updateEnvFile(credentials: { accessToken: string; refreshToken: string; expiresAt: number }): void {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    console.log('Warning: .env file not found, cannot update tokens');
    return;
  }

  let content = fs.readFileSync(envPath, 'utf-8');

  content = content.replace(/STRAVA_ACCESS_TOKEN=.*/, `STRAVA_ACCESS_TOKEN=${credentials.accessToken}`);
  content = content.replace(/STRAVA_REFRESH_TOKEN=.*/, `STRAVA_REFRESH_TOKEN=${credentials.refreshToken}`);
  content = content.replace(/STRAVA_TOKEN_EXPIRES_AT=.*/, `STRAVA_TOKEN_EXPIRES_AT=${credentials.expiresAt}`);

  fs.writeFileSync(envPath, content);
  console.log('Updated .env file with new Strava tokens');
}

async function main() {
  console.log('\n🔄 Strava to Garmin Sync\n');

  // Load configuration
  const config = loadConfig();
  console.log(`Syncing activities from the last ${config.sync.daysToSync} days\n`);

  // Initialize services
  const strava = new StravaService({
    clientId: config.strava.clientId,
    clientSecret: config.strava.clientSecret,
    accessToken: config.strava.accessToken,
    refreshToken: config.strava.refreshToken,
    expiresAt: config.strava.expiresAt,
  });

  const garmin = new GarminService(config.garmin.token);

  // Connect to Garmin
  console.log('Connecting to Garmin...');
  await garmin.connect();

  // Load sync history
  const history = loadSyncHistory(config.sync.dataDir);

  // Calculate date range
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - config.sync.daysToSync);

  // Fetch recent activities from Strava
  console.log(`\nFetching Strava activities since ${afterDate.toISOString().split('T')[0]}...`);
  const activities = await strava.getActivities(afterDate);
  console.log(`Found ${activities.length} activities`);

  // Check if tokens were refreshed and update .env
  const currentCreds = strava.getCredentials();
  if (currentCreds.accessToken !== config.strava.accessToken) {
    updateEnvFile(currentCreds);
  }

  // Filter out already synced activities
  const newActivities = activities.filter(
    (activity) => !history.syncedActivities[activity.id.toString()]
  );
  console.log(`${newActivities.length} new activities to sync\n`);

  if (newActivities.length === 0) {
    console.log('✅ All activities are already synced!\n');
    return;
  }

  // Process each activity
  let successCount = 0;
  let errorCount = 0;

  for (const activity of newActivities) {
    console.log(`Processing: ${activity.name} (${activity.sport_type})`);

    try {
      // Fetch activity streams
      const streams = await strava.getActivityStreams(activity.id);

      // Convert to FIT format
      const fitBuffer = convertToFit(activity, streams);
      const fileName = generateFileName(activity);

      // Upload to Garmin
      const result = await garmin.uploadActivity(fitBuffer, fileName);

      if (garmin.isUploadSuccessful(result)) {
        const garminId = garmin.getUploadedActivityId(result);
        console.log(`  ✅ Uploaded successfully (Garmin ID: ${garminId})`);

        // Update sync history
        history.syncedActivities[activity.id.toString()] = {
          garminId: garminId!,
          syncedAt: new Date().toISOString(),
          name: activity.name,
        };
        successCount++;
      } else {
        const errors = garmin.getUploadErrors(result);
        console.log(`  ❌ Upload failed: ${errors.join(', ')}`);
        errorCount++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Save sync history
  history.lastSync = new Date().toISOString();
  saveSyncHistory(config.sync.dataDir, history);

  // Summary
  console.log('\n' + '═'.repeat(40));
  console.log(`✅ Synced: ${successCount}`);
  if (errorCount > 0) {
    console.log(`❌ Failed: ${errorCount}`);
  }
  console.log('═'.repeat(40) + '\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
