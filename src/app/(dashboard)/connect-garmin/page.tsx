"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function ConnectGarminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    // Check for success/error from callback
    const garminConnected = searchParams.get("garmin_connected");
    const garminError = searchParams.get("garmin_error");

    if (garminConnected === "true") {
      setSuccess(true);
    }
    if (garminError) {
      setError(decodeURIComponent(garminError).replace(/_/g, " "));
    }
  }, [searchParams]);

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

      if (!res.ok) {
        // Check if rate limited
        if (res.status === 429 && data.retryAfter) {
          const minutes = Math.ceil(data.retryAfter / 60);
          throw new Error(`Garmin is rate limiting. Please wait ${minutes} minute(s) and try again.`);
        } else {
          throw new Error(data.error || "Failed to connect Garmin");
        }
      } else {
        setSuccess(true);
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold">Garmin Connected!</h2>
              <p className="text-muted-foreground">
                Your Garmin account has been successfully connected. Activities will now sync automatically.
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
          <CardTitle className="text-base">Security & Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Your password is encrypted with AES-256-GCM before storage</p>
          <p>• We only use your credentials to upload activities</p>
          <p>• Two-factor authentication must be disabled on Garmin</p>
          <p>• You can disconnect at any time from the dashboard</p>
        </CardContent>
      </Card>
    </div>
  );
}
