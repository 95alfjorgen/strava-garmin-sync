import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { garminService } from '@/lib/services/garmin.service';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const connectSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = connectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Attempt to connect Garmin account
    const result = await garminService.connectAccount(
      session.userId,
      email,
      password
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error connecting Garmin account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Verify user is authenticated
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await garminService.disconnectAccount(session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Garmin account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
