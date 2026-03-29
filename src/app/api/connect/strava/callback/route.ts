import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stravaService } from "@/lib/services/strava.service";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Check if user is authenticated with Better Auth
  if (!session?.user) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent("Please sign in first")}`
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Check for OAuth errors
  if (error) {
    console.error("Strava OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent("Strava connection was denied")}`
    );
  }

  // Validate code is present
  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent("No authorization code received from Strava")}`
    );
  }

  // Validate state (CSRF protection)
  const storedState = request.cookies.get("strava_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent("Invalid state parameter")}`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await stravaService.exchangeCodeForTokens(code);
    const athlete = tokenResponse.athlete;

    // Check if this Strava account is already connected to another user
    const existingStravaUser = await prisma.user.findUnique({
      where: { stravaAthleteId: athlete.id },
    });

    if (existingStravaUser && existingStravaUser.id !== session.user.id) {
      return NextResponse.redirect(
        `${appUrl}/dashboard?error=${encodeURIComponent("This Strava account is already connected to another user")}`
      );
    }

    // Update user with Strava connection
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        stravaConnected: true,
        stravaAthleteId: athlete.id,
        stravaAccessToken: tokenResponse.access_token,
        stravaRefreshToken: tokenResponse.refresh_token,
        stravaTokenExpiresAt: new Date(tokenResponse.expires_at * 1000),
        stravaAthleteName: athlete.firstname && athlete.lastname
          ? `${athlete.firstname} ${athlete.lastname}`
          : athlete.firstname || `Athlete ${athlete.id}`,
        stravaAthleteImage: athlete.profile,
      },
    });

    // Redirect to dashboard with success message
    const response = NextResponse.redirect(
      `${appUrl}/dashboard?success=${encodeURIComponent("Strava connected successfully!")}`
    );

    // Clear the OAuth state cookie
    response.cookies.delete("strava_oauth_state");

    return response;
  } catch (err) {
    console.error("Error during Strava OAuth callback:", err);
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=${encodeURIComponent("Failed to connect Strava")}`
    );
  }
}
