import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stravaService } from "@/lib/services/strava.service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/connect/strava/callback`;

  // Generate a random state for CSRF protection
  const state = crypto.randomUUID();

  const authUrl = stravaService.getAuthorizationUrl(redirectUri, state);

  // Set state in cookie for validation on callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
