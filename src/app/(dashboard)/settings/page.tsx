'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  stravaAthleteId: number;
  garminConnected: boolean;
  garminEmail: string | null;
  createdAt: string;
}

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch('/api/user');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/');
          return;
        }
        throw new Error('Failed to fetch user');
      }
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error('Error fetching user:', err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        'Are you sure you want to delete your account? This will remove all your data and cannot be undone.'
      )
    ) {
      return;
    }

    if (!confirm('This is your last chance. Delete account permanently?')) {
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await fetch('/api/user', { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      } else {
        alert('Failed to delete account');
      }
    } catch (err) {
      console.error('Error deleting account:', err);
      alert('Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            <span className="text-orange-500">Strava</span>
            <span className="text-slate-400 mx-1">to</span>
            <span className="text-blue-600">Garmin</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              Dashboard
            </Link>
            <Link href="/api/auth/logout" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              Log out
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Account Info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Account Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Strava Athlete ID</span>
              <span>{user?.stravaAthleteId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Garmin Account</span>
              <span>{user?.garminConnected ? user.garminEmail : 'Not connected'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Member since</span>
              <span>
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Sync Settings */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Sync Settings</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
            Activities are automatically synced when Strava sends a webhook notification.
            This typically happens within seconds of completing an activity.
          </p>
          <div className="flex items-center justify-between py-2 border-t border-slate-200 dark:border-slate-700">
            <span>Auto-sync enabled</span>
            <span className="badge badge-success">Active</span>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Data & Privacy</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-1">What we store</h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>- Strava OAuth tokens (for accessing your activities)</li>
                <li>- Garmin credentials (encrypted with AES-256-GCM)</li>
                <li>- Sync history (activity IDs and status)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-1">What we don&apos;t store</h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>- Your activity data (fetched on-demand and not persisted)</li>
                <li>- GPS tracks or workout details</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card border-red-200 dark:border-red-800">
          <h2 className="text-lg font-semibold mb-4 text-red-500">Danger Zone</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Deleting your account will permanently remove all your data including
            Strava tokens, Garmin credentials, and sync history. This action cannot
            be undone.
          </p>
          <button
            onClick={deleteAccount}
            disabled={deleteLoading}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {deleteLoading ? 'Deleting...' : 'Delete Account'}
          </button>
        </div>
      </div>
    </main>
  );
}
