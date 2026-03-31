import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Dynamically import the appropriate service based on environment
async function getService() {
  if (process.env.HYPERBEAM_API_KEY) {
    const { garminHyperbeamService } = await import("@/lib/services/garmin-hyperbeam.service");
    return garminHyperbeamService;
  }
  if (process.env.BROWSERLESS_TOKEN) {
    const { garminBrowserlessService } = await import("@/lib/services/garmin-browserless.service");
    return garminBrowserlessService;
  }
  return null;
}

/**
 * Start a new Garmin login session
 * Returns an embedUrl for the user to interact with
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

    const service = await getService();

    if (!service) {
      return NextResponse.json(
        { error: "No cloud browser service configured (HYPERBEAM_API_KEY or BROWSERLESS_TOKEN required)" },
        { status: 500 }
      );
    }

    const result = await service.startLoginSession(session.user.id);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Handle different property names from different services
    const embedUrl = 'embedUrl' in result ? result.embedUrl : 'liveUrl' in result ? result.liveUrl : undefined;

    return NextResponse.json({
      sessionId: result.sessionId,
      embedUrl,
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

    const service = await getService();

    if (!service) {
      return NextResponse.json({ status: 'not_found' });
    }

    const status = service.getSessionStatus(sessionId);

    // If session is not found, check if user is now connected
    if (status.status === 'not_found') {
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

    const service = await getService();

    if (service) {
      await service.cancelLoginSession(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling Garmin login session:", error);
    return NextResponse.json(
      { error: "Failed to cancel session" },
      { status: 500 }
    );
  }
}
