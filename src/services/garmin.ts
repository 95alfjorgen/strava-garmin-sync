import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { GarminTokens, GarminUploadResult } from '../types/garmin';

// Dynamic import for garmin-connect ES module
let GarminConnect: typeof import('garmin-connect').GarminConnect;

async function getGarminConnect() {
  if (!GarminConnect) {
    const module = await import('garmin-connect');
    GarminConnect = module.GarminConnect;
  }
  return GarminConnect;
}

export class GarminService {
  private tokens: GarminTokens;
  private client: InstanceType<typeof import('garmin-connect').GarminConnect> | null = null;

  constructor(base64Token: string) {
    const json = Buffer.from(base64Token, 'base64').toString('utf-8');
    this.tokens = JSON.parse(json);
  }

  /**
   * Initialize the Garmin client with stored tokens
   */
  async connect(): Promise<void> {
    const GC = await getGarminConnect();
    this.client = new GC();

    // Load the stored tokens instead of logging in
    // Cast to any since the token format from exportToken() is compatible
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.client.loadToken(this.tokens.oauth1 as any, this.tokens.oauth2 as any);

    console.log('Garmin client connected with stored tokens');
  }

  /**
   * Upload a FIT file to Garmin Connect
   */
  async uploadActivity(fitBuffer: Buffer, fileName: string): Promise<GarminUploadResult> {
    if (!this.client) {
      throw new Error('Garmin client not connected. Call connect() first.');
    }

    // Write buffer to a temp file since garmin-connect expects a file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, fileName);

    try {
      fs.writeFileSync(tempFilePath, fitBuffer);
      const result = await this.client.uploadActivity(tempFilePath, 'fit');
      return result as GarminUploadResult;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Check if upload was successful
   */
  isUploadSuccessful(result: GarminUploadResult): boolean {
    const detailedResult = result.detailedImportResult;
    return (
      detailedResult.successes.length > 0 &&
      detailedResult.failures.length === 0
    );
  }

  /**
   * Get the Garmin activity ID from upload result
   */
  getUploadedActivityId(result: GarminUploadResult): number | null {
    const detailedResult = result.detailedImportResult;
    if (detailedResult.successes.length > 0) {
      return detailedResult.successes[0].internalId;
    }
    return null;
  }

  /**
   * Get error messages from failed upload
   */
  getUploadErrors(result: GarminUploadResult): string[] {
    const detailedResult = result.detailedImportResult;
    return detailedResult.failures.flatMap((failure) =>
      failure.messages.map((msg) => msg.content)
    );
  }
}
