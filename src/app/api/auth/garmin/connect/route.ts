import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { garminService } from '@/lib/services/garmin.service';
import { unsealData } from 'iron-session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long';

interface SessionData {
  userId?: string;
  stravaAthleteId?: number;
  isLoggedIn: boolean;
}

async function getSessionFromRequest(request: NextRequest): Promise<SessionData> {
  const sessionCookie = request.cookies.get('strava-garmin-sync-session');

  if (!sessionCookie?.value) {
    return { isLoggedIn: false };
  }

  try {
    const data = await unsealData<SessionData>(sessionCookie.value, {
      password: SESSION_PASSWORD,
    });
    return {
      ...data,
      isLoggedIn: data.isLoggedIn ?? false,
    };
  } catch (err) {
    console.error('Failed to unseal session:', err);
    return { isLoggedIn: false };
  }
}

const connectSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  authToken: z.string().optional(), // Token-based auth fallback
});

export async function POST(request: NextRequest) {
  try {
    // Try cookie-based auth first
    let session = await getSessionFromRequest(request);
    let userId = session.userId;

    // If cookie auth fails, try token-based auth from request body
    if (!session.isLoggedIn || !session.userId) {
      console.log('Cookie auth failed, trying token auth...');

      const body = await request.clone().json();
      if (body.authToken) {
        try {
          const tokenData = await unsealData<SessionData>(body.authToken, {
            password: SESSION_PASSWORD,
          });
          if (tokenData.isLoggedIn && tokenData.userId) {
            userId = tokenData.userId;
            console.log('Token auth successful for user:', userId);
          }
        } catch (err) {
          console.error('Token auth failed:', err);
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - no valid auth' },
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

export async function DELETE(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getSessionFromRequest(request);
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
