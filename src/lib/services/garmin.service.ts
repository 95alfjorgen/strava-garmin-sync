import { prisma } from '@/lib/db';
import { garminPlaywrightService, GarminSession } from './garmin-playwright.service';
import { garminBrowserlessService } from './garmin-browserless.service';

/**
 * GarminService - Main interface for Garmin Connect operations
 *
 * This service uses browser automation to bypass Cloudflare TLS fingerprinting.
 *
 * In production (with BROWSERLESS_TOKEN), it uses Browserless.io cloud browsers.
 * In development, it uses local Playwright browsers.
 */
export class GarminService {
  private static instance: GarminService;

  static getInstance(): GarminService {
    if (!GarminService.instance) {
      GarminService.instance = new GarminService();
    }
    return GarminService.instance;
  }

  /**
   * Check if we should use Browserless.io (production) or local Playwright (development)
   */
  private useBrowserless(): boolean {
    return !!process.env.BROWSERLESS_TOKEN;
  }

  /**
   * Connect a user's Garmin account using manual browser login
   * Note: In production with Browserless, use the /api/connect/garmin/session endpoint instead
   */
  async connectAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    // For local development, use the local Playwright browser
    if (!this.useBrowserless()) {
      return garminPlaywrightService.authenticateWithManualLogin(userId);
    }

    // For production, this method shouldn't be called directly
    // The UI should use the session API instead
    return {
      success: false,
      error: 'Use the session API for Browserless authentication',
    };
  }

  /**
   * Disconnect a user's Garmin account
   */
  async disconnectAccount(userId: string): Promise<void> {
    if (this.useBrowserless()) {
      await garminBrowserlessService.disconnectAccount(userId);
    } else {
      await garminPlaywrightService.disconnectAccount(userId);
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
    if (this.useBrowserless()) {
      return garminBrowserlessService.uploadActivity(userId, fitFile, fileName);
    }
    return garminPlaywrightService.uploadActivity(userId, fitFile, fileName);
  }

  /**
   * Check if a user's Garmin connection is valid
   */
  async verifyConnection(userId: string): Promise<boolean> {
    if (this.useBrowserless()) {
      return garminBrowserlessService.validateSession(userId);
    }
    return garminPlaywrightService.validateSession(userId);
  }

  /**
   * Get session information for a user
   */
  async getSessionInfo(userId: string): Promise<{
    connected: boolean;
    displayName?: string;
    expiresAt?: Date;
    lastValidated?: Date;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        garminConnected: true,
        garminSessionData: true,
      },
    });

    if (!user || !user.garminConnected) {
      return { connected: false };
    }

    let displayName: string | undefined;
    let expiresAt: Date | undefined;
    let lastValidated: Date | undefined;

    if (user.garminSessionData) {
      try {
        const sessionData: GarminSession = JSON.parse(user.garminSessionData);
        displayName = sessionData.displayName || undefined;
        expiresAt = new Date(sessionData.expiresAt);
        lastValidated = new Date(sessionData.lastValidated);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      connected: true,
      displayName,
      expiresAt,
      lastValidated,
    };
  }
}

export const garminService = GarminService.getInstance();
