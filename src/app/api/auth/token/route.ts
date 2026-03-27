import { NextResponse } from 'next/server';
import { getSessionData } from '@/lib/session';
import { sealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

// GET request to obtain an auth token (cookies work with GET)
export async function GET() {
  try {
    const session = await getSessionData();

    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create a short-lived token with the session data
    const token = await sealData(
      {
        userId: session.userId,
        stravaAthleteId: session.stravaAthleteId,
        isLoggedIn: true,
        exp: Date.now() + 5 * 60 * 1000, // 5 minute expiry
      },
      { password: SESSION_PASSWORD }
    );

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error generating auth token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
