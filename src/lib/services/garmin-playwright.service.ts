import { chromium, Browser, BrowserContext, Cookie } from 'playwright';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';

// Session data stored in the database
export interface GarminSession {
  cookies: Cookie[];
  csrfToken: string;
  displayName: string;
  createdAt: number;
  lastValidated: number;
  expiresAt: number; // ~12 hours typically
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
const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours

// Garmin URLs
const GARMIN_SSO_URL = 'https://sso.garmin.com/sso/signin';
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
    // Start cleanup interval
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleBrowsers();
    }, 60 * 1000); // Check every minute
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

    // Remove in reverse order to maintain indices
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
   * Authenticate with Garmin using credentials via headless browser
   */
  async authenticateWithCredentials(
    userId: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    const { browser, release } = await this.getBrowser();
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
      });

      const page = await context.newPage();

      // Navigate to Garmin SSO
      console.log('Navigating to Garmin SSO...');
      await page.goto(GARMIN_SSO_URL, { waitUntil: 'networkidle' });

      // Wait for login form
      await page.waitForSelector('input[name="username"], input#username', {
        timeout: 15000,
      });

      // Fill credentials
      console.log('Filling login form...');
      await page.fill('input[name="username"], input#username', email);
      await page.fill('input[name="password"], input#password', password);

      // Submit form
      await page.click('button[type="submit"], #login-btn-signin');

      // Wait for navigation or error
      try {
        await Promise.race([
          page.waitForURL('**/modern/**', { timeout: 30000 }),
          page.waitForSelector('.alert-error, .error-message, [class*="error"]', {
            timeout: 30000,
          }),
        ]);
      } catch {
        // Check if we're stuck on MFA or CAPTCHA
        const pageContent = await page.content();
        if (
          pageContent.includes('verification') ||
          pageContent.includes('MFA') ||
          pageContent.includes('two-factor') ||
          pageContent.includes('2FA')
        ) {
          return {
            success: false,
            error:
              'Two-factor authentication is enabled. Please disable 2FA on your Garmin account to use this integration.',
          };
        }
        if (
          pageContent.includes('captcha') ||
          pageContent.includes('challenge') ||
          pageContent.includes('Cloudflare')
        ) {
          return {
            success: false,
            error:
              'Cloudflare challenge detected. Please try again later or contact support.',
          };
        }
        throw new Error('Login timeout - page did not navigate as expected');
      }

      // Check for error messages
      const errorElement = await page.$('.alert-error, .error-message');
      if (errorElement) {
        const errorText = await errorElement.textContent();
        return {
          success: false,
          error: `Garmin login failed: ${errorText || 'Invalid credentials'}`,
        };
      }

      // Verify we're on the modern dashboard
      const currentUrl = page.url();
      if (!currentUrl.includes('modern')) {
        return {
          success: false,
          error: 'Login failed - did not reach Garmin Connect dashboard',
        };
      }

      console.log('Login successful, extracting session...');

      // Extract cookies and CSRF token
      const cookies = await context.cookies();

      // Try to get CSRF token and user info
      let csrfToken = '';
      let displayName = '';

      try {
        // Extract CSRF token from page
        csrfToken = await page.evaluate(() => {
          const meta = document.querySelector('meta[name="_csrf"]');
          if (meta) return meta.getAttribute('content') || '';

          // Try to find it in window object
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          if (win.GARMIN && win.GARMIN.csrf) return win.GARMIN.csrf;

          return '';
        });

        // Get display name
        displayName = await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          if (win.GARMIN && win.GARMIN.currentUser) {
            return win.GARMIN.currentUser.displayName || '';
          }
          return '';
        });
      } catch {
        console.warn('Could not extract CSRF token or display name');
      }

      // If no CSRF from page, try to get it from user settings API
      if (!csrfToken) {
        try {
          const userSettingsResponse = await page.evaluate(async () => {
            const response = await fetch(
              'https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile',
              { credentials: 'include' }
            );
            return {
              ok: response.ok,
              headers: Object.fromEntries(response.headers.entries()),
            };
          });

          if (userSettingsResponse.ok && userSettingsResponse.headers['x-csrf-token']) {
            csrfToken = userSettingsResponse.headers['x-csrf-token'];
          }
        } catch {
          // Not critical
        }
      }

      // Create session data
      const sessionData: GarminSession = {
        cookies,
        csrfToken,
        displayName,
        createdAt: Date.now(),
        lastValidated: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION,
      };

      // Encrypt password and store session
      const encryptedPassword = encrypt(password);

      await prisma.user.update({
        where: { id: userId },
        data: {
          garminEmail: email,
          garminPasswordEnc: encryptedPassword,
          garminSessionData: JSON.stringify(sessionData),
          garminConnected: true,
        },
      });

      console.log('Garmin session stored successfully');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      console.error('Garmin Playwright auth error:', message);

      return {
        success: false,
        error: `Garmin login failed: ${message}`,
      };
    } finally {
      if (context) {
        await context.close();
      }
      release();
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

      // Check if session is expired
      if (Date.now() > sessionData.expiresAt) {
        console.log('Garmin session expired');
        return null;
      }

      const { browser, release } = await this.getBrowser();

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
      });

      // Add stored cookies
      await context.addCookies(sessionData.cookies);

      // Attach release function for cleanup
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

      // Try to access a protected endpoint
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
   * Execute an API call through the browser context
   */
  async executeApiCall<T>(
    userId: string,
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    let context = await this.restoreSession(userId);

    // If no valid session, try to re-authenticate
    if (!context) {
      const reAuthResult = await this.reAuthenticate(userId);
      if (!reAuthResult) {
        throw new Error('Session expired. Please reconnect your Garmin account.');
      }
      context = await this.restoreSession(userId);
      if (!context) {
        throw new Error('Failed to restore session after re-authentication.');
      }
    }

    try {
      const page = await context.newPage();

      // Navigate to Garmin Connect first to set cookies
      await page.goto(GARMIN_MODERN_URL, { waitUntil: 'domcontentloaded' });

      // Execute fetch within browser context
      const result = await page.evaluate(
        async ({ endpoint, options }) => {
          const fetchOptions: RequestInit = {
            method: options.method || 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
          };

          if (options.body) {
            fetchOptions.body = JSON.stringify(options.body);
          }

          const response = await fetch(endpoint, fetchOptions);

          if (!response.ok) {
            return {
              error: true,
              status: response.status,
              statusText: response.statusText,
            };
          }

          const text = await response.text();
          try {
            return { data: JSON.parse(text) };
          } catch {
            return { data: text };
          }
        },
        { endpoint, options }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((result as any).error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error(`API call failed: ${(result as any).status} ${(result as any).statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (result as any).data as T;
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
    let context = await this.restoreSession(userId);

    // If no valid session, try to re-authenticate
    if (!context) {
      const reAuthResult = await this.reAuthenticate(userId);
      if (!reAuthResult) {
        return {
          success: false,
          error: 'Session expired. Please reconnect your Garmin account.',
        };
      }
      context = await this.restoreSession(userId);
      if (!context) {
        return {
          success: false,
          error: 'Failed to restore session after re-authentication.',
        };
      }
    }

    try {
      const page = await context.newPage();

      // Navigate to Garmin Connect to initialize cookies
      await page.goto(GARMIN_MODERN_URL, { waitUntil: 'domcontentloaded' });

      // Check if we need to re-login
      if (page.url().includes('sso.garmin.com')) {
        // Session invalid, try re-auth
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const release = (context as any).__release;
        await context.close();
        if (release) release();

        const reAuthResult = await this.reAuthenticate(userId);
        if (!reAuthResult) {
          return {
            success: false,
            error: 'Session expired. Please reconnect your Garmin account.',
          };
        }

        // Retry with new session
        return this.uploadActivity(userId, fitFile, fileName);
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
   * Re-authenticate using stored credentials
   */
  private async reAuthenticate(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        garminEmail: true,
        garminPasswordEnc: true,
      },
    });

    if (!user?.garminEmail || !user?.garminPasswordEnc) {
      return false;
    }

    try {
      const password = decrypt(user.garminPasswordEnc);
      const result = await this.authenticateWithCredentials(
        userId,
        user.garminEmail,
        password
      );
      return result.success;
    } catch {
      return false;
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
