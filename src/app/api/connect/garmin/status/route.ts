import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

    // Check if user is already connected
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { garminConnected: true, garminEmail: true },
    });

    if (user?.garminConnected) {
      return NextResponse.json({
        connected: true,
        email: user.garminEmail,
      });
    }

    // Check queue status
    const queueEntry = await prisma.garminConnectionQueue.findUnique({
      where: { userId: session.user.id },
    });

    if (!queueEntry) {
      return NextResponse.json({
        connected: false,
        queued: false,
      });
    }

    // Get queue position
    const position = await prisma.garminConnectionQueue.count({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        createdAt: { lte: queueEntry.createdAt },
      },
    });

    return NextResponse.json({
      connected: false,
      queued: true,
      status: queueEntry.status,
      position: queueEntry.status === "PENDING" || queueEntry.status === "PROCESSING" ? position : null,
      errorMessage: queueEntry.errorMessage,
      retryCount: queueEntry.retryCount,
      nextRetryAt: queueEntry.nextRetryAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error checking Garmin status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
