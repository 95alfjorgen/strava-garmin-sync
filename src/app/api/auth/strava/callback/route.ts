import { NextRequest, NextResponse } from 'next/server';
import { stravaService } from '@/lib/services/strava.service';
import { prisma } from '@/lib/db';
import { sealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'strava-garmin-sync-session',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Check for OAuth errors
  if (error) {
    console.error('Strava OAuth error:', error);
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent('Authentication was denied')}`
    );
  }

  // Validate code is present
  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent('No authorization code received')}`
    );
  }

  // Validate state (CSRF protection)
  const storedState = request.cookies.get('strava_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent('Invalid state parameter')}`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await stravaService.exchangeCodeForTokens(code);

    // Create or update user in database
    const user = await prisma.user.upsert({
      where: { stravaAthleteId: tokenResponse.athlete.id },
      create: {
        stravaAthleteId: tokenResponse.athlete.id,
        stravaAccessToken: tokenResponse.access_token,
        stravaRefreshToken: tokenResponse.refresh_token,
        stravaTokenExpiresAt: new Date(tokenResponse.expires_at * 1000),
      },
      update: {
        stravaAccessToken: tokenResponse.access_token,
        stravaRefreshToken: tokenResponse.refresh_token,
        stravaTokenExpiresAt: new Date(tokenResponse.expires_at * 1000),
      },
    });

    // Create sealed session data manually
    const sessionData = {
      userId: user.id,
      stravaAthleteId: tokenResponse.athlete.id,
      isLoggedIn: true,
    };

    const sealedSession = await sealData(sessionData, {
      password: sessionOptions.password,
    });

    // Create redirect response with cookie set directly
    const response = NextResponse.redirect(`${appUrl}/dashboard`);

    // Clear the OAuth state cookie
    response.cookies.delete('strava_oauth_state');

    // Set the session cookie directly on the response
    response.cookies.set(sessionOptions.cookieName, sealedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Error during Strava OAuth callback:', err);
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent('Failed to complete authentication')}`
    );
  }
}
