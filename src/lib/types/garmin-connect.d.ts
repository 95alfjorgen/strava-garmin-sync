declare module 'garmin-connect' {
  interface GarminConnectOptions {
    username?: string;
    password?: string;
  }

  interface UploadResult {
    detailedImportResult?: {
      successes?: Array<{
        internalId?: number;
        externalId?: string;
      }>;
      failures?: Array<{
        internalId?: number;
        messages?: Array<{
          content?: string;
        }>;
      }>;
    };
  }

  interface IUserSettings {
    id?: number;
    displayName?: string;
  }

  interface ISocialProfile {
    displayName?: string;
    fullName?: string;
    userName?: string;
  }

  interface IOauth1Token {
    oauth_token: string;
    oauth_token_secret: string;
  }

  interface IOauth2Token {
    scope: string;
    jti?: string;
    access_token: string;
    token_type?: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in?: number;
    expires_at: number;
    refresh_token_expires_at?: number;
    last_update_date?: string;
    expires_date?: string;
  }

  interface IGarminTokens {
    oauth1: IOauth1Token;
    oauth2: IOauth2Token;
  }

  class GarminConnect {
    constructor(options?: GarminConnectOptions);

    client: {
      oauth1Token?: IOauth1Token;
      oauth2Token?: IOauth2Token;
    };

    login(username?: string, password?: string): Promise<GarminConnect>;

    getUserSettings(): Promise<IUserSettings>;

    getUserProfile(): Promise<ISocialProfile>;

    uploadActivity(
      file: Buffer | string,
      format?: string
    ): Promise<UploadResult>;

    exportToken(): IGarminTokens | undefined;

    exportTokenToFile(dirPath: string): void;

    loadToken(oauth1: IOauth1Token, oauth2: IOauth2Token): void;

    loadTokenByFile(dirPath: string): void;
  }

  export = GarminConnect;
}
