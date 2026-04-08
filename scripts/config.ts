import 'dotenv/config';

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface GarminConfig {
  token: string; // Base64 encoded token from generate-garmin-token.js
}

export interface SyncConfig {
  daysToSync: number;
  dataDir: string;
}

export interface Config {
  strava: StravaConfig;
  garmin: GarminConfig;
  sync: SyncConfig;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    strava: {
      clientId: getEnvOrThrow('STRAVA_CLIENT_ID'),
      clientSecret: getEnvOrThrow('STRAVA_CLIENT_SECRET'),
      accessToken: getEnvOrThrow('STRAVA_ACCESS_TOKEN'),
      refreshToken: getEnvOrThrow('STRAVA_REFRESH_TOKEN'),
      expiresAt: parseInt(getEnvOrThrow('STRAVA_TOKEN_EXPIRES_AT'), 10),
    },
    garmin: {
      token: getEnvOrThrow('GARMIN_TOKEN'),
    },
    sync: {
      daysToSync: parseInt(getEnvOrDefault('SYNC_DAYS', '30'), 10),
      dataDir: getEnvOrDefault('DATA_DIR', './data'),
    },
  };
}

export function decodeGarminToken(base64Token: string): { oauth1: unknown; oauth2: unknown } {
  const json = Buffer.from(base64Token, 'base64').toString('utf-8');
  return JSON.parse(json);
}
