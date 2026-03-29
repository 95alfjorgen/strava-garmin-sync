import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  tokenData: z.string().min(1, "Token data is required"),
});

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

    const { email, password, tokenData } = validation.data;

    // Validate token data is valid JSON
    try {
      JSON.parse(tokenData);
    } catch {
      return NextResponse.json(
        { error: "Invalid token data - must be valid JSON" },
        { status: 400 }
      );
    }

    // Encrypt password and store
    let encryptedPassword;
    try {
      encryptedPassword = encrypt(password);
    } catch (encryptErr) {
      console.error("Encryption failed:", encryptErr);
      return NextResponse.json(
        {
          error: `Encryption failed: ${encryptErr instanceof Error ? encryptErr.message : "unknown"}`,
        },
        { status: 500 }
      );
    }

    // Update user record with tokens
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          garminEmail: email,
          garminPasswordEnc: encryptedPassword,
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
