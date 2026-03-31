import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { garminBrowserlessService } from "@/lib/services/garmin-browserless.service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Start a new Garmin login session
 * Returns a LiveURL for the user to interact with
 */
export async function POST() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await garminBrowserlessService.startLoginSession(session.user.id);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: result.sessionId,
      liveUrl: result.liveUrl,
    });
  } catch (error) {
    console.error("Error starting Garmin login session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to start login session: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Check status of an active login session
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const status = garminBrowserlessService.getSessionStatus(sessionId);

    // If session is not found, check if user is now connected to Garmin
    if (status.status === 'not_found') {
      // The session might have completed - check DB
      const { prisma } = await import('@/lib/db');
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { garminConnected: true },
      });

      if (user?.garminConnected) {
        return NextResponse.json({ status: 'success' });
      }
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error("Error checking Garmin login status:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}

/**
 * Cancel an active login session
 */
export async function DELETE(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await garminBrowserlessService.cancelLoginSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling Garmin login session:", error);
    return NextResponse.json(
      { error: "Failed to cancel session" },
      { status: 500 }
    );
  }
}
