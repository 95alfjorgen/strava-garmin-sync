import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Clear Strava connection data
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        stravaConnected: false,
        stravaAthleteId: null,
        stravaAccessToken: null,
        stravaRefreshToken: null,
        stravaTokenExpiresAt: null,
        stravaAthleteName: null,
        stravaAthleteImage: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Strava:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Strava" },
      { status: 500 }
    );
  }
}
