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

    // Clear the OAuth state cookie and redirect to dashboard
    const response = NextResponse.redirect(`${appUrl}/dashboard`);
    response.cookies.delete('strava_oauth_state');

    return response;
  } catch (err) {
    console.error('Error during Strava OAuth callback:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent('Failed to complete authentication')}`
    );
  }
}
