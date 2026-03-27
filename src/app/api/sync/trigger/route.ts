import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { syncService } from '@/lib/services/sync.service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const triggerSchema = z.object({
  stravaActivityId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify Garmin is connected
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { garminConnected: true },
    });

    if (!user?.garminConnected) {
      return NextResponse.json(
        { error: 'Garmin account not connected' },
        { status: 400 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validation = triggerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { stravaActivityId } = validation.data;

    // Trigger sync
    const result = await syncService.triggerManualSync(
      session.userId,
      stravaActivityId
    );

    return NextResponse.json({
      success: true,
      syncRecordId: result.syncRecordId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message === 'Activity already synced') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Error triggering sync:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
