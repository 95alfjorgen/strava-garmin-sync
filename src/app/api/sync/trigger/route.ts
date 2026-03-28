import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { syncService } from '@/lib/services/sync.service';
import { prisma } from '@/lib/db';
import { unsealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  isLoggedIn: boolean;
}

async function getSessionFromHeader(request: NextRequest): Promise<SessionData> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isLoggedIn: false };
  }
  const token = authHeader.substring(7);
  try {
    const data = await unsealData<SessionData>(token, { password: SESSION_PASSWORD });
    return { ...data, isLoggedIn: data.isLoggedIn ?? false };
  } catch {
    return { isLoggedIn: false };
  }
}

const triggerSchema = z.object({
  stravaActivityId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
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

    // Get the final sync status
    const syncRecord = await prisma.syncRecord.findUnique({
      where: { id: result.syncRecordId },
      select: { status: true, errorMessage: true, garminActivityId: true },
    });

    return NextResponse.json({
      success: syncRecord?.status === 'COMPLETED',
      syncRecordId: result.syncRecordId,
      status: syncRecord?.status,
      garminActivityId: syncRecord?.garminActivityId,
      error: syncRecord?.errorMessage,
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
