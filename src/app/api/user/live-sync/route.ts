import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { unsealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  stravaAthleteId?: number;
  isLoggedIn: boolean;
}

async function getSessionFromHeader(request: NextRequest): Promise<SessionData> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isLoggedIn: false };
  }

  const token = authHeader.substring(7);
  try {
    const data = await unsealData<SessionData>(token, {
      password: SESSION_PASSWORD,
    });
    return { ...data, isLoggedIn: data.isLoggedIn ?? false };
  } catch {
    return { isLoggedIn: false };
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { liveSyncEnabled: enabled },
      select: { liveSyncEnabled: true },
    });

    return NextResponse.json({ liveSyncEnabled: user.liveSyncEnabled });
  } catch (error) {
    console.error('Error updating live sync:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
