import { prisma } from '@/lib/db';
import { Cookie } from 'playwright';

// Session data stored in the database
export interface GarminSession {
  cookies: Cookie[];
  csrfToken: string;
  displayName: string;
  createdAt: number;
  lastValidated: number;
  expiresAt: number;
}

// Active Hyperbeam session (in-memory)
interface ActiveHyperbeamSession {
  sessionId: string;
  visitorId: string;
  userId: string;
  hyperbeamSessionId: string;
  embedUrl: string;
  adminToken: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  createdAt: number;
}

// Configuration
const SESSION_DURATION = 365 * 24 * 60 * 60 * 1000; // 1 year
const LOGIN_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const GARMIN_SIGNIN_URL = 'https://connect.garmin.com/signin';

const HYPERBEAM_API_URL = 'https://engine.hyperbeam.com/v0/vm';

export class GarminHyperbeamService {
  private static instance: GarminHyperbeamService;
  private activeSessions: Map<string, ActiveHyperbeamSession> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): GarminHyperbeamService {
    if (!GarminHyperbeamService.instance) {
      GarminHyperbeamService.instance = new GarminHyperbeamService();
    }
    return GarminHyperbeamService.instance;
  }

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60 * 1000);
  }

  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const entries = Array.from(this.activeSessions.entries());

    for (const [sessionId, session] of entries) {
      if (now - session.createdAt > LOGIN_TIMEOUT) {
        console.log(`Cleaning up stale Hyperbeam session: ${sessionId}`);
        await this.terminateHyperbeamSession(session.hyperbeamSessionId);
        this.activeSessions.delete(sessionId);
      }
    }
  }

  private getHyperbeamApiKey(): string {
    const key = process.env.HYPERBEAM_API_KEY;
    if (!key) {
      throw new Error('HYPERBEAM_API_KEY environment variable is not set');
    }
    return key;
  }

  /**
   * Start a new Hyperbeam session for Garmin login
   */
  async startLoginSession(userId: string): Promise<{ sessionId: string; embedUrl: string } | { error: string }> {
    try {
      const apiKey = this.getHyperbeamApiKey();
      const sessionId = `garmin-${userId}-${Date.now()}`;
      const visitorId = `visitor-${Date.now()}`;

      // Create Hyperbeam virtual browser session
      const response = await fetch(HYPERBEAM_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_url: GARMIN_SIGNIN_URL,
          offline_timeout: 300, // 5 minutes
          hide_cursor: false,
          ublock: true, // Block ads
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Hyperbeam API error:', response.status, errorText);
        throw new Error(`Hyperbeam API error: ${response.status}`);
      }

      const data = await response.json();
      const { session_id: hyperbeamSessionId, embed_url: embedUrl, admin_token: adminToken } = data;

      console.log('Hyperbeam session created:', hyperbeamSessionId);

      // Store active session
      const activeSession: ActiveHyperbeamSession = {
        sessionId,
        visitorId,
        userId,
        hyperbeamSessionId,
        embedUrl,
        adminToken,
        status: 'pending',
        createdAt: Date.now(),
      };

      this.activeSessions.set(sessionId, activeSession);

      // Start monitoring for login completion
      this.monitorLoginCompletion(sessionId);

      return { sessionId, embedUrl };
    } catch (error) {
      console.error('Failed to start Hyperbeam session:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: `Failed to start login session: ${message}` };
    }
  }

  /**
   * Monitor for login completion by checking the current URL
   */
  private async monitorLoginCompletion(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const startTime = Date.now();
    const pollInterval = 3000; // Check every 3 seconds

    while (Date.now() - startTime < LOGIN_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // Check if session was cancelled
      const currentSession = this.activeSessions.get(sessionId);
      if (!currentSession) return;

      try {
        // Get session info from Hyperbeam
        const apiKey = this.getHyperbeamApiKey();
        const response = await fetch(`https://engine.hyperbeam.com/v0/vm/${session.hyperbeamSessionId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.log(`[${sessionId}] Failed to get session info:`, response.status);
          continue;
        }

        const data = await response.json();

        // Check if the URL indicates successful login
        // Hyperbeam returns the current URL in session info
        const currentUrl = data.url || '';
        console.log(`[${sessionId}] Current URL:`, currentUrl);

        if (
          currentUrl.includes('connect.garmin.com/modern') ||
          currentUrl.includes('connect.garmin.com/signin-complete') ||
          (currentUrl.includes('connect.garmin.com') &&
           !currentUrl.includes('sso.garmin.com') &&
           !currentUrl.includes('signin'))
        ) {
          console.log(`[${sessionId}] Login detected!`);

          // Get cookies from the session
          const cookies = await this.getSessionCookies(session.hyperbeamSessionId, session.adminToken);

          // Store session data
          const sessionData: GarminSession = {
            cookies,
            csrfToken: '',
            displayName: '',
            createdAt: Date.now(),
            lastValidated: Date.now(),
            expiresAt: Date.now() + SESSION_DURATION,
          };

          await prisma.user.update({
            where: { id: session.userId },
            data: {
              garminSessionData: JSON.stringify(sessionData),
              garminConnected: true,
            },
          });

          currentSession.status = 'success';
          console.log(`[${sessionId}] Garmin session stored successfully`);

          // Terminate Hyperbeam session
          await this.terminateHyperbeamSession(session.hyperbeamSessionId);
          this.activeSessions.delete(sessionId);
          return;
        }
      } catch (err) {
        console.log(`[${sessionId}] Poll error:`, err);
      }
    }

    // Timeout
    const currentSession = this.activeSessions.get(sessionId);
    if (currentSession) {
      currentSession.status = 'failed';
      currentSession.error = 'Login timeout. Please try again.';
      await this.terminateHyperbeamSession(session.hyperbeamSessionId);
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Get cookies from Hyperbeam session
   */
  private async getSessionCookies(hyperbeamSessionId: string, adminToken: string): Promise<Cookie[]> {
    try {
      // Use Hyperbeam's programmatic control to get cookies
      // This requires executing JavaScript in the browser
      const response = await fetch(`https://engine.hyperbeam.com/v0/vm/${hyperbeamSessionId}/exec`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'JSON.stringify(document.cookie.split("; ").map(c => { const [name, ...v] = c.split("="); return { name, value: v.join("="), domain: ".garmin.com", path: "/" }; }))',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          return JSON.parse(data.result);
        }
      }
    } catch (err) {
      console.error('Failed to get cookies:', err);
    }

    // Fallback: return empty cookies (will need to reconnect)
    return [];
  }

  /**
   * Terminate a Hyperbeam session
   */
  private async terminateHyperbeamSession(hyperbeamSessionId: string): Promise<void> {
    try {
      const apiKey = this.getHyperbeamApiKey();
      await fetch(`https://engine.hyperbeam.com/v0/vm/${hyperbeamSessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    } catch (err) {
      console.error('Failed to terminate Hyperbeam session:', err);
    }
  }

  /**
   * Check session status
   */
  getSessionStatus(sessionId: string): { status: 'pending' | 'success' | 'failed' | 'not_found'; error?: string } {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return { status: 'not_found' };
    }

    return {
      status: session.status,
      error: session.error,
    };
  }

  /**
   * Cancel a login session
   */
  async cancelLoginSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      await this.terminateHyperbeamSession(session.hyperbeamSessionId);
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Disconnect account
   */
  async disconnectAccount(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        garminEmail: null,
        garminPasswordEnc: null,
        garminSessionData: null,
        garminConnected: false,
      },
    });
  }
}

export const garminHyperbeamService = GarminHyperbeamService.getInstance();
