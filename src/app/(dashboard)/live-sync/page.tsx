'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Check, X, Info } from 'lucide-react';

interface User {
  garminConnected: boolean;
  liveSyncEnabled: boolean;
}

export default function LiveSyncPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch('/api/user');
      if (res.ok) {
        const data = await res.json();
        setUser({
          garminConnected: data.garminConnected,
          liveSyncEnabled: data.liveSyncEnabled,
        });
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }

  async function toggleLiveSync() {
    if (!user) return;
    setToggling(true);
    try {
      const res = await fetch('/api/user/live-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !user.liveSyncEnabled }),
      });

      if (res.ok) {
        setUser({ ...user, liveSyncEnabled: !user.liveSyncEnabled });
      }
    } catch {
      // Ignore errors
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user?.garminConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Live Sync
            </CardTitle>
            <CardDescription>
              Automatically sync your Strava activities to Garmin Connect
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Connect your Garmin account on the Dashboard to enable Live Sync.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Status Card */}
      <Card className={user.liveSyncEnabled
        ? "border-green-200 dark:border-green-800"
        : ""
      }>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user.liveSyncEnabled ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <RefreshCw className="h-5 w-5 text-green-600 dark:text-green-400 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <RefreshCw className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <CardTitle className="text-xl">Live Sync</CardTitle>
                <CardDescription>
                  {user.liveSyncEnabled ? 'Active and syncing' : 'Currently disabled'}
                </CardDescription>
              </div>
            </div>
            <Badge variant={user.liveSyncEnabled ? "default" : "secondary"} className={user.liveSyncEnabled ? "bg-green-500 hover:bg-green-600" : ""}>
              {user.liveSyncEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-4 border-t">
            <div>
              <Label htmlFor="live-sync-toggle" className="text-base font-medium">
                Enable Live Sync
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically sync new activities when they appear on Strava
              </p>
            </div>
            <Switch
              id="live-sync-toggle"
              checked={user.liveSyncEnabled}
              onCheckedChange={toggleLiveSync}
              disabled={toggling}
            />
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How Live Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When enabled, Live Sync automatically transfers your Strava activities to Garmin Connect
            within seconds of completing a workout.
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Non-Garmin devices</p>
                <p className="text-sm text-muted-foreground">
                  Activities recorded on phones, Wahoo, Hammerhead, etc. are synced to Garmin
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Garmin devices</p>
                <p className="text-sm text-muted-foreground">
                  Activities from Garmin watches/computers are automatically skipped to avoid duplicates
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
          <CardDescription>
            Fine-tune how Live Sync behaves
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Smart Device Detection</p>
              <p className="text-sm text-muted-foreground">
                Automatically detect and skip Garmin-recorded activities
              </p>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-600">
              Always On
            </Badge>
          </div>

          <div className="flex items-center justify-between py-2 border-t">
            <div>
              <p className="text-sm font-medium">Sync Timing</p>
              <p className="text-sm text-muted-foreground">
                Activities sync within seconds via Strava webhooks
              </p>
            </div>
            <Badge variant="outline">
              Real-time
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
