import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GarminConnectInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GarminConnectClass = any;

// Dynamic import to handle module resolution correctly
let GarminConnect: GarminConnectClass | null = null;

async function getGarminConnectClass(): Promise<GarminConnectClass> {
  if (!GarminConnect) {
    // Use require for CommonJS compatibility
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gc = require('garmin-connect');
    GarminConnect = gc.GarminConnect || gc.default || gc;
  }
  return GarminConnect;
}

export class GarminService {
  private static instance: GarminService;
  private clientCache: Map<string, GarminConnectInstance> = new Map();

  static getInstance(): GarminService {
    if (!GarminService.instance) {
      GarminService.instance = new GarminService();
    }
    return GarminService.instance;
  }

  /**
   * Connect a user's Garmin account by storing encrypted credentials
   */
  async connectAccount(
    userId: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    // First, try to authenticate to validate credentials
    const GC = await getGarminConnectClass();
    const client = new GC({
      username: email,
      password: password,
    });

    try {
      await client.login();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';

      // Check for common errors
      if (message.includes('MFA') || message.includes('2FA')) {
        return {
          success: false,
          error:
            'Two-factor authentication is enabled on this Garmin account. Please disable 2FA to use this integration.',
        };
      }

      return {
        success: false,
        error: `Garmin login failed: ${message}`,
      };
    }

    // Encrypt password and store
    const encryptedPassword = encrypt(password);

    // Try to export session data for persistence
    let sessionData: string | undefined;
    try {
      const exportedSession = await client.exportToken();
      if (exportedSession) {
        sessionData = JSON.stringify(exportedSession);
      }
    } catch {
      // Session export might not be available in all versions
      console.warn('Could not export Garmin session data');
    }

    // Update user record
    await prisma.user.update({
      where: { id: userId },
      data: {
        garminEmail: email,
        garminPasswordEnc: encryptedPassword,
        garminSessionData: sessionData,
        garminConnected: true,
      },
    });

    return { success: true };
  }

  /**
   * Disconnect a user's Garmin account
   */
  async disconnectAccount(userId: string): Promise<void> {
    // Clear from cache
    this.clientCache.delete(userId);

    // Clear stored credentials
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
   * Get an authenticated Garmin client for a user
   */
  async getClient(userId: string): Promise<GarminConnectInstance> {
    // Check cache first
    const cached = this.clientCache.get(userId);
    if (cached) {
      return cached;
    }

    // Get user's Garmin credentials
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        garminEmail: true,
        garminPasswordEnc: true,
        garminSessionData: true,
        garminConnected: true,
      },
    });

    if (!user || !user.garminConnected) {
      throw new Error('Garmin account not connected');
    }

    const GC = await getGarminConnectClass();

    // Try to restore session from stored tokens first
    if (user.garminSessionData) {
      try {
        const sessionData = JSON.parse(user.garminSessionData);
        console.log('Loading Garmin session from stored tokens...');

        const client = new GC();

        // Handle tokens from garmin-connect library export
        if (sessionData.oauth1) {
          client.client.oauth1Token = sessionData.oauth1;
        }
        if (sessionData.oauth2) {
          client.client.oauth2Token = sessionData.oauth2;
        }

        // Cache and return
        this.clientCache.set(userId, client);
        console.log('Garmin session restored from tokens');
        return client;
      } catch (err) {
        console.error('Failed to restore Garmin session:', err);
        // Fall through to password-based login
      }
    }

    // Fall back to password-based login if we have credentials
    if (user.garminEmail && user.garminPasswordEnc) {
      console.log('Attempting password-based Garmin login...');
      try {
        const password = decrypt(user.garminPasswordEnc);
        const client = new GC({
          username: user.garminEmail,
          password: password,
        });

        await client.login();

        // Update session tokens for next time
        try {
          const exportedSession = await client.exportToken();
          if (exportedSession) {
            await prisma.user.update({
              where: { id: userId },
              data: { garminSessionData: JSON.stringify(exportedSession) },
            });
          }
        } catch {
          console.warn('Could not export new session tokens');
        }

        this.clientCache.set(userId, client);
        return client;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Password-based login failed:', message);
        throw new Error(`Garmin login failed: ${message}`);
      }
    }

    throw new Error('Garmin session expired. Please reconnect your account.');
  }

  /**
   * Upload a FIT file to Garmin Connect
   */
  async uploadActivity(
    userId: string,
    fitFile: Buffer,
    fileName: string
  ): Promise<{ success: boolean; activityId?: string; error?: string }> {
    // Write buffer to temp file (garmin-connect expects a file path)
    const tempDir = join(tmpdir(), 'strava-garmin-sync');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = join(tempDir, fileName);

    try {
      writeFileSync(tempPath, fitFile);
      console.log(`Wrote temp FIT file: ${tempPath} (${fitFile.length} bytes)`);

      const client = await this.getClient(userId);

      // Upload the activity (pass file path, not buffer)
      const result = await client.uploadActivity(tempPath);

      // Extract activity ID from result
      const activityId = result?.detailedImportResult?.successes?.[0]?.internalId?.toString();

      // Clean up temp file
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: true,
        activityId,
      };
    } catch (error) {
      // Clean up temp file on error too
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      const message =
        error instanceof Error ? error.message : 'Upload failed';

      // Clear cache on auth errors
      if (
        message.includes('authentication') ||
        message.includes('unauthorized') ||
        message.includes('401')
      ) {
        this.clientCache.delete(userId);
      }

      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Check if a user's Garmin connection is valid
   */
  async verifyConnection(userId: string): Promise<boolean> {
    try {
      await this.getClient(userId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the client cache for a user (useful after credential update)
   */
  clearCache(userId: string): void {
    this.clientCache.delete(userId);
  }
}

export const garminService = GarminService.getInstance();
