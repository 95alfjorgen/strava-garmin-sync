import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GarminConnectInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GarminConnectClass = any;

interface IOauth1Token {
  oauth_token: string;
  oauth_token_secret: string;
}

interface IOauth2Token {
  scope: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
}

interface IGarminTokens {
  oauth1: IOauth1Token;
  oauth2: IOauth2Token;
}

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
   * Check if OAuth2 token is expired or about to expire (within 5 minutes)
   */
  private isTokenExpired(oauth2: IOauth2Token): boolean {
    if (!oauth2.expires_at) {
      return false; // Can't determine, assume valid
    }
    const now = Date.now() / 1000; // Convert to seconds
    const bufferSeconds = 300; // 5 minute buffer
    return oauth2.expires_at < (now + bufferSeconds);
  }

  /**
   * Get an authenticated Garmin client for a user
   * Prioritizes stored tokens over password-based login to avoid rate limits
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

    // Try to restore session from stored tokens first (avoids rate limits)
    if (user.garminSessionData) {
      try {
        const sessionData: IGarminTokens = JSON.parse(user.garminSessionData);

        // Check if token is expired
        if (sessionData.oauth2 && this.isTokenExpired(sessionData.oauth2)) {
          console.log('Garmin token expired, will try to refresh via login...');
          // Fall through to password-based login
        } else if (sessionData.oauth1 && sessionData.oauth2) {
          console.log('Loading Garmin session from stored tokens...');

          const client = new GC();

          // Use loadToken method to properly restore session
          client.loadToken(sessionData.oauth1, sessionData.oauth2);

          // Validate the token works by making a simple request
          try {
            await client.getUserSettings();
            console.log('Garmin session restored and validated from tokens');

            // Cache and return
            this.clientCache.set(userId, client);
            return client;
          } catch (validationError) {
            console.warn('Token validation failed, will try password login:', validationError);
            // Fall through to password-based login
          }
        }
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
        console.log('Password-based Garmin login successful');

        // Export and store session tokens for next time (avoids future rate limits)
        try {
          const exportedSession = client.exportToken();
          if (exportedSession) {
            await prisma.user.update({
              where: { id: userId },
              data: { garminSessionData: JSON.stringify(exportedSession) },
            });
            console.log('Garmin tokens saved for future use (valid for ~1 year)');
          }
        } catch {
          console.warn('Could not export new session tokens');
        }

        this.clientCache.set(userId, client);
        return client;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Password-based login failed:', message);

        // Check if rate limited
        if (message.includes('429') || message.includes('rate') || message.includes('Too Many')) {
          throw new Error('Garmin rate limited. Please try again later or use token-based authentication.');
        }

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

      // Update stored tokens after successful operation (keeps them fresh)
      try {
        const exportedSession = client.exportToken();
        if (exportedSession) {
          await prisma.user.update({
            where: { id: userId },
            data: { garminSessionData: JSON.stringify(exportedSession) },
          });
        }
      } catch {
        // Ignore token export errors
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

      // Clear cache on auth errors to force re-authentication
      if (
        message.includes('authentication') ||
        message.includes('unauthorized') ||
        message.includes('401') ||
        message.includes('403')
      ) {
        this.clientCache.delete(userId);

        // If we have stored credentials, try one more time with fresh login
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { garminPasswordEnc: true },
        });

        if (user?.garminPasswordEnc) {
          console.log('Auth error during upload, retrying with fresh login...');
          // Clear session data to force password login
          await prisma.user.update({
            where: { id: userId },
            data: { garminSessionData: null },
          });

          // Retry the upload
          try {
            return await this.uploadActivity(userId, fitFile, fileName);
          } catch (retryError) {
            return {
              success: false,
              error: retryError instanceof Error ? retryError.message : 'Retry failed',
            };
          }
        }
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
