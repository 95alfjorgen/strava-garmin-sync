import { getIronSession, IronSession, sealData, unsealData } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  userId?: string;
  stravaAthleteId?: number;
  isLoggedIn: boolean;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'strava-garmin-sync-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  // Initialize default values
  if (session.isLoggedIn === undefined) {
    session.isLoggedIn = false;
  }

  return session;
}

// Helper to read session data without the full IronSession wrapper
export async function getSessionData(): Promise<SessionData> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(sessionOptions.cookieName);

  if (!sessionCookie?.value) {
    return { isLoggedIn: false };
  }

  try {
    const data = await unsealData<SessionData>(sessionCookie.value, {
      password: sessionOptions.password,
    });
    return {
      ...data,
      isLoggedIn: data.isLoggedIn ?? false,
    };
  } catch {
    return { isLoggedIn: false };
  }
}

export { sealData, unsealData };
