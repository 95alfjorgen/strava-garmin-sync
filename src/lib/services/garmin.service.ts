import { prisma } from '@/lib/db';
import { garminPlaywrightService, GarminSession } from './garmin-playwright.service';

/**
 * GarminService - Main interface for Garmin Connect operations
 *
 * This service uses Playwright-based browser automation to bypass
 * Cloudflare TLS fingerprinting that blocks standard HTTP clients.
 *
 * Due to Garmin's bot detection, authentication requires manual login
 * in a browser window. The session cookies are then captured and used
 * for subsequent API calls.
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
   * Connect a user's Garmin account using manual browser login
   */
  async connectAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    return garminPlaywrightService.authenticateWithManualLogin(userId);
  }

  /**
   * Disconnect a user's Garmin account
   */
  async disconnectAccount(userId: string): Promise<void> {
    await garminPlaywrightService.disconnectAccount(userId);
  }

  /**
   * Upload a FIT file to Garmin Connect
   */
  async uploadActivity(
    userId: string,
    fitFile: Buffer,
    fileName: string
  ): Promise<{ success: boolean; activityId?: string; error?: string }> {
    return garminPlaywrightService.uploadActivity(userId, fitFile, fileName);
  }

  /**
   * Check if a user's Garmin connection is valid
   */
  async verifyConnection(userId: string): Promise<boolean> {
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
