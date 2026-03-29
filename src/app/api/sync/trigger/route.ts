import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { syncService } from "@/lib/services/sync.service";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const triggerSchema = z.object({
  stravaActivityId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify Garmin is connected
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { garminConnected: true, stravaConnected: true },
    });

    if (!user?.stravaConnected) {
      return NextResponse.json(
        { error: "Strava account not connected" },
        { status: 400 }
      );
    }

    if (!user?.garminConnected) {
      return NextResponse.json(
        { error: "Garmin account not connected" },
        { status: 400 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validation = triggerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { stravaActivityId } = validation.data;

    // Trigger sync
    const result = await syncService.triggerManualSync(
      session.user.id,
      stravaActivityId
    );

    // Get the final sync status
    const syncRecord = await prisma.syncRecord.findUnique({
      where: { id: result.syncRecordId },
      select: { status: true, errorMessage: true, garminActivityId: true },
    });

    return NextResponse.json({
      success: syncRecord?.status === "COMPLETED",
      syncRecordId: result.syncRecordId,
      status: syncRecord?.status,
      garminActivityId: syncRecord?.garminActivityId,
      error: syncRecord?.errorMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message === "Activity already synced") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Error triggering sync:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
