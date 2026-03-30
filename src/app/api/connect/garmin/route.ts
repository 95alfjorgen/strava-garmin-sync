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

    const { email, password } = validation.data;

    // Try to connect
    const result = await garminService.connectAccount(
      session.user.id,
      email,
      password
    );

    if (!result.success) {
      // Check for rate limit
      if (result.error?.includes("429") || result.error?.toLowerCase().includes("rate")) {
        return NextResponse.json(
          { error: result.error, rateLimited: true },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error connecting Garmin account:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Check for rate limit in exception
    if (message.includes("429") || message.toLowerCase().includes("rate")) {
      return NextResponse.json(
        { error: "Garmin rate limited", rateLimited: true },
        { status: 429 }
      );
    }

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
