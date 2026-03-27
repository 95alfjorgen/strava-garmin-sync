import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
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

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        stravaAthleteId: true,
        garminEmail: true,
        garminConnected: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      stravaAthleteId: user.stravaAthleteId,
      garminConnected: user.garminConnected,
      garminEmail: user.garminEmail,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete user and all related data (cascade)
    await prisma.user.delete({
      where: { id: session.userId },
    });

    // Destroy session
    session.destroy();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
