/**
 * Run this script locally to generate Garmin tokens.
 * Your home IP is less likely to be rate limited.
 *
 * Usage: node scripts/generate-garmin-token.js your-email@example.com your-password
 */

const { GarminConnect } = require('garmin-connect');

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node scripts/generate-garmin-token.js <email> <password>');
    process.exit(1);
  }

  console.log('Attempting Garmin login...');

  const client = new GarminConnect({
    username: email,
    password: password,
  });

  try {
    await client.login();
    console.log('Login successful!');

    // Get the tokens
    const oauth1 = client.client.oauth1Token;
    const oauth2 = client.client.oauth2Token;

    const tokenData = {
      oauth1,
      oauth2,
    };

    console.log('\n=== TOKEN DATA ===');
    console.log(JSON.stringify(tokenData));
    console.log('==================\n');

    console.log('Copy the JSON above and use it in the app settings to bypass the rate limit.');

    // Verify tokens work
    const profile = await client.getUserProfile();
    console.log('Verified - logged in as:', profile.displayName || profile.userName);

  } catch (error) {
    console.error('Login failed:', error.message);
    process.exit(1);
  }
}

main();
