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

// Browser pool entry
interface BrowserPoolEntry {
  browser: Browser;
  lastUsed: number;
  inUse: boolean;
}

// Configuration
const BROWSER_POOL_SIZE = 5;
const BROWSER_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_DURATION = 365 * 24 * 60 * 60 * 1000; // 1 year - actual expiry depends on Garmin's cookies

// Garmin URLs
const GARMIN_SIGNIN_URL = 'https://connect.garmin.com/signin';
const GARMIN_MODERN_URL = 'https://connect.garmin.com/modern/';
const GARMIN_UPLOAD_URL = 'https://connect.garmin.com/upload-service/upload/.fit';

export class GarminPlaywrightService {
  private static instance: GarminPlaywrightService;
  private browserPool: BrowserPoolEntry[] = [];
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): GarminPlaywrightService {
    if (!GarminPlaywrightService.instance) {
      GarminPlaywrightService.instance = new GarminPlaywrightService();
    }
    return GarminPlaywrightService.instance;
  }

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleBrowsers();
    }, 60 * 1000);
  }

  private async cleanupIdleBrowsers(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.browserPool.length; i++) {
      const entry = this.browserPool[i];
      if (!entry.inUse && now - entry.lastUsed > BROWSER_IDLE_TIMEOUT) {
        toRemove.push(i);
        try {
          await entry.browser.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.browserPool.splice(toRemove[i], 1);
    }
  }

  private async getBrowser(): Promise<{ browser: Browser; release: () => void }> {
    // Find an available browser
    for (const entry of this.browserPool) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.lastUsed = Date.now();
        return {
          browser: entry.browser,
          release: () => {
            entry.inUse = false;
            entry.lastUsed = Date.now();
          },
        };
      }
    }

    // Create new browser if pool isn't full
    if (this.browserPool.length < BROWSER_POOL_SIZE) {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      });

      const entry: BrowserPoolEntry = {
        browser,
        lastUsed: Date.now(),
        inUse: true,
      };

      this.browserPool.push(entry);

      return {
        browser,
        release: () => {
          entry.inUse = false;
          entry.lastUsed = Date.now();
        },
      };
    }

    // Wait for a browser to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        for (const entry of this.browserPool) {
          if (!entry.inUse) {
            clearInterval(checkInterval);
            entry.inUse = true;
            entry.lastUsed = Date.now();
            resolve({
              browser: entry.browser,
              release: () => {
                entry.inUse = false;
                entry.lastUsed = Date.now();
              },
            });
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * Open a browser window for the user to manually login to Garmin.
   * This bypasses Cloudflare's bot detection since it's a real user interaction.
   */
  async authenticateWithManualLogin(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    let browser: Browser | null = null;

    try {
      // Launch a visible browser for manual login
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
      });

      const page = await context.newPage();

      console.log('Opening Garmin login page for manual authentication...');
      await page.goto(GARMIN_SIGNIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

      // Wait for user to complete login - check for redirect away from SSO
      console.log('Waiting for user to complete login...');

      // Poll for successful login - check if we've left the SSO page
      const maxWaitTime = 300000; // 5 minutes
      const pollInterval = 1000; // Check every second
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await page.waitForTimeout(pollInterval);

        const currentUrl = page.url();
        console.log('Current URL:', currentUrl);

        // Success conditions: redirected to connect.garmin.com (not sso.garmin.com)
        if (
          currentUrl.includes('connect.garmin.com/modern') ||
          currentUrl.includes('connect.garmin.com/signin-complete') ||
          (currentUrl.includes('connect.garmin.com') && !currentUrl.includes('sso.garmin.com') && !currentUrl.includes('signin'))
        ) {
          console.log('Login detected! URL:', currentUrl);
          break;
        }

        // Check if browser was closed by user
        if (!page.isClosed()) {
          continue;
        } else {
          return {
            success: false,
            error: 'Browser was closed before login completed.',
          };
        }
      }

      // Final check
      const finalUrl = page.url();
      if (finalUrl.includes('sso.garmin.com') || finalUrl.includes('signin')) {
        await browser.close();
        return {
          success: false,
          error: 'Login timeout. Please try again and complete the login within 5 minutes.',
        };
      }

      console.log('Login successful, extracting session...');

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

      // Create session data
      const sessionData: GarminSession = {
        cookies,
        csrfToken: '',
        displayName,
        createdAt: Date.now(),
        lastValidated: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION,
      };

      // Store session (no password needed for manual login)
      await prisma.user.update({
        where: { id: userId },
        data: {
          garminSessionData: JSON.stringify(sessionData),
          garminConnected: true,
        },
      });

      console.log('Garmin session stored successfully');
      await browser.close();
      return { success: true };

    } catch (error) {
      if (browser) {
        await browser.close();
      }
      const message = error instanceof Error ? error.message : 'Authentication failed';
      console.error('Garmin manual auth error:', message);
      return {
        success: false,
        error: `Garmin login failed: ${message}`,
      };
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

      // Don't check our artificial expiration - let Garmin's actual cookies determine validity
      // The session will fail at API call time if cookies are truly expired

      const { browser, release } = await this.getBrowser();

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });

      // Add stored cookies
      await context.addCookies(sessionData.cookies);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context as any).__release = release;

      return context;
    } catch (error) {
      console.error('Failed to restore session:', error);
      return null;
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
      const release = (context as any).__release;
      await context.close();
      if (release) release();
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
        const release = (context as any).__release;
        await context.close();
        if (release) release();

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
      const release = (context as any).__release;
      await context.close();
      if (release) release();
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
   * Cleanup all browsers on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const entry of this.browserPool) {
      try {
        await entry.browser.close();
      } catch {
        // Ignore
      }
    }

    this.browserPool = [];
  }
}

export const garminPlaywrightService = GarminPlaywrightService.getInstance();
