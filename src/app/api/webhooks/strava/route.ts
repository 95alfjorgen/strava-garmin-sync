import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { stravaService } from '@/lib/services/strava.service';
import { syncService } from '@/lib/services/sync.service';
import type { StravaWebhookEvent } from '@/lib/types/strava';

export const dynamic = 'force-dynamic';

/**
 * Check if an activity was recorded on a Garmin device
 * These activities are already on Garmin Connect, so we skip syncing them
 */
function isFromGarminDevice(deviceName?: string, externalId?: string): boolean {
  const device = deviceName?.toLowerCase() || '';
  const extId = externalId?.toLowerCase() || '';

  // Check device name for Garmin
  if (device.includes('garmin')) {
    return true;
  }

  // Check external_id - Garmin activities often have garmin in the external_id
  if (extId.includes('garmin')) {
    return true;
  }

  // Common Garmin device names (without "Garmin" in name)
  const garminDevices = [
    'edge', 'forerunner', 'fenix', 'venu', 'vivoactive', 'instinct',
    'enduro', 'epix', 'marq', 'descent', 'tactix', 'quatix', 'approach'
  ];

  for (const garminDevice of garminDevices) {
    if (device.includes(garminDevice)) {
      return true;
    }
  }

  return false;
}

/**
 * Webhook validation endpoint (GET)
 * Strava calls this to verify the webhook subscription
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');

  // Validate the request
  if (mode !== 'subscribe') {
    return NextResponse.json(
      { error: 'Invalid mode' },
      { status: 400 }
    );
  }

  // Check verify token against stored or environment token
  const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken || verifyToken !== expectedToken) {
    console.error('Webhook verification failed: token mismatch');
    return NextResponse.json(
      { error: 'Invalid verify token' },
      { status: 403 }
    );
  }

  // Return the challenge to complete verification
  return NextResponse.json({ 'hub.challenge': challenge });
}

/**
 * Webhook event handler (POST)
 * Receives activity events from Strava
 */
export async function POST(request: NextRequest) {
  try {
    const event = (await request.json()) as StravaWebhookEvent;

    console.log('Received Strava webhook event:', {
      objectType: event.object_type,
      aspectType: event.aspect_type,
      objectId: event.object_id,
      ownerId: event.owner_id,
    });

    // Only process activity creation events
    if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
      console.log('Ignoring non-create activity event');
      return NextResponse.json({ received: true });
    }

    // Find user by Strava athlete ID
    const user = await prisma.user.findUnique({
      where: { stravaAthleteId: event.owner_id },
      select: { id: true, garminConnected: true },
    });

    if (!user) {
      console.log(`No user found for Strava athlete ${event.owner_id}`);
      return NextResponse.json({ received: true });
    }

    // Check if Garmin is connected
    if (!user.garminConnected) {
      console.log(`User ${user.id} does not have Garmin connected`);
      return NextResponse.json({ received: true });
    }

    // Check if this activity was already processed
    const existingRecord = await prisma.syncRecord.findUnique({
      where: { stravaActivityId: BigInt(event.object_id) },
    });

    if (existingRecord) {
      console.log(`Activity ${event.object_id} already has a sync record`);
      return NextResponse.json({ received: true });
    }

    // Fetch activity details to check device info
    console.log(`Fetching activity ${event.object_id} to check device...`);
    const accessToken = await stravaService.getValidAccessToken(user.id);
    const activity = await stravaService.getActivity(accessToken, event.object_id);

    console.log(`Activity device info: device_name="${activity.device_name}", external_id="${activity.external_id}"`);

    // Check if activity is from a Garmin device
    if (isFromGarminDevice(activity.device_name, activity.external_id)) {
      console.log(`Activity ${event.object_id} is from Garmin device - skipping sync (already on Garmin)`);

      // Record as skipped so it shows in the UI
      await prisma.syncRecord.create({
        data: {
          userId: user.id,
          stravaActivityId: BigInt(event.object_id),
          status: 'SKIPPED',
          activityType: activity.sport_type || activity.type,
          activityName: activity.name,
          deviceName: activity.device_name || 'Garmin device',
          errorMessage: 'From Garmin device - already synced',
        },
      });

      return NextResponse.json({ received: true, skipped: 'garmin_device' });
    }

    console.log(`Activity ${event.object_id} is NOT from Garmin - will sync to Garmin Connect`);

    // Create sync record
    await prisma.syncRecord.create({
      data: {
        userId: user.id,
        stravaActivityId: BigInt(event.object_id),
        status: 'PENDING',
        activityType: activity.sport_type || activity.type,
        activityName: activity.name,
        deviceName: activity.device_name || 'Unknown',
      },
    });

    // Process sync directly (no Redis queue needed)
    // Run in background so webhook returns quickly
    syncService.triggerManualSync(user.id, event.object_id)
      .then(() => {
        console.log(`Sync completed for activity ${event.object_id}`);
      })
      .catch((error) => {
        console.error(`Sync failed for activity ${event.object_id}:`, error);
      });

    console.log(`Started sync for activity ${event.object_id}`);

    return NextResponse.json({ received: true, syncing: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent Strava from retrying
    return NextResponse.json({ received: true, error: 'Processing error' });
  }
}
