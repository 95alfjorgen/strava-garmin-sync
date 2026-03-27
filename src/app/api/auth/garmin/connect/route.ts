import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { garminService } from '@/lib/services/garmin.service';
import { getSessionData } from '@/lib/session';

export const dynamic = 'force-dynamic';

const connectSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getSessionData();
    console.log('Session data:', { isLoggedIn: session.isLoggedIn, userId: session.userId });

    if (!session.isLoggedIn || !session.userId) {
      console.log('Session check failed - returning 401');
      return NextResponse.json(
        { error: 'Unauthorized - session invalid' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
      console.log('Request body parsed, email:', body.email);
    } catch (parseErr) {
      console.error('Failed to parse request body:', parseErr);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = connectSchema.safeParse(body);

    if (!validation.success) {
      console.log('Validation failed:', validation.error.issues);
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Attempt to connect Garmin account
    console.log('Attempting Garmin connection for user:', session.userId);
    const result = await garminService.connectAccount(
      session.userId,
      email,
      password
    );

    console.log('Garmin connection result:', { success: result.success, error: result.error });

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
      { error: `Internal server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Verify user is authenticated
    const session = await getSessionData();
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
