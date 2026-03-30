#!/usr/bin/env node
/**
 * Garmin Token Generator
 *
 * Run this script locally to generate Garmin session tokens.
 * This avoids rate limiting because it runs from your IP, not the server.
 *
 * Usage:
 *   node generate-garmin-token.js
 *
 * Then paste the output into OpenCadence.
 */

const readline = require('readline');

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
  console.log('\n🔐 Garmin Token Generator for OpenCadence\n');
  console.log('This will log in to Garmin and generate session tokens.');
  console.log('Your credentials are only used locally and not stored.\n');

  const email = await question('Garmin Email: ');
  const password = await question('Garmin Password: ');

  console.log('\n⏳ Connecting to Garmin...\n');

  try {
    // Dynamic import for ES module
    const { GarminConnect } = await import('garmin-connect');

    const client = new GarminConnect({
      username: email,
      password: password
    });

    await client.login();
    console.log('✅ Login successful!\n');

    // Export session tokens
    const tokens = await client.exportToken();

    if (!tokens) {
      console.error('❌ Failed to export tokens. Please try again.');
      process.exit(1);
    }

    const tokenJson = JSON.stringify(tokens);
    const tokenBase64 = Buffer.from(tokenJson).toString('base64');

    console.log('═'.repeat(60));
    console.log('\n📋 Copy this entire token and paste it into OpenCadence:\n');
    console.log('═'.repeat(60));
    console.log(tokenBase64);
    console.log('═'.repeat(60));
    console.log('\n✅ Done! Paste the token above into the OpenCadence dashboard.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('MFA') || error.message.includes('2FA')) {
      console.error('\n⚠️  Two-factor authentication is enabled.');
      console.error('Please disable 2FA in your Garmin account settings and try again.');
    } else if (error.message.includes('credentials') || error.message.includes('password')) {
      console.error('\n⚠️  Invalid email or password. Please check your credentials.');
    }

    process.exit(1);
  }

  rl.close();
}

main();
