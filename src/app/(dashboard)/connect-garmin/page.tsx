"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle, Clock, Shield } from "lucide-react";
import Link from "next/link";

export default function ConnectGarminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRateLimited(false);

    try {
      const res = await fetch("/api/connect/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.rateLimited || data.error?.toLowerCase().includes("rate") || data.error?.includes("429")) {
          setRateLimited(true);
          return;
        }
        throw new Error(data.error || "Failed to connect Garmin");
      }

      setSuccess(true);
      setEmail("");
      setPassword("");
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

  if (rateLimited) {
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
              <Clock className="h-16 w-16 text-orange-500 mx-auto" />
              <h2 className="text-xl font-semibold">Please Try Again Later</h2>
              <p className="text-muted-foreground">
                Garmin is temporarily limiting connection attempts. This is a Garmin security measure, not an issue with your credentials.
              </p>
              <p className="text-sm text-muted-foreground">
                Please wait <strong>1-2 hours</strong> and try again.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={() => setRateLimited(false)}>
                  Try Again Now
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
            Connect your Garmin account to sync activities from Strava.
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
                  Authenticating via secure browser...
                </>
              ) : (
                "Connect Garmin"
              )}
            </Button>

            {loading && (
              <p className="text-xs text-muted-foreground text-center">
                This may take up to 30 seconds while we securely authenticate with Garmin.
              </p>
            )}
          </form>
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
          <p>
            We use a secure headless browser to authenticate with Garmin Connect,
            which provides the most reliable connection method.
          </p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Two-factor authentication must be disabled on Garmin</li>
              <li>Your credentials are encrypted and stored securely</li>
              <li>Sessions typically last 12 hours and auto-refresh</li>
              <li>If a CAPTCHA or security challenge appears, you may need to log in to Garmin Connect manually first</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
