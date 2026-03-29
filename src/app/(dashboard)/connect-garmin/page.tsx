"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle, Clock, XCircle } from "lucide-react";
import Link from "next/link";

interface QueueStatus {
  connected: boolean;
  queued: boolean;
  status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  position?: number | null;
  errorMessage?: string | null;
  retryCount?: number;
  nextRetryAt?: string | null;
}

export default function ConnectGarminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/garmin/status");
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to check status:", err);
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  // Initial status check
  useEffect(() => {
    if (session?.user) {
      checkStatus().finally(() => setCheckingStatus(false));
    }
  }, [session, checkStatus]);

  // Poll for status updates when queued
  useEffect(() => {
    if (queueStatus?.queued && (queueStatus.status === "PENDING" || queueStatus.status === "PROCESSING")) {
      const interval = setInterval(async () => {
        const status = await checkStatus();
        if (status?.connected || status?.status === "FAILED" || status?.status === "COMPLETED") {
          clearInterval(interval);
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [queueStatus, checkStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/connect/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok && !data.queued) {
        throw new Error(data.error || "Failed to connect Garmin");
      }

      if (data.success) {
        // Immediate success
        setQueueStatus({ connected: true, queued: false });
      } else if (data.queued) {
        // Queued for processing
        setQueueStatus({
          connected: false,
          queued: true,
          status: "PENDING",
          position: data.position,
        });
      }

      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function cancelQueue() {
    try {
      await fetch("/api/connect/garmin", { method: "DELETE" });
      setQueueStatus(null);
    } catch (err) {
      console.error("Failed to cancel:", err);
    }
  }

  async function retryConnection() {
    setQueueStatus(null);
    setError(null);
  }

  if (isPending || checkingStatus) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Already connected
  if (queueStatus?.connected) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold">Garmin Connected!</h2>
              <p className="text-muted-foreground">
                Your Garmin account is connected. Activities will sync automatically.
              </p>
              <Button asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Queued - pending or processing
  if (queueStatus?.queued && (queueStatus.status === "PENDING" || queueStatus.status === "PROCESSING")) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Connect Garmin</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Clock className="h-16 w-16 text-blue-500 mx-auto animate-pulse" />
              <h2 className="text-xl font-semibold">Connection Queued</h2>
              <p className="text-muted-foreground">
                Your connection request is being processed.
                {queueStatus.position && queueStatus.position > 1 && (
                  <> Position in queue: <strong>{queueStatus.position}</strong></>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {queueStatus.status === "PROCESSING"
                  ? "Currently attempting to connect..."
                  : "We process connections slowly to avoid Garmin rate limits."}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking status...
              </div>
              <Button variant="outline" onClick={cancelQueue}>
                Cancel Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Queued - failed
  if (queueStatus?.queued && queueStatus.status === "FAILED") {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Connect Garmin</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <XCircle className="h-16 w-16 text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold">Connection Failed</h2>
              <p className="text-muted-foreground">
                {queueStatus.errorMessage || "Unable to connect to Garmin"}
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={retryConnection}>
                  Try Again
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard">Go Back</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show connection form
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Connect Garmin</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter Your Garmin Credentials</CardTitle>
          <CardDescription>
            We&apos;ll securely connect to your Garmin account to upload activities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Garmin Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Garmin Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Garmin"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Enter your Garmin credentials</p>
          <p>2. We&apos;ll try to connect immediately</p>
          <p>3. If Garmin rate-limits, your request is queued</p>
          <p>4. We&apos;ll process it within a few minutes</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security & Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Your password is encrypted with AES-256-GCM</p>
          <p>• We only use credentials to upload activities</p>
          <p>• Two-factor authentication must be disabled</p>
          <p>• You can disconnect at any time</p>
        </CardContent>
      </Card>
    </div>
  );
}
