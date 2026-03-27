import { NextRequest, NextResponse } from 'next/server';
import { syncService } from '@/lib/services/sync.service';
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

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await syncService.getSyncStats(session.userId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching sync stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
