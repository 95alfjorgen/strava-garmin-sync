"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  stravaConnected: boolean;
  stravaAthleteId: number | null;
  stravaAthleteName: string | null;
  stravaAthleteImage: string | null;
  garminConnected: boolean;
  garminEmail: string | null;
  liveSyncEnabled: boolean;
}

interface SyncStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

interface SyncRecord {
  id: string;
  stravaActivityId: string;
  garminActivityId: string | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
  activityType: string | null;
  activityName: string | null;
  deviceName: string | null;
  syncedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  syncStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED" | null;
  garminActivityId: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [history, setHistory] = useState<SyncRecord[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [garminForm, setGarminForm] = useState({ email: "", password: "", tokenData: "" });
  const [garminLoading, setGarminLoading] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  const [useTokenMode, setUseTokenMode] = useState(false);
  const [syncingActivity, setSyncingActivity] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login");
      return;
    }
    if (session?.user) {
      fetchData();
    }
  }, [session, sessionPending, router]);

  async function fetchData() {
    try {
      const [userRes, statsRes, historyRes, activitiesRes] = await Promise.all([
        fetch("/api/user"),
        fetch("/api/sync/stats"),
        fetch("/api/sync/history?limit=10"),
        fetch("/api/strava/activities"),
      ]);

      if (!userRes.ok) {
        if (userRes.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch user data");
      }

      const userData = await userRes.json();
      setUser(userData);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData.records || []);
      }

      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        setActivities(activitiesData.activities || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function connectGarmin(e: React.FormEvent) {
    e.preventDefault();
    setGarminLoading(true);
    setGarminError(null);

    try {
      const endpoint = useTokenMode ? "/api/connect/garmin/token" : "/api/connect/garmin";
      const payload = useTokenMode
        ? { email: garminForm.email, password: garminForm.password, tokenData: garminForm.tokenData }
        : { email: garminForm.email, password: garminForm.password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect Garmin");
      }

      setGarminForm({ email: "", password: "", tokenData: "" });
      fetchData();
    } catch (err) {
      setGarminError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setGarminLoading(false);
    }
  }

  async function disconnectGarmin() {
    if (!confirm("Are you sure you want to disconnect your Garmin account?")) {
      return;
    }

    try {
      await fetch("/api/connect/garmin", { method: "DELETE" });
      fetchData();
    } catch (err) {
      console.error("Failed to disconnect Garmin:", err);
    }
  }

  async function disconnectStrava() {
    if (!confirm("Are you sure you want to disconnect your Strava account?")) {
      return;
    }

    try {
      await fetch("/api/connect/strava/disconnect", { method: "POST" });
      fetchData();
    } catch (err) {
      console.error("Failed to disconnect Strava:", err);
      alert("Failed to disconnect. Please try again.");
    }
  }

  async function syncActivity(activityId: number) {
    setSyncingActivity(activityId);
    try {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stravaActivityId: activityId }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Sync failed");
      } else if (data.status === "FAILED") {
        alert(`Sync failed: ${data.error || "Unknown error"}`);
      } else if (data.status === "COMPLETED") {
        alert("Activity synced to Garmin!");
      }
      fetchData();
    } catch (err) {
      console.error("Sync error:", err);
      alert("Failed to trigger sync");
    } finally {
      setSyncingActivity(null);
    }
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatDistance(meters: number): string {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-500 hover:bg-green-600">Synced</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      case "PROCESSING":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Processing</Badge>;
      case "SKIPPED":
        return <Badge variant="secondary">Skipped (Garmin)</Badge>;
      default:
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>;
    }
  }

  if (sessionPending || loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button asChild>
              <Link href="/">Go Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Account Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Signed in as</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt={session.user.name || ""}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="font-semibold">{session?.user?.name}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Strava Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                <svg className="w-5 h-5 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Strava
              </CardTitle>
              {user?.stravaConnected ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:text-green-300">
                  <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {user?.stravaConnected ? (
              <>
                <p className="text-sm text-muted-foreground">Connected as</p>
                <div className="flex items-center gap-3">
                  {user.stravaAthleteImage && (
                    <img
                      src={user.stravaAthleteImage}
                      alt={user.stravaAthleteName || ""}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  )}
                  <p className="text-2xl font-semibold">{user.stravaAthleteName}</p>
                </div>
                <Button variant="outline" size="sm" onClick={disconnectStrava}>
                  Disconnect Strava
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect your Strava account to sync activities
                </p>
                <Button asChild className="w-full bg-[#FC4C02] hover:bg-[#e34402]">
                  <Link href="/api/connect/strava">Connect Strava</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Garmin Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#007CC3" strokeWidth="2" />
                  <path d="M12 6v6l4 2" stroke="#007CC3" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Garmin Connect
              </CardTitle>
              {user?.garminConnected ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:text-green-300">
                  <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {user?.garminConnected ? (
              <>
                <p className="text-sm text-muted-foreground">Logged in as</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#007CC3] flex items-center justify-center text-white font-semibold text-lg">
                    {user.garminEmail?.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-xl font-semibold break-all">{user.garminEmail}</p>
                </div>
                <Button variant="outline" size="sm" onClick={disconnectGarmin}>
                  Disconnect Account
                </Button>
              </>
            ) : (
              <form onSubmit={connectGarmin} className="space-y-4">
                {garminError && (
                  <Alert variant="destructive">
                    <AlertDescription>{garminError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="tokenMode"
                    checked={useTokenMode}
                    onCheckedChange={(checked) => setUseTokenMode(checked as boolean)}
                  />
                  <label htmlFor="tokenMode" className="text-sm cursor-pointer">
                    Use token (bypass rate limit)
                  </label>
                </div>
                <Input
                  type="email"
                  placeholder="Garmin email"
                  value={garminForm.email}
                  onChange={(e) => setGarminForm({ ...garminForm, email: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  placeholder="Garmin password"
                  value={garminForm.password}
                  onChange={(e) => setGarminForm({ ...garminForm, password: e.target.value })}
                  required
                />
                {useTokenMode && (
                  <Textarea
                    placeholder="Paste token JSON from local script"
                    value={garminForm.tokenData}
                    onChange={(e) => setGarminForm({ ...garminForm, tokenData: e.target.value })}
                    className="min-h-[80px] text-xs font-mono"
                    required
                  />
                )}
                <Button type="submit" className="w-full" disabled={garminLoading}>
                  {garminLoading ? "Connecting..." : "Connect Garmin"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {useTokenMode
                    ? "Run locally: node scripts/generate-garmin-token.js email password"
                    : "Note: 2FA must be disabled. If rate limited, use token mode."}
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Activities</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Synced</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-yellow-500">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-500">{stats.failed}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Strava Activities */}
      {user?.stravaConnected && user?.garminConnected && activities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Strava Activities</CardTitle>
            <CardDescription>Your recent activities from Strava</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium">{activity.name}</TableCell>
                    <TableCell>{activity.sport_type || activity.type}</TableCell>
                    <TableCell>{formatDistance(activity.distance)}</TableCell>
                    <TableCell>{formatDuration(activity.moving_time)}</TableCell>
                    <TableCell>{new Date(activity.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {activity.syncStatus === "COMPLETED" ? (
                        <Badge className="bg-green-500">Synced</Badge>
                      ) : activity.syncStatus === "PROCESSING" || activity.syncStatus === "PENDING" ? (
                        <Badge className="bg-yellow-500">{activity.syncStatus}</Badge>
                      ) : activity.syncStatus === "FAILED" ? (
                        <Button
                          variant="link"
                          className="text-orange-500 p-0 h-auto"
                          onClick={() => syncActivity(activity.id)}
                          disabled={syncingActivity === activity.id}
                        >
                          {syncingActivity === activity.id ? "Syncing..." : "Retry"}
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          className="text-blue-500 p-0 h-auto"
                          onClick={() => syncActivity(activity.id)}
                          disabled={syncingActivity === activity.id}
                        >
                          {syncingActivity === activity.id ? "Syncing..." : "Sync to Garmin"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync History</CardTitle>
          <CardDescription>Activities processed by the sync service</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No activities synced yet. Complete a workout on Strava to see it here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {record.activityName || `Activity ${record.stravaActivityId}`}
                    </TableCell>
                    <TableCell>{record.activityType || "-"}</TableCell>
                    <TableCell>{record.deviceName || "-"}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell>{new Date(record.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
