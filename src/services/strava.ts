import axios from 'axios';
import type { StravaActivity, StravaActivityStreams, StravaTokenResponse } from '../types/strava';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export interface StravaCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class StravaService {
  private credentials: StravaCredentials;

  constructor(credentials: StravaCredentials) {
    this.credentials = credentials;
  }

  /**
   * Check if the access token is expired and refresh if needed
   */
  async ensureValidToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 300; // 5 minute buffer

    if (this.credentials.expiresAt - bufferSeconds > now) {
      return this.credentials.accessToken;
    }

    console.log('Refreshing Strava access token...');

    const response = await axios.post<StravaTokenResponse>(STRAVA_TOKEN_URL, {
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: this.credentials.refreshToken,
    });

    this.credentials.accessToken = response.data.access_token;
    this.credentials.refreshToken = response.data.refresh_token;
    this.credentials.expiresAt = response.data.expires_at;

    console.log('Token refreshed successfully');
    console.log(`New token expires at: ${new Date(this.credentials.expiresAt * 1000).toISOString()}`);

    // Return updated credentials for saving
    return this.credentials.accessToken;
  }

  /**
   * Get updated credentials (useful after token refresh)
   */
  getCredentials(): StravaCredentials {
    return { ...this.credentials };
  }

  /**
   * Fetch recent activities from Strava
   */
  async getActivities(afterDate: Date, perPage: number = 100): Promise<StravaActivity[]> {
    const token = await this.ensureValidToken();
    const after = Math.floor(afterDate.getTime() / 1000);

    const activities: StravaActivity[] = [];
    let page = 1;

    while (true) {
      const response = await axios.get<StravaActivity[]>(`${STRAVA_API_BASE}/athlete/activities`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          after,
          per_page: perPage,
          page,
        },
      });

      if (response.data.length === 0) {
        break;
      }

      activities.push(...response.data);

      if (response.data.length < perPage) {
        break;
      }

      page++;
    }

    return activities;
  }

  /**
   * Fetch activity streams (detailed data points)
   */
  async getActivityStreams(activityId: number): Promise<StravaActivityStreams> {
    const token = await this.ensureValidToken();

    const streamTypes = [
      'time',
      'distance',
      'latlng',
      'altitude',
      'heartrate',
      'cadence',
      'watts',
      'temp',
    ];

    const response = await axios.get(`${STRAVA_API_BASE}/activities/${activityId}/streams`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        keys: streamTypes.join(','),
        key_by_type: true,
      },
    });

    return response.data as StravaActivityStreams;
  }

  /**
   * Get a single activity by ID
   */
  async getActivity(activityId: number): Promise<StravaActivity> {
    const token = await this.ensureValidToken();

    const response = await axios.get<StravaActivity>(`${STRAVA_API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }
}
