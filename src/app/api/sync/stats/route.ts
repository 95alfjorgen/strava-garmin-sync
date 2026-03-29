import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncService } from "@/lib/services/sync.service";
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

    const stats = await syncService.getSyncStats(session.user.id);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching sync stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
