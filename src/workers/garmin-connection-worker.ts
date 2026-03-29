import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "@/lib/encryption";

const prisma = new PrismaClient();

// Rate limiting: process one connection every 30 seconds to avoid Garmin rate limits
const PROCESS_INTERVAL_MS = 30000;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 60000; // 1 minute base delay, exponential backoff

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GarminConnectClass = any;
let GarminConnect: GarminConnectClass | null = null;

async function getGarminConnectClass(): Promise<GarminConnectClass> {
  if (!GarminConnect) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gc = require("garmin-connect");
    GarminConnect = gc.GarminConnect || gc.default || gc;
  }
  return GarminConnect;
}

async function processConnection(
  queueEntry: {
    id: string;
    userId: string;
    garminEmail: string;
    garminPasswordEnc: string;
    retryCount: number;
  }
): Promise<{ success: boolean; error?: string; sessionData?: string }> {
  const password = decrypt(queueEntry.garminPasswordEnc);
  const GC = await getGarminConnectClass();

  const client = new GC({
    username: queueEntry.garminEmail,
    password: password,
  });

  try {
    console.log(`Attempting Garmin login for ${queueEntry.garminEmail}...`);
    await client.login();
    console.log(`Login successful for ${queueEntry.garminEmail}`);

    // Export session tokens
    let sessionData: string | undefined;
    try {
      const exportedSession = await client.exportToken();
      if (exportedSession) {
        sessionData = JSON.stringify(exportedSession);
      }
    } catch {
      console.warn("Could not export session tokens");
    }

    return { success: true, sessionData };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Login failed for ${queueEntry.garminEmail}: ${message}`);

    // Check for specific error types
    if (message.includes("MFA") || message.includes("2FA")) {
      return {
        success: false,
        error: "Two-factor authentication is enabled. Please disable 2FA on your Garmin account.",
      };
    }

    if (message.includes("Invalid") || message.includes("credentials") || message.includes("password")) {
      return {
        success: false,
        error: "Invalid email or password. Please check your credentials.",
      };
    }

    if (message.includes("429") || message.toLowerCase().includes("rate")) {
      return {
        success: false,
        error: "RATE_LIMITED",
      };
    }

    return { success: false, error: message };
  }
}

async function processQueue() {
  // Get the next pending connection that's ready for processing
  const queueEntry = await prisma.garminConnectionQueue.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!queueEntry) {
    return; // No work to do
  }

  console.log(`Processing connection for user ${queueEntry.userId} (attempt ${queueEntry.retryCount + 1})`);

  // Mark as processing
  await prisma.garminConnectionQueue.update({
    where: { id: queueEntry.id },
    data: { status: "PROCESSING" },
  });

  const result = await processConnection(queueEntry);

  if (result.success) {
    // Update user record with Garmin connection
    await prisma.user.update({
      where: { id: queueEntry.userId },
      data: {
        garminEmail: queueEntry.garminEmail,
        garminPasswordEnc: queueEntry.garminPasswordEnc,
        garminSessionData: result.sessionData,
        garminConnected: true,
      },
    });

    // Mark queue entry as completed
    await prisma.garminConnectionQueue.update({
      where: { id: queueEntry.id },
      data: { status: "COMPLETED" },
    });

    console.log(`Successfully connected Garmin for user ${queueEntry.userId}`);
  } else if (result.error === "RATE_LIMITED") {
    // Rate limited - retry later with exponential backoff
    const newRetryCount = queueEntry.retryCount + 1;
    const delay = RETRY_DELAY_MS * Math.pow(2, newRetryCount - 1); // Exponential backoff

    if (newRetryCount >= MAX_RETRIES) {
      await prisma.garminConnectionQueue.update({
        where: { id: queueEntry.id },
        data: {
          status: "FAILED",
          errorMessage: "Max retries exceeded due to Garmin rate limiting. Please try again later.",
          retryCount: newRetryCount,
        },
      });
      console.log(`Max retries exceeded for user ${queueEntry.userId}`);
    } else {
      await prisma.garminConnectionQueue.update({
        where: { id: queueEntry.id },
        data: {
          status: "PENDING",
          retryCount: newRetryCount,
          nextRetryAt: new Date(Date.now() + delay),
        },
      });
      console.log(`Rate limited, will retry in ${delay / 1000}s for user ${queueEntry.userId}`);
    }
  } else {
    // Other error - don't retry
    await prisma.garminConnectionQueue.update({
      where: { id: queueEntry.id },
      data: {
        status: "FAILED",
        errorMessage: result.error,
      },
    });
    console.log(`Connection failed for user ${queueEntry.userId}: ${result.error}`);
  }
}

async function cleanupOldEntries() {
  // Clean up completed/failed entries older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const deleted = await prisma.garminConnectionQueue.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED"] },
      updatedAt: { lt: cutoff },
    },
  });

  if (deleted.count > 0) {
    console.log(`Cleaned up ${deleted.count} old queue entries`);
  }
}

async function main() {
  console.log("Starting Garmin connection worker...");
  console.log(`Processing interval: ${PROCESS_INTERVAL_MS / 1000}s`);

  // Initial cleanup
  await cleanupOldEntries();

  // Process queue periodically
  const processLoop = async () => {
    try {
      await processQueue();
    } catch (error) {
      console.error("Error processing queue:", error);
    }
  };

  // Run immediately, then on interval
  await processLoop();
  const processInterval = setInterval(processLoop, PROCESS_INTERVAL_MS);

  // Cleanup old entries every hour
  const cleanupInterval = setInterval(cleanupOldEntries, 60 * 60 * 1000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down Garmin connection worker...");
    clearInterval(processInterval);
    clearInterval(cleanupInterval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Garmin connection worker is ready and waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start Garmin connection worker:", err);
  process.exit(1);
});
