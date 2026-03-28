import { NextRequest, NextResponse } from 'next/server';
import { stravaService } from '@/lib/services/strava.service';
import { prisma } from '@/lib/db';
import { unsealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  isLoggedIn: boolean;
}

async function getSessionFromHeader(request: NextRequest): Promise<SessionData> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isLoggedIn: false };
  }
  const token = authHeader.substring(7);
  try {
    const data = await unsealData<SessionData>(token, { password: SESSION_PASSWORD });
    return { ...data, isLoggedIn: data.isLoggedIn ?? false };
  } catch {
    return { isLoggedIn: false };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get access token
    const accessToken = await stravaService.getValidAccessToken(session.userId);

    // Fetch recent activities
    const activities = await stravaService.getRecentActivities(accessToken, 1, 10);

    // Get sync status for these activities
    const activityIds = activities.map(a => BigInt(a.id));
    const syncRecords = await prisma.syncRecord.findMany({
      where: {
        userId: session.userId,
        stravaActivityId: { in: activityIds },
      },
      select: {
        stravaActivityId: true,
        status: true,
        garminActivityId: true,
      },
    });

    const syncMap = new Map(
      syncRecords.map(r => [r.stravaActivityId.toString(), r])
    );

    // Combine activities with sync status
    const result = activities.map(activity => ({
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
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
