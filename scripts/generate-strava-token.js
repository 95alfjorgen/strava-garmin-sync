#!/usr/bin/env node
/**
 * Strava Token Generator
 *
 * Run this script locally to generate Strava OAuth tokens.
 * This opens a browser for OAuth authorization and captures the callback.
 *
 * Usage:
 *   STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=xxx node scripts/generate-strava-token.js
 *
 * Then add the output tokens to your .env file.
 */

const http = require('http');
const readline = require('readline');
const { URL } = require('url');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n🚴 Strava Token Generator\n');
  console.log('This will help you generate OAuth tokens for Strava API access.\n');

  // Get client credentials from env or prompt
  let clientId = process.env.STRAVA_CLIENT_ID;
  let clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId) {
    clientId = await question('Strava Client ID: ');
  }
  if (!clientSecret) {
    clientSecret = await question('Strava Client Secret: ');
  }

  const port = 8888;
  const redirectUri = `http://localhost:${port}/callback`;
  const scope = 'read,activity:read_all';

  // Build authorization URL
  const authUrl = new URL('https://www.strava.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);

  console.log('\n📋 Open this URL in your browser:\n');
  console.log('═'.repeat(60));
  console.log(authUrl.toString());
  console.log('═'.repeat(60));
  console.log('\n⏳ Waiting for authorization callback...\n');

  // Start local server to capture callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Failed</h1><p>You can close this window.</p>');
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p>');
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.listen(port, () => {
      console.log(`Listening on port ${port}...`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });

  console.log('✅ Authorization code received!\n');
  console.log('⏳ Exchanging code for tokens...\n');

  // Exchange code for tokens
  const tokenUrl = 'https://www.strava.com/oauth/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Token exchange failed:', error);
    process.exit(1);
  }

  const tokens = await response.json();

  console.log('✅ Tokens received!\n');
  console.log('═'.repeat(60));
  console.log('\n📋 Add these to your .env file:\n');
  console.log('═'.repeat(60));
  console.log(`STRAVA_CLIENT_ID=${clientId}`);
  console.log(`STRAVA_CLIENT_SECRET=${clientSecret}`);
  console.log(`STRAVA_ACCESS_TOKEN=${tokens.access_token}`);
  console.log(`STRAVA_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`STRAVA_TOKEN_EXPIRES_AT=${tokens.expires_at}`);
  console.log('═'.repeat(60));

  if (tokens.athlete) {
    console.log(`\n👤 Authenticated as: ${tokens.athlete.firstname} ${tokens.athlete.lastname}`);
  }

  console.log('\n✅ Done!\n');

  rl.close();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
