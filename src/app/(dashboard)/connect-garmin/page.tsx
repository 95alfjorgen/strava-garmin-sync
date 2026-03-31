"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle, ExternalLink, Shield, X } from "lucide-react";
import Link from "next/link";

export default function ConnectGarminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [alreadyConnected, setAlreadyConnected] = useState(false);

  // Browserless session state
  const [loginSessionId, setLoginSessionId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session?.user) {
      checkStatus();
    }
  }, [session]);

  // Poll for login completion when browser is shown (Browserless mode)
  const pollForCompletion = useCallback(async () => {
    if (!loginSessionId) return;

    try {
      const res = await fetch(`/api/connect/garmin/session?sessionId=${loginSessionId}`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.status === 'success') {
        setSuccess(true);
        setShowBrowser(false);
        setLiveUrl(null);
        setLoginSessionId(null);
      } else if (data.status === 'failed') {
        setError(data.error || 'Login failed');
        setShowBrowser(false);
        setLiveUrl(null);
        setLoginSessionId(null);
      }
      // If pending or not_found, keep polling
    } catch (err) {
      console.error("Poll error:", err);
    }
  }, [loginSessionId]);

  useEffect(() => {
    if (!showBrowser || !loginSessionId) return;

    const interval = setInterval(pollForCompletion, 3000);
    return () => clearInterval(interval);
  }, [showBrowser, loginSessionId, pollForCompletion]);

  async function checkStatus() {
    try {
      const res = await fetch("/api/connect/garmin/status");
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          setAlreadyConnected(true);
        }
      }
    } catch (err) {
      console.error("Failed to check status:", err);
    } finally {
      setCheckingStatus(false);
    }
  }

  // Try Browserless first, fall back to local if not available
  async function handleStartLogin() {
    setLoading(true);
    setError(null);

    try {
      // First, try the Browserless session API
      const sessionRes = await fetch("/api/connect/garmin/session", {
        method: "POST",
      });

      const sessionData = await sessionRes.json();

      if (sessionRes.ok && sessionData.liveUrl) {
        // Browserless mode - show embedded browser
        setLoginSessionId(sessionData.sessionId);
        setLiveUrl(sessionData.liveUrl);
        setShowBrowser(true);
        return;
      }

      // If Browserless session API returned an error, show it
      if (sessionData.error) {
        throw new Error(sessionData.error);
      }

      // If Browserless not available, try local mode
      const localRes = await fetch("/api/connect/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualLogin: true }),
      });

      const localData = await localRes.json();

      if (localRes.ok) {
        setSuccess(true);
        return;
      }

      // Check if we need to use Browserless but it failed
      if (localData.useBrowserless) {
        throw new Error("Browserless service failed. Check server logs for details.");
      }

      throw new Error(localData.error || "Failed to start login session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelLogin() {
    if (loginSessionId) {
      try {
        await fetch(`/api/connect/garmin/session?sessionId=${loginSessionId}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore cancel errors
      }
    }

    setShowBrowser(false);
    setLiveUrl(null);
    setLoginSessionId(null);
  }

  if (isPending || checkingStatus) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (success || alreadyConnected) {
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

  // Show embedded browser for login (Browserless mode)
  if (showBrowser && liveUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleCancelLogin}>
              <X className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Login to Garmin Connect</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for login...
          </div>
        </div>

        <Alert>
          <AlertDescription>
            Login to your Garmin account in the browser below. This page will update automatically when you complete the login.
          </AlertDescription>
        </Alert>

        <div className="border rounded-lg overflow-hidden bg-white" style={{ height: '70vh' }}>
          <iframe
            src={liveUrl}
            className="w-full h-full"
            title="Garmin Login"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>

        <div className="flex justify-center">
          <Button variant="outline" onClick={handleCancelLogin}>
            Cancel Login
          </Button>
        </div>
      </div>
    );
  }

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
          <CardTitle>Login to Garmin Connect</CardTitle>
          <CardDescription>
            A secure browser window will open for you to login to Garmin Connect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Due to Garmin&apos;s security measures, you&apos;ll login through a secure browser session.
              Your credentials are entered directly on Garmin&apos;s website.
            </p>

            <Button
              onClick={handleStartLogin}
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting session...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect Garmin Account
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2">
            <li>Click &quot;Connect Garmin Account&quot; above</li>
            <li>A secure browser session will open</li>
            <li>Enter your Garmin credentials directly on their site</li>
            <li>Once logged in, you&apos;ll be redirected back automatically</li>
            <li>Your session will be saved for future syncs</li>
          </ol>
          <div className="pt-2 border-t">
            <p className="font-medium text-foreground">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 mt-1">
              <li>Sessions typically last several weeks</li>
              <li>You may need to re-login periodically</li>
              <li>Two-factor authentication is supported</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
