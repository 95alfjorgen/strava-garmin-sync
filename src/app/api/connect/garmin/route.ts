import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
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

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error("Failed to parse request body:", parseErr);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validation = connectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Check if user already has a pending request
    const existingRequest = await prisma.garminConnectionQueue.findUnique({
      where: { userId: session.user.id },
    });

    if (existingRequest) {
      if (existingRequest.status === "PENDING" || existingRequest.status === "PROCESSING") {
        // Get queue position
        const position = await prisma.garminConnectionQueue.count({
          where: {
            status: { in: ["PENDING", "PROCESSING"] },
            createdAt: { lte: existingRequest.createdAt },
          },
        });

        return NextResponse.json({
          queued: true,
          status: existingRequest.status,
          position,
          message: "Your connection request is already in the queue",
        });
      }

      // Update existing failed request with new credentials
      const encryptedPassword = encrypt(password);
      await prisma.garminConnectionQueue.update({
        where: { userId: session.user.id },
        data: {
          garminEmail: email,
          garminPasswordEnc: encryptedPassword,
          status: "PENDING",
          errorMessage: null,
          retryCount: 0,
          nextRetryAt: null,
        },
      });
    } else {
      // Try immediate connection first (optimistic)
      console.log("Attempting immediate Garmin connection for user:", session.user.id);
      const result = await garminService.connectAccount(
        session.user.id,
        email,
        password
      );

      if (result.success) {
        return NextResponse.json({ success: true });
      }

      // If rate limited, queue for later
      if (result.error?.includes("429") || result.error?.toLowerCase().includes("rate")) {
        console.log("Rate limited, queuing connection request");
        const encryptedPassword = encrypt(password);

        await prisma.garminConnectionQueue.create({
          data: {
            userId: session.user.id,
            garminEmail: email,
            garminPasswordEnc: encryptedPassword,
            status: "PENDING",
            nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
          },
        });

        const position = await prisma.garminConnectionQueue.count({
          where: { status: { in: ["PENDING", "PROCESSING"] } },
        });

        return NextResponse.json({
          queued: true,
          position,
          message: "Garmin is rate limiting. Your request has been queued and will be processed automatically.",
        });
      }

      // Other error, return immediately
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const position = await prisma.garminConnectionQueue.count({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
    });

    return NextResponse.json({
      queued: true,
      position,
      message: "Your connection request has been queued",
    });
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

    // Remove from queue if exists
    await prisma.garminConnectionQueue.deleteMany({
      where: { userId: session.user.id },
    });

    // Disconnect account
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
