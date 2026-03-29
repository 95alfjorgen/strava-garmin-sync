import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncService } from "@/lib/services/sync.service";
import { headers } from "next/headers";
import type { SyncStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const status = searchParams.get("status") as SyncStatus | null;

    const history = await syncService.getSyncHistory(session.user.id, {
      limit: Math.min(limit, 100),
      offset,
      status: status || undefined,
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching sync history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
