import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Strava OAuth
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // Encryption (32 bytes = 64 hex characters)
  ENCRYPTION_KEY: z.string().length(64),

  // Session
  SESSION_SECRET: z.string().min(32),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map((e: z.ZodIssue) => e.path.join('.')).join(', ');
      console.error(`Missing or invalid environment variables: ${missingVars}`);
      console.error('Please check your .env file and ensure all required variables are set.');
      console.error('\nRequired variables:');
      console.error('  DATABASE_URL - PostgreSQL connection string');
      console.error('  REDIS_URL - Redis connection string');
      console.error('  STRAVA_CLIENT_ID - Strava API client ID');
      console.error('  STRAVA_CLIENT_SECRET - Strava API client secret');
      console.error('  STRAVA_WEBHOOK_VERIFY_TOKEN - Token for webhook verification');
      console.error('  ENCRYPTION_KEY - 64-character hex string (32 bytes) for AES-256-GCM');
      console.error('  SESSION_SECRET - At least 32 characters for session encryption');
    }
    throw error;
  }
}

// Only validate in non-build contexts
export const env =
  process.env.SKIP_ENV_VALIDATION === 'true' ? (process.env as unknown as Env) : validateEnv();
