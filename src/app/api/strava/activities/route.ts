import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stravaService } from "@/lib/services/strava.service";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if Strava is connected
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stravaConnected: true },
    });

    if (!user?.stravaConnected) {
      return NextResponse.json({ activities: [] });
    }

    // Get access token
    const accessToken = await stravaService.getValidAccessToken(session.user.id);

    // Fetch recent activities
    const activities = await stravaService.getRecentActivities(accessToken, 1, 10);

    // Get sync status for these activities
    const activityIds = activities.map((a) => BigInt(a.id));
    const syncRecords = await prisma.syncRecord.findMany({
      where: {
        userId: session.user.id,
        stravaActivityId: { in: activityIds },
      },
      select: {
        stravaActivityId: true,
        status: true,
        garminActivityId: true,
      },
    });

    const syncMap = new Map(
      syncRecords.map((r) => [r.stravaActivityId.toString(), r])
    );

    // Combine activities with sync status
    const result = activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      type: activity.type,
      sport_type: activity.sport_type,
      start_date: activity.start_date,
      distance: activity.distance,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      total_elevation_gain: activity.total_elevation_gain,
      syncStatus: syncMap.get(activity.id.toString())?.status || null,
      garminActivityId: syncMap.get(activity.id.toString())?.garminActivityId || null,
    }));

    return NextResponse.json({ activities: result });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
