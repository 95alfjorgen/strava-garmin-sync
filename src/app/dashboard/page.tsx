'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface User {
  id: string;
  stravaAthleteId: number;
  garminConnected: boolean;
  garminEmail: string | null;
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
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  activityType: string | null;
  activityName: string | null;
  syncedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [history, setHistory] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [garminForm, setGarminForm] = useState({ email: '', password: '' });
  const [garminLoading, setGarminLoading] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [userRes, statsRes, historyRes] = await Promise.all([
        fetch('/api/user', { credentials: 'include' }),
        fetch('/api/sync/stats', { credentials: 'include' }),
        fetch('/api/sync/history?limit=10', { credentials: 'include' }),
      ]);

      if (!userRes.ok) {
        if (userRes.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error('Failed to fetch user data');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function connectGarmin(e: React.FormEvent) {
    e.preventDefault();
    setGarminLoading(true);
    setGarminError(null);

    try {
      // First, get an auth token via GET (which works with cookies)
      const tokenRes = await fetch('/api/auth/token', { credentials: 'include' });
      if (!tokenRes.ok) {
        throw new Error('Failed to get auth token');
      }
      const { token: authToken } = await tokenRes.json();

      // Now make the POST request with the token
      const res = await fetch('/api/auth/garmin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...garminForm, authToken }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        console.log('Garmin connect error:', data);
        throw new Error(data.debug ? JSON.stringify(data) : (data.error || 'Failed to connect Garmin'));
      }

      setGarminForm({ email: '', password: '' });
      fetchData();
    } catch (err) {
      setGarminError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setGarminLoading(false);
    }
  }

  async function disconnectGarmin() {
    if (!confirm('Are you sure you want to disconnect your Garmin account?')) {
      return;
    }

    try {
      await fetch('/api/auth/garmin/connect', { method: 'DELETE', credentials: 'include' });
      fetchData();
    } catch (err) {
      console.error('Failed to disconnect Garmin:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
        </div>
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
            <Link href="/settings" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              Settings
            </Link>
            <Link href="/api/auth/logout" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
              Log out
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Dashboard</h1>

        {/* Connection Status */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Strava Card */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold">Strava</h2>
                <p className="text-sm text-green-500">Connected</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Athlete ID: {user?.stravaAthleteId}
            </p>
          </div>

          {/* Garmin Card */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-18C7.582 4 4 7.582 4 12s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold">Garmin Connect</h2>
                <p className={`text-sm ${user?.garminConnected ? 'text-green-500' : 'text-slate-500'}`}>
                  {user?.garminConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>

            {user?.garminConnected ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {user.garminEmail}
                </p>
                <button
                  onClick={disconnectGarmin}
                  className="text-sm text-red-500 hover:text-red-600"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <form onSubmit={connectGarmin} className="space-y-3">
                {garminError && (
                  <p className="text-sm text-red-500">{garminError}</p>
                )}
                <input
                  type="email"
                  placeholder="Garmin email"
                  value={garminForm.email}
                  onChange={(e) => setGarminForm({ ...garminForm, email: e.target.value })}
                  className="input"
                  required
                />
                <input
                  type="password"
                  placeholder="Garmin password"
                  value={garminForm.password}
                  onChange={(e) => setGarminForm({ ...garminForm, password: e.target.value })}
                  className="input"
                  required
                />
                <button
                  type="submit"
                  disabled={garminLoading}
                  className="btn-secondary w-full"
                >
                  {garminLoading ? 'Connecting...' : 'Connect Garmin'}
                </button>
                <p className="text-xs text-slate-500">
                  Note: 2FA must be disabled on your Garmin account
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="card text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="text-sm text-slate-500">Total Activities</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-sm text-slate-500">Synced</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-yellow-500">{stats.pending}</p>
              <p className="text-sm text-slate-500">Pending</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-red-500">{stats.failed}</p>
              <p className="text-sm text-slate-500">Failed</p>
            </div>
          </div>
        )}

        {/* Sync History */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Sync History</h2>
          {history.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              No activities synced yet. Complete a workout on Strava to see it here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Activity</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Type</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Status</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 px-2">
                        <span className="font-medium">{record.activityName || `Activity ${record.stravaActivityId}`}</span>
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {record.activityType || '-'}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`badge ${
                            record.status === 'COMPLETED'
                              ? 'badge-success'
                              : record.status === 'FAILED'
                              ? 'badge-error'
                              : record.status === 'PROCESSING'
                              ? 'badge-info'
                              : 'badge-warning'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {new Date(record.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
