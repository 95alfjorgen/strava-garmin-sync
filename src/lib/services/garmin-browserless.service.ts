import { chromium, Browser, BrowserContext, Cookie } from 'playwright';
import { prisma } from '@/lib/db';

// Session data stored in the database
export interface GarminSession {
  cookies: Cookie[];
  csrfToken: string;
  displayName: string;
  createdAt: number;
  lastValidated: number;
  expiresAt: number;
}

// Active login session (in-memory, for tracking ongoing logins)
interface ActiveLoginSession {
  sessionId: string;
  visitorId: string;
  userId: string;
  browser: Browser;
  context: BrowserContext;
  liveUrl: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
  createdAt: number;
}

// Configuration
const SESSION_DURATION = 365 * 24 * 60 * 60 * 1000; // 1 year
const LOGIN_TIMEOUT = 5 * 60 * 1000; // 5 minutes to complete login
const GARMIN_SIGNIN_URL = 'https://connect.garmin.com/signin';
const GARMIN_UPLOAD_URL = 'https://connect.garmin.com/upload-service/upload/.fit';
const GARMIN_MODERN_URL = 'https://connect.garmin.com/modern/';

export class GarminBrowserlessService {
  private static instance: GarminBrowserlessService;
  private activeSessions: Map<string, ActiveLoginSession> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): GarminBrowserlessService {
    if (!GarminBrowserlessService.instance) {
      GarminBrowserlessService.instance = new GarminBrowserlessService();
    }
    return GarminBrowserlessService.instance;
  }

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    // Cleanup stale sessions every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60 * 1000);
  }

  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const entries = Array.from(this.activeSessions.entries());

    for (const [sessionId, session] of entries) {
      if (now - session.createdAt > LOGIN_TIMEOUT) {
        console.log(`Cleaning up stale login session: ${sessionId}`);
        try {
          await session.browser.close();
        } catch {
          // Ignore close errors
        }
        this.activeSessions.delete(sessionId);
      }
    }
  }

  private getBrowserlessToken(): string {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) {
      throw new Error('BROWSERLESS_TOKEN environment variable is not set');
    }
    return token;
  }

  /**
   * Generate a unique visitor ID for Browserless reconnect feature
   */
  private generateVisitorId(): string {
    return `garmin-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Start a new Garmin login session and return the LiveURL for the user to interact with
   */
  async startLoginSession(userId: string): Promise<{ sessionId: string; liveUrl: string } | { error: string }> {
    try {
      const token = this.getBrowserlessToken();
      const visitorId = this.generateVisitorId();
      const sessionId = `garmin-${userId}-${Date.now()}`;

      // Connect to Browserless with minimal parameters first
      const browserWSEndpoint = `wss://production-sfo.browserless.io?token=${token}`;

      console.log('Connecting to Browserless...');
      const browser = await chromium.connectOverCDP(browserWSEndpoint);

      // Create context and page
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();

      // Navigate to Garmin login
      console.log('Navigating to Garmin login page...');
      await page.goto(GARMIN_SIGNIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

      // Browserless provides a debugger view
      const liveUrl = `https://chrome.browserless.io/debugger?token=${token}`;

      console.log('Live URL:', liveUrl);

      // Store the active session
      const activeSession: ActiveLoginSession = {
        sessionId,
        visitorId,
        userId,
        browser,
        context,
        liveUrl,
        status: 'pending',
        createdAt: Date.now(),
      };

      this.activeSessions.set(sessionId, activeSession);

      // Start monitoring for login completion in the background
      this.monitorLoginCompletion(sessionId);

      return { sessionId, liveUrl };
    } catch (error) {
      console.error('Failed to start login session:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: `Failed to start login session: ${message}` };
    }
  }

  /**
   * Monitor for login completion
   */
  private async monitorLoginCompletion(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const { browser, context, userId } = session;
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    try {
      const pages = context.pages();
      const page = pages[0];
      if (!page) {
        throw new Error('No page found');
      }

      while (Date.now() - startTime < LOGIN_TIMEOUT) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        // Check if session was cancelled
        if (!this.activeSessions.has(sessionId)) {
          return;
        }

        try {
          const currentUrl = page.url();
          console.log(`[${sessionId}] Current URL:`, currentUrl);

          // Check for successful login
          if (
            currentUrl.includes('connect.garmin.com/modern') ||
            currentUrl.includes('connect.garmin.com/signin-complete') ||
            (currentUrl.includes('connect.garmin.com') &&
             !currentUrl.includes('sso.garmin.com') &&
             !currentUrl.includes('signin'))
          ) {
            console.log(`[${sessionId}] Login detected!`);

            // Extract cookies
            const cookies = await context.cookies();

            // Try to get display name
            let displayName = '';
            try {
              displayName = await page.evaluate(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const win = window as any;
                if (win.GARMIN?.currentUser?.displayName) {
                  return win.GARMIN.currentUser.displayName;
                }
                return '';
              });
            } catch {
              // Not critical
            }

            // Create and store session data
            const sessionData: GarminSession = {
              cookies,
              csrfToken: '',
              displayName,
              createdAt: Date.now(),
              lastValidated: Date.now(),
              expiresAt: Date.now() + SESSION_DURATION,
            };

            await prisma.user.update({
              where: { id: userId },
              data: {
                garminSessionData: JSON.stringify(sessionData),
                garminConnected: true,
              },
            });

            // Mark session as successful
            session.status = 'success';
            console.log(`[${sessionId}] Garmin session stored successfully`);

            // Close browser
            await browser.close();
            this.activeSessions.delete(sessionId);
            return;
          }
        } catch (err) {
          // Page might be navigating, continue polling
          console.log(`[${sessionId}] Poll error (may be navigating):`, err);
        }
      }

      // Timeout reached
      session.status = 'failed';
      session.error = 'Login timeout. Please try again.';
      await browser.close();
      this.activeSessions.delete(sessionId);

    } catch (error) {
      console.error(`[${sessionId}] Monitor error:`, error);
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';

      try {
        await browser.close();
      } catch {
        // Ignore
      }
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Check the status of a login session
   */
  getSessionStatus(sessionId: string): { status: 'pending' | 'success' | 'failed' | 'not_found'; error?: string } {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      // Session might have completed successfully and been cleaned up
      return { status: 'not_found' };
    }

    return {
      status: session.status,
      error: session.error,
    };
  }

  /**
   * Cancel an active login session
   */
  async cancelLoginSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      try {
        await session.browser.close();
      } catch {
        // Ignore
      }
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Restore session from stored cookies
   */
  async restoreSession(userId: string): Promise<BrowserContext | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { garminSessionData: true },
    });

    if (!user?.garminSessionData) {
      return null;
    }

    try {
      const sessionData: GarminSession = JSON.parse(user.garminSessionData);
      const token = this.getBrowserlessToken();

      const browser = await chromium.connectOverCDP(
        `wss://production-sfo.browserless.io?token=${token}`
      );

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });

      // Add stored cookies
      await context.addCookies(sessionData.cookies);

      // Store browser reference for cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context as any).__browser = browser;

      return context;
    } catch (error) {
      console.error('Failed to restore session:', error);
      return null;
    }
  }

  /**
   * Upload a FIT file to Garmin Connect
   */
  async uploadActivity(
    userId: string,
    fitFile: Buffer,
    fileName: string
  ): Promise<{ success: boolean; activityId?: string; error?: string }> {
    const context = await this.restoreSession(userId);

    if (!context) {
      return {
        success: false,
        error: 'Session expired. Please reconnect your Garmin account.',
      };
    }

    try {
      const page = await context.newPage();

      // Navigate to Garmin Connect to initialize cookies
      await page.goto(GARMIN_MODERN_URL, { waitUntil: 'domcontentloaded' });

      // Check if we need to re-login
      if (page.url().includes('sso.garmin.com')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const browser = (context as any).__browser;
        await context.close();
        if (browser) await browser.close();

        return {
          success: false,
          error: 'Session expired. Please reconnect your Garmin account.',
        };
      }

      // Convert buffer to base64 for transfer to browser
      const base64File = fitFile.toString('base64');

      // Upload using fetch inside browser
      const result = await page.evaluate(
        async ({ base64File, fileName, uploadUrl }) => {
          try {
            // Convert base64 back to binary
            const binaryString = atob(base64File);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/octet-stream' });

            // Create form data
            const formData = new FormData();
            formData.append('file', blob, fileName);

            const response = await fetch(uploadUrl, {
              method: 'POST',
              credentials: 'include',
              body: formData,
            });

            if (!response.ok) {
              const text = await response.text();
              return {
                success: false,
                error: `Upload failed: ${response.status} - ${text}`,
              };
            }

            const data = await response.json();
            return { success: true, data };
          } catch (err) {
            return {
              success: false,
              error: `Upload error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            };
          }
        },
        { base64File, fileName, uploadUrl: GARMIN_UPLOAD_URL }
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Extract activity ID from result
      const activityId =
        result.data?.detailedImportResult?.successes?.[0]?.internalId?.toString();

      // Update session with fresh cookies
      await this.updateSessionCookies(userId, context);

      return {
        success: true,
        activityId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      return {
        success: false,
        error: message,
      };
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const browser = (context as any).__browser;
      await context.close();
      if (browser) await browser.close();
    }
  }

  /**
   * Update stored session cookies from current context
   */
  private async updateSessionCookies(
    userId: string,
    context: BrowserContext
  ): Promise<void> {
    try {
      const cookies = await context.cookies();

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { garminSessionData: true },
      });

      if (user?.garminSessionData) {
        const sessionData: GarminSession = JSON.parse(user.garminSessionData);
        sessionData.cookies = cookies;
        sessionData.lastValidated = Date.now();

        await prisma.user.update({
          where: { id: userId },
          data: { garminSessionData: JSON.stringify(sessionData) },
        });
      }
    } catch {
      // Non-critical error
    }
  }

  /**
   * Validate if a session is still valid
   */
  async validateSession(userId: string): Promise<boolean> {
    const context = await this.restoreSession(userId);
    if (!context) {
      return false;
    }

    try {
      const page = await context.newPage();

      await page.goto(GARMIN_MODERN_URL, { waitUntil: 'networkidle', timeout: 15000 });

      const currentUrl = page.url();

      // If redirected to SSO, session is invalid
      if (currentUrl.includes('sso.garmin.com') || currentUrl.includes('signin')) {
        return false;
      }

      // Update last validated timestamp
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { garminSessionData: true },
      });

      if (user?.garminSessionData) {
        const sessionData: GarminSession = JSON.parse(user.garminSessionData);
        sessionData.lastValidated = Date.now();
        await prisma.user.update({
          where: { id: userId },
          data: { garminSessionData: JSON.stringify(sessionData) },
        });
      }

      return true;
    } catch {
      return false;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const browser = (context as any).__browser;
      await context.close();
      if (browser) await browser.close();
    }
  }

  /**
   * Disconnect account and cleanup
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

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all active sessions
    const entries = Array.from(this.activeSessions.entries());
    for (const [sessionId, session] of entries) {
      try {
        await session.browser.close();
      } catch {
        // Ignore
      }
      this.activeSessions.delete(sessionId);
    }
  }
}

export const garminBrowserlessService = GarminBrowserlessService.getInstance();
