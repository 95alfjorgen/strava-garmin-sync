import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { syncService } from '@/lib/services/sync.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
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
