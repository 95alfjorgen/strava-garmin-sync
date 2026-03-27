import axios from 'axios';
import { prisma } from '@/lib/db';
import type {
  StravaTokenResponse,
  StravaActivity,
  StravaActivityStreams,
} from '@/lib/types/strava';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

export class StravaService {
  private static instance: StravaService;

  static getInstance(): StravaService {
    if (!StravaService.instance) {
      StravaService.instance = new StravaService();
    }
    return StravaService.instance;
  }

  /**
   * Generate the OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
    });

    if (state) {
      params.set('state', state);
    }

    return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<StravaTokenResponse> {
    const response = await axios.post<StravaTokenResponse>(
      `${STRAVA_OAUTH_BASE}/token`,
      {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }
    );

    return response.data;
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_at: number;
    }>(`${STRAVA_OAUTH_BASE}/token`, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: new Date(response.data.expires_at * 1000),
    };
  }

  /**
   * Get a valid access token for a user, refreshing if necessary
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        stravaAccessToken: true,
        stravaRefreshToken: true,
        stravaTokenExpiresAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if token is expired (with 5-minute buffer)
    const now = new Date();
    const expiresAt = new Date(user.stravaTokenExpiresAt);
    const bufferMs = 5 * 60 * 1000;

    if (expiresAt.getTime() - bufferMs > now.getTime()) {
      return user.stravaAccessToken;
    }

    // Token is expired, refresh it
    const refreshed = await this.refreshAccessToken(user.stravaRefreshToken);

    // Update user with new tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        stravaAccessToken: refreshed.accessToken,
        stravaRefreshToken: refreshed.refreshToken,
        stravaTokenExpiresAt: refreshed.expiresAt,
      },
    });

    return refreshed.accessToken;
  }

  /**
   * Get an activity by ID
   */
  async getActivity(
    accessToken: string,
    activityId: number
  ): Promise<StravaActivity> {
    const response = await axios.get<StravaActivity>(
      `${STRAVA_API_BASE}/activities/${activityId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data;
  }

  /**
   * Get activity streams (GPS, heart rate, etc.)
   */
  async getActivityStreams(
    accessToken: string,
    activityId: number,
    streamTypes: string[] = [
      'time',
      'distance',
      'latlng',
      'altitude',
      'heartrate',
      'cadence',
      'watts',
      'temp',
    ]
  ): Promise<StravaActivityStreams> {
    try {
      const response = await axios.get(
        `${STRAVA_API_BASE}/activities/${activityId}/streams`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { keys: streamTypes.join(','), key_by_type: true },
        }
      );

      return response.data;
    } catch (error) {
      // Some activities might not have streams (e.g., manual entries)
      console.error(`Failed to fetch streams for activity ${activityId}:`, error);
      return {};
    }
  }

  /**
   * Get recent activities for a user
   */
  async getRecentActivities(
    accessToken: string,
    page: number = 1,
    perPage: number = 30
  ): Promise<StravaActivity[]> {
    const response = await axios.get<StravaActivity[]>(
      `${STRAVA_API_BASE}/athlete/activities`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page, per_page: perPage },
      }
    );

    return response.data;
  }

  /**
   * Create a webhook subscription
   */
  async createWebhookSubscription(
    callbackUrl: string,
    verifyToken: string
  ): Promise<{ id: number }> {
    const response = await axios.post<{ id: number }>(
      `${STRAVA_API_BASE}/push_subscriptions`,
      {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        callback_url: callbackUrl,
        verify_token: verifyToken,
      }
    );

    return response.data;
  }

  /**
   * Delete a webhook subscription
   */
  async deleteWebhookSubscription(subscriptionId: number): Promise<void> {
    await axios.delete(
      `${STRAVA_API_BASE}/push_subscriptions/${subscriptionId}`,
      {
        params: {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
        },
      }
    );
  }

  /**
   * View existing webhook subscriptions
   */
  async viewWebhookSubscriptions(): Promise<
    Array<{ id: number; callback_url: string }>
  > {
    const response = await axios.get<Array<{ id: number; callback_url: string }>>(
      `${STRAVA_API_BASE}/push_subscriptions`,
      {
        params: {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
        },
      }
    );

    return response.data;
  }
}

export const stravaService = StravaService.getInstance();
