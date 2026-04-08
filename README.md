# Strava2Garmin

A simple CLI tool to sync your Strava activities to Garmin Connect. Converts activities to FIT format and uploads them to your Garmin account.

## Features

- Sync recent Strava activities to Garmin Connect
- Full activity data transfer (GPS, heart rate, power, cadence)
- Tracks sync history to avoid duplicates
- Auto-refreshes Strava tokens when needed
- Simple token-based authentication for both services

## Prerequisites

- Node.js 18+
- A Strava API application (create at https://www.strava.com/settings/api)
- A Garmin Connect account (2FA must be disabled)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Strava Tokens

First, create a Strava API application at https://www.strava.com/settings/api

Then run the token generator:

```bash
STRAVA_CLIENT_ID=your_client_id STRAVA_CLIENT_SECRET=your_client_secret npm run setup:strava
```

This will:
1. Display an authorization URL - open it in your browser
2. Ask you to authorize the app on Strava
3. Output the tokens to add to your `.env` file

### 3. Generate Garmin Token

```bash
npm run setup:garmin
```

This will prompt for your Garmin email and password, then output a base64-encoded token.

**Note:** Two-factor authentication must be disabled on your Garmin account.

### 4. Configure Environment

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then fill in the values from the previous steps:

```env
# Strava API credentials
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret

# Strava OAuth tokens (from setup:strava)
STRAVA_ACCESS_TOKEN=your_access_token
STRAVA_REFRESH_TOKEN=your_refresh_token
STRAVA_TOKEN_EXPIRES_AT=1234567890

# Garmin token (from setup:garmin)
GARMIN_TOKEN=your_base64_encoded_token

# Optional settings
SYNC_DAYS=30        # How many days back to sync
DATA_DIR=./data     # Where to store sync history
```

## Usage

### Run a Sync

```bash
npm run sync
```

This will:
1. Fetch recent activities from Strava (last 30 days by default)
2. Filter out already-synced activities
3. Convert each new activity to FIT format
4. Upload to Garmin Connect
5. Update the sync history

### Automatic Syncing

Set up a cron job to run the sync periodically:

```bash
# Sync every hour
0 * * * * cd /path/to/strava2garmin && npm run sync >> /var/log/strava2garmin.log 2>&1
```

## How It Works

1. **Strava API**: Uses OAuth tokens to fetch your activities and detailed stream data (GPS, heart rate, etc.)

2. **FIT Conversion**: Converts Strava activity data to Garmin's FIT format using the official `@garmin/fitsdk`

3. **Garmin Upload**: Uses the `garmin-connect` package with stored session tokens to upload FIT files

4. **Sync History**: Tracks synced activities in `data/sync-history.json` to avoid duplicates

## Supported Activity Types

- Running (road, trail, treadmill)
- Cycling (road, mountain, gravel, e-bike, virtual)
- Swimming
- Walking & Hiking
- Weight Training & Yoga
- Winter sports (skiing, snowboarding)
- Water sports (rowing, kayaking, SUP)
- And more...

## Troubleshooting

### Token Expired

If you see authentication errors:

1. **Strava**: The sync script auto-refreshes tokens and updates your `.env` file
2. **Garmin**: Re-run `npm run setup:garmin` to generate a new token

### Garmin Login Fails

- Ensure 2FA is disabled on your Garmin account
- Check if your credentials are correct
- Garmin may temporarily block logins after too many attempts - wait and try again

### Activity Not Syncing

- Check if the activity is within the `SYNC_DAYS` range
- Look at `data/sync-history.json` to see if it was already synced
- Activities that originated from Garmin devices are skipped (check `external_id` contains "garmin")

## Project Structure

```
strava2garmin/
├── scripts/
│   ├── generate-garmin-token.js  # Garmin token generator
│   ├── generate-strava-token.js  # Strava OAuth helper
│   ├── sync.ts                   # Main sync script
│   └── config.ts                 # Configuration loading
├── src/
│   ├── services/
│   │   ├── strava.ts             # Strava API client
│   │   ├── garmin.ts             # Garmin Connect client
│   │   └── conversion.ts         # FIT file conversion
│   └── types/
│       ├── strava.ts             # Strava type definitions
│       └── garmin.ts             # Garmin type definitions
├── data/
│   └── sync-history.json         # Sync tracking (auto-created)
├── .env                          # Your configuration
└── .env.example                  # Example configuration
```

## License

MIT
