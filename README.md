# Strava to Garmin Sync

Automatically sync your Strava activities to Garmin Connect. When you complete a workout on Strava, it's automatically converted to FIT format and uploaded to your Garmin account.

## Features

- Real-time sync via Strava webhooks
- Full activity data transfer (GPS, heart rate, power, cadence)
- Secure credential storage with AES-256-GCM encryption
- Background job processing with BullMQ
- Dashboard to monitor sync status

## Tech Stack

- **Framework:** Next.js 14 with TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Queue:** Redis with BullMQ
- **Garmin Integration:** garmin-connect npm package
- **FIT Conversion:** @garmin/fitsdk

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis server
- Strava API application (create at https://www.strava.com/settings/api)

## Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd strava-garmin-sync
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `STRAVA_CLIENT_ID` | Your Strava API client ID |
| `STRAVA_CLIENT_SECRET` | Your Strava API client secret |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Random string for webhook verification |
| `ENCRYPTION_KEY` | 64-character hex string (32 bytes) for AES-256 |
| `SESSION_SECRET` | At least 32 characters for session encryption |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL |

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set Up Database

```bash
npm run db:push
```

### 4. Run the Application

In one terminal, start the Next.js app:

```bash
npm run dev
```

In another terminal, start the background worker:

```bash
npm run worker:dev
```

### 5. Configure Strava Webhook

After deploying to a public URL, create a webhook subscription:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://your-app.com/api/webhooks/strava \
  -F verify_token=YOUR_VERIFY_TOKEN
```

## Usage

1. Visit your app and click "Connect with Strava"
2. Authorize the app to access your Strava activities
3. Enter your Garmin Connect credentials
4. Complete a workout on Strava - it will automatically sync to Garmin

## Important Notes

### Garmin Account Requirements

- **2FA must be disabled** on your Garmin account for automatic sync to work
- The garmin-connect package uses unofficial APIs and may break if Garmin changes their authentication

### Security

- Garmin credentials are encrypted at rest with AES-256-GCM
- Strava uses standard OAuth 2.0 authentication
- All sensitive data is stored encrypted in the database

## Deployment on Railway

The app is designed to run on Railway with the following services:

| Service | Purpose |
|---------|---------|
| Web | Next.js application |
| Worker | Background job processor |
| PostgreSQL | Database |
| Redis | Job queue |

Create a `Procfile` for Railway:

```
web: npm run start
worker: npm run worker
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/strava` | GET | Initiate Strava OAuth |
| `/api/auth/strava/callback` | GET | Handle OAuth callback |
| `/api/auth/garmin/connect` | POST | Submit Garmin credentials |
| `/api/auth/garmin/connect` | DELETE | Disconnect Garmin |
| `/api/webhooks/strava` | GET | Webhook verification |
| `/api/webhooks/strava` | POST | Receive activity events |
| `/api/sync/history` | GET | View sync history |
| `/api/sync/trigger` | POST | Manual sync trigger |
| `/api/sync/stats` | GET | Get sync statistics |
| `/api/user` | GET | Get user info |
| `/api/user` | DELETE | Delete account |

## License

MIT
