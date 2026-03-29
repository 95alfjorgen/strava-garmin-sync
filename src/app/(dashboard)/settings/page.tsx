"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  email: string;
  name: string | null;
  stravaConnected: boolean;
  stravaAthleteId: number | null;
  garminConnected: boolean;
  garminEmail: string | null;
  createdAt: string;
}

export default function Settings() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login");
      return;
    }
    if (session?.user) {
      fetchUser();
    }
  }, [session, sessionPending, router]);

  async function fetchUser() {
    try {
      const res = await fetch("/api/user");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch user");
      }
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("Error fetching user:", err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Are you sure you want to delete your account? This will remove all your data and cannot be undone."
      )
    ) {
      return;
    }

    if (!confirm("This is your last chance. Delete account permanently?")) {
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await fetch("/api/user", { method: "DELETE" });
      if (res.ok) {
        await signOut();
        router.push("/");
      } else {
        alert("Failed to delete account");
      }
    } catch (err) {
      console.error("Error deleting account:", err);
      alert("Failed to delete account");
    } finally {
      setDeleteLoading(false);
    }
  }

  if (sessionPending || loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Name</span>
            <span>{user?.name || "-"}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Strava</span>
            <span className="flex items-center gap-2">
              {user?.stravaConnected ? (
                <>
                  <Badge className="bg-green-100 text-green-700">Connected</Badge>
                  <span className="text-sm text-muted-foreground">
                    ID: {user.stravaAthleteId}
                  </span>
                </>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Garmin</span>
            <span>
              {user?.garminConnected ? (
                <Badge className="bg-green-100 text-green-700">{user.garminEmail}</Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted-foreground">Member since</span>
            <span>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm mb-4">
            Activities are automatically synced when Strava sends a webhook notification. This
            typically happens within seconds of completing an activity.
          </p>
          <div className="flex items-center justify-between py-2 border-t">
            <span>Auto-sync enabled</span>
            <Badge className="bg-green-100 text-green-700">Active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Data & Privacy */}
      <Card>
        <CardHeader>
          <CardTitle>Data & Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">What we store</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- Google account info (email, name, profile picture)</li>
              <li>- Strava OAuth tokens (for accessing your activities)</li>
              <li>- Garmin credentials (encrypted with AES-256-GCM)</li>
              <li>- Sync history (activity IDs and status)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-2">What we don&apos;t store</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- Your activity data (fetched on-demand and not persisted)</li>
              <li>- GPS tracks or workout details</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="text-red-500">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting your account will permanently remove all your data including Strava tokens,
            Garmin credentials, and sync history. This action cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={deleteAccount}
            disabled={deleteLoading}
          >
            {deleteLoading ? "Deleting..." : "Delete Account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
