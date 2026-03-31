import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { garminPlaywrightService } from "@/lib/services/garmin-playwright.service";
import { garminService } from "@/lib/services/garmin.service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  manualLogin: z.boolean().optional(),
});

/**
 * Check if we're using Browserless.io (production) or local Playwright (development)
 */
function isBrowserlessEnabled(): boolean {
  return !!process.env.BROWSERLESS_TOKEN;
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = connectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { manualLogin } = validation.data;

    // In production with Browserless, redirect to use the session API
    if (isBrowserlessEnabled()) {
      return NextResponse.json({
        success: false,
        useBrowserless: true,
        message: "Use /api/connect/garmin/session for Browserless authentication",
      }, { status: 400 });
    }

    // Local development: Manual login flow with local Playwright browser
    if (manualLogin) {
      const result = await garminPlaywrightService.authenticateWithManualLogin(
        session.user.id
      );

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    // Default: require manual login
    return NextResponse.json({
      success: false,
      requiresManualLogin: true,
      error: "Garmin requires manual login due to security measures.",
    }, { status: 400 });

  } catch (error) {
    console.error("Error connecting Garmin account:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: `Connection failed: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await garminService.disconnectAccount(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Garmin account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
