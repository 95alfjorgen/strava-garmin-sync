"use client";

import { createAuthClient } from "better-auth/react";

// Get base URL - use window.location in browser, fallback to env var or localhost
function getBaseURL(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

export const { signIn, signOut, useSession } = authClient;
