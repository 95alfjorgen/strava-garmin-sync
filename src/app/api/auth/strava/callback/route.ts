import { NextRequest, NextResponse } from 'next/server';
import { stravaService } from '@/lib/services/strava.service';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

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
      `${appUrl}/dashboard?error=${encodeURIComponent('Authentication was denied')}`
    );
  }

  // Validate code is present
  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent('No authorization code received')}`
    );
  }

  // Validate state (CSRF protection)
  const storedState = request.cookies.get('strava_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent('Invalid state parameter')}`
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

    // Set up session
    const session = await getSession();
    session.userId = user.id;
    session.stravaAthleteId = tokenResponse.athlete.id;
    session.isLoggedIn = true;
    await session.save();

    // Create redirect response
    const response = NextResponse.redirect(`${appUrl}/dashboard`);

    // Clear the OAuth state cookie
    response.cookies.delete('strava_oauth_state');

    // Copy the session cookie to the redirect response
    const cookieStore = await import('next/headers').then(m => m.cookies());
    const sessionCookie = cookieStore.get('strava-garmin-sync-session');
    if (sessionCookie) {
      response.cookies.set('strava-garmin-sync-session', sessionCookie.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

    return response;
  } catch (err) {
    console.error('Error during Strava OAuth callback:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent('Failed to complete authentication')}`
    );
  }
}
