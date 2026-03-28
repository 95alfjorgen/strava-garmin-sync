import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { unsealData } from 'iron-session';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  isLoggedIn: boolean;
}

async function getSessionFromHeader(request: NextRequest): Promise<SessionData> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isLoggedIn: false };
  }
  const token = authHeader.substring(7);
  try {
    const data = await unsealData<SessionData>(token, { password: SESSION_PASSWORD });
    return { ...data, isLoggedIn: data.isLoggedIn ?? false };
  } catch {
    return { isLoggedIn: false };
  }
}

const tokenSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  tokenData: z.string().min(1, 'Token data is required'),
});

// Upload Garmin tokens directly (bypasses login rate limits)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromHeader(request);
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        { error: 'Invalid token data - must be valid JSON' },
        { status: 400 }
      );
    }

    // Encrypt password and store
    const encryptedPassword = encrypt(password);

    // Update user record with tokens
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        garminEmail: email,
        garminPasswordEnc: encryptedPassword,
        garminSessionData: tokenData,
        garminConnected: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uploading Garmin tokens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
