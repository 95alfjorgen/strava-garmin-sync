import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addSyncJob } from '@/lib/queue';
import type { StravaWebhookEvent } from '@/lib/types/strava';

export const dynamic = 'force-dynamic';

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

    // Create sync record
    const syncRecord = await prisma.syncRecord.create({
      data: {
        userId: user.id,
        stravaActivityId: BigInt(event.object_id),
        status: 'PENDING',
      },
    });

    // Queue sync job
    await addSyncJob({
      syncRecordId: syncRecord.id,
      userId: user.id,
      stravaActivityId: event.object_id,
    });

    console.log(`Queued sync job for activity ${event.object_id}`);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent Strava from retrying
    return NextResponse.json({ received: true, error: 'Processing error' });
  }
}
