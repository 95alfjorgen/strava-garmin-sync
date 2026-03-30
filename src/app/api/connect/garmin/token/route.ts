import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GarminConnect: any = null;

async function getGarminConnectClass() {
  if (!GarminConnect) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gc = require("garmin-connect");
    GarminConnect = gc.GarminConnect || gc.default || gc;
  }
  return GarminConnect;
}

const tokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

interface IOauth1Token {
  oauth_token: string;
  oauth_token_secret: string;
}

interface IOauth2Token {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

// Upload Garmin tokens directly (bypasses login rate limits)
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
    const validation = tokenSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token } = validation.data;

    // Decode base64 token
    let tokenData: string;
    let parsedToken: { oauth1?: IOauth1Token; oauth2?: IOauth2Token };
    try {
      tokenData = Buffer.from(token, "base64").toString("utf-8");
      parsedToken = JSON.parse(tokenData);

      // Validate token structure
      if (!parsedToken.oauth1 || !parsedToken.oauth2) {
        throw new Error("Token missing oauth1 or oauth2 data");
      }
    } catch (err) {
      console.error("Token decode error:", err);
      return NextResponse.json(
        { error: "Invalid token format. Make sure you copied the entire token." },
        { status: 400 }
      );
    }

    // Validate tokens work by making a test request
    try {
      const GC = await getGarminConnectClass();
      const client = new GC();
      client.loadToken(parsedToken.oauth1, parsedToken.oauth2);

      // Test the connection
      await client.getUserSettings();
      console.log("Garmin tokens validated successfully");
    } catch (validationErr) {
      console.error("Token validation failed:", validationErr);
      return NextResponse.json(
        { error: "Token validation failed. The tokens may be expired or invalid." },
        { status: 400 }
      );
    }

    // Update user record with validated tokens
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          garminEmail: "Connected via token",
          garminPasswordEnc: null, // No password stored with token auth
          garminSessionData: tokenData,
          garminConnected: true,
        },
      });
    } catch (dbErr) {
      console.error("Database update failed:", dbErr);
      return NextResponse.json(
        {
          error: `Database error: ${dbErr instanceof Error ? dbErr.message : "unknown"}`,
        },
        { status: 500 }
      );
    }

    // Clear any pending queue entries for this user
    try {
      await prisma.garminConnectionQueue.deleteMany({
        where: { userId: session.user.id },
      });
    } catch {
      // Ignore queue cleanup errors
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error uploading Garmin tokens:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : "unknown"}`,
      },
      { status: 500 }
    );
  }
}
