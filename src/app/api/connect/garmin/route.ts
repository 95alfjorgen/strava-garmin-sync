import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { garminService } from "@/lib/services/garmin.service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const connectSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Simple in-memory retry tracking (would use Redis in production)
const retryAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000; // 1 minute between retries

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
      console.log("Request body parsed, email:", body.email);
    } catch (parseErr) {
      console.error("Failed to parse request body:", parseErr);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validation = connectSchema.safeParse(body);

    if (!validation.success) {
      console.log("Validation failed:", validation.error.issues);
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Check retry tracking
    const retryKey = `${session.user.id}:${email}`;
    const existing = retryAttempts.get(retryKey);

    if (existing) {
      const timeSinceLastAttempt = Date.now() - existing.lastAttempt;
      if (existing.count >= MAX_RETRIES && timeSinceLastAttempt < RETRY_DELAY_MS * existing.count) {
        const waitTime = Math.ceil((RETRY_DELAY_MS * existing.count - timeSinceLastAttempt) / 1000);
        return NextResponse.json(
          {
            error: `Rate limited. Please wait ${waitTime} seconds before trying again.`,
            retryAfter: waitTime
          },
          { status: 429 }
        );
      }
    }

    // Attempt to connect Garmin account
    console.log("Attempting Garmin connection for user:", session.user.id);
    const result = await garminService.connectAccount(
      session.user.id,
      email,
      password
    );

    console.log("Garmin connection result:", {
      success: result.success,
      error: result.error,
    });

    if (!result.success) {
      // Track failed attempts for rate limiting
      const currentAttempts = retryAttempts.get(retryKey) || { count: 0, lastAttempt: 0 };
      retryAttempts.set(retryKey, {
        count: currentAttempts.count + 1,
        lastAttempt: Date.now(),
      });

      // Check if it's a rate limit error from Garmin
      if (result.error?.includes("429") || result.error?.includes("Rate") || result.error?.includes("rate")) {
        return NextResponse.json(
          {
            error: "Garmin is rate limiting login attempts. Please try again in a few minutes.",
            retryAfter: 300
          },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Clear retry tracking on success
    retryAttempts.delete(retryKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error connecting Garmin account:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : "unknown"}`,
      },
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
