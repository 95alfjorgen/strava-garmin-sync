"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle, ExternalLink, Shield } from "lucide-react";
import Link from "next/link";

export default function ConnectGarminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [alreadyConnected, setAlreadyConnected] = useState(false);

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

  async function handleManualLogin() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/connect/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualLogin: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect Garmin");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
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
            A browser window will open for you to login securely to Garmin Connect.
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
              Due to Garmin&apos;s security measures, you&apos;ll need to login manually in a browser window.
              This ensures your credentials are entered directly on Garmin&apos;s website.
            </p>

            <Button
              onClick={handleManualLogin}
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for login...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Garmin Login
                </>
              )}
            </Button>

            {loading && (
              <Alert>
                <AlertDescription>
                  A browser window should have opened. Please login to Garmin Connect.
                  This page will update automatically when you complete the login.
                </AlertDescription>
              </Alert>
            )}
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
            <li>Click &quot;Open Garmin Login&quot; above</li>
            <li>A browser window will open to Garmin&apos;s login page</li>
            <li>Enter your Garmin credentials directly on their site</li>
            <li>Once logged in, the browser will close automatically</li>
            <li>Your session will be saved for future syncs</li>
          </ol>
          <div className="pt-2 border-t">
            <p className="font-medium text-foreground">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 pl-2 mt-1">
              <li>Sessions typically last 24 hours</li>
              <li>You may need to re-login periodically</li>
              <li>Two-factor authentication is supported</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
