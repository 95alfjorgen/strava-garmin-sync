import { prisma } from '@/lib/db';
import { garminPlaywrightService, GarminSession } from './garmin-playwright.service';

/**
 * GarminService - Main interface for Garmin Connect operations
 *
 * This service uses Playwright-based browser automation to bypass
 * Cloudflare TLS fingerprinting that blocks standard HTTP clients.
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
   * Connect a user's Garmin account using headless browser authentication
   */
  async connectAccount(
    userId: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    return garminPlaywrightService.authenticateWithCredentials(userId, email, password);
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
    email?: string;
    displayName?: string;
    expiresAt?: Date;
    lastValidated?: Date;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        garminConnected: true,
        garminEmail: true,
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
      email: user.garminEmail || undefined,
      displayName,
      expiresAt,
      lastValidated,
    };
  }

  /**
   * Execute a Garmin API call through the browser context
   */
  async executeApiCall<T>(
    userId: string,
    endpoint: string,
    options?: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    return garminPlaywrightService.executeApiCall<T>(userId, endpoint, options);
  }
}

export const garminService = GarminService.getInstance();
