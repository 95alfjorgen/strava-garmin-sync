import { NextRequest, NextResponse } from 'next/server';
import { sealData, unsealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  stravaAthleteId?: number;
  isLoggedIn: boolean;
}

// GET request to obtain an auth token (cookies work with GET)
export async function GET(request: NextRequest) {
  try {
    // Try reading session from cookies directly
    const sessionCookie = request.cookies.get('strava-garmin-sync-session');
    console.log('Token endpoint - cookie present:', !!sessionCookie?.value);

    let session: SessionData = { isLoggedIn: false };

    if (sessionCookie?.value) {
      try {
        session = await unsealData<SessionData>(sessionCookie.value, {
          password: SESSION_PASSWORD,
        });
        console.log('Token endpoint - session unsealed:', { isLoggedIn: session.isLoggedIn, userId: session.userId });
      } catch (err) {
        console.error('Token endpoint - unseal failed:', err);
      }
    }

    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({
        error: 'Unauthorized',
        debug: { cookiePresent: !!sessionCookie?.value }
      }, { status: 401 });
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
