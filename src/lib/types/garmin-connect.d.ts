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

  interface UserInfo {
    displayName?: string;
    fullName?: string;
    userName?: string;
  }

  interface TokenData {
    oauth1Token?: string;
    oauth1TokenSecret?: string;
    oauth2Token?: string;
  }

  class GarminConnect {
    constructor(options?: GarminConnectOptions);

    login(email: string, password: string): Promise<void>;

    getUserInfo(): Promise<UserInfo>;

    uploadActivity(
      file: Buffer | string,
      format?: string
    ): Promise<UploadResult>;

    exportToken(): Promise<TokenData | undefined>;

    loadToken(token: TokenData): Promise<void>;
  }

  export = GarminConnect;
}
