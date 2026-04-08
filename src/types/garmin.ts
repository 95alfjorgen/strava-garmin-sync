// Garmin Connect API types

export interface GarminOAuth1Token {
  oauth_token: string;
  oauth_token_secret: string;
}

export interface GarminOAuth2Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface GarminTokens {
  oauth1: GarminOAuth1Token;
  oauth2: GarminOAuth2Token;
}

export interface GarminUploadResult {
  detailedImportResult: {
    uploadId: number;
    uploadUuid: {
      uuid: string;
    };
    owner: number;
    fileSize: number;
    processingTime: number;
    creationDate: string;
    ipAddress: string;
    fileName: string;
    report: unknown;
    successes: Array<{
      internalId: number;
      externalId: string;
      messages: string[];
    }>;
    failures: Array<{
      internalId: number;
      externalId: string;
      messages: Array<{
        code: number;
        content: string;
      }>;
    }>;
  };
}
