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
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
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
  syncStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  garminActivityId: string | null;
}

// Helper to get auth token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken');
}

// Helper to make authenticated fetch requests
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : '',
    },
  });
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [history, setHistory] = useState<SyncRecord[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [garminForm, setGarminForm] = useState({ email: '', password: '', tokenData: '' });
  const [garminLoading, setGarminLoading] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  const [useTokenMode, setUseTokenMode] = useState(false);
  const [syncingActivity, setSyncingActivity] = useState<number | null>(null);

  useEffect(() => {
    // Check for token in URL hash (from OAuth callback)
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#token=')) {
        const token = decodeURIComponent(hash.substring(7));
        localStorage.setItem('authToken', token);
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Check if we have a token
      if (!getAuthToken()) {
        window.location.href = '/';
        return;
      }

      const [userRes, statsRes, historyRes, activitiesRes] = await Promise.all([
        authFetch('/api/user'),
        authFetch('/api/sync/stats'),
        authFetch('/api/sync/history?limit=10'),
        authFetch('/api/strava/activities'),
      ]);

      if (!userRes.ok) {
        if (userRes.status === 401) {
          localStorage.removeItem('authToken');
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

      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        setActivities(activitiesData.activities || []);
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
      const endpoint = useTokenMode ? '/api/auth/garmin/token' : '/api/auth/garmin/connect';
      const payload = useTokenMode
        ? { email: garminForm.email, password: garminForm.password, tokenData: garminForm.tokenData }
        : { email: garminForm.email, password: garminForm.password };

      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.log('Garmin connect error:', data);
        throw new Error(data.error || 'Failed to connect Garmin');
      }

      setGarminForm({ email: '', password: '', tokenData: '' });
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
      await authFetch('/api/auth/garmin/connect', { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to disconnect Garmin:', err);
    }
  }

  async function syncActivity(activityId: number) {
    setSyncingActivity(activityId);
    try {
      const res = await authFetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stravaActivityId: activityId }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Sync failed');
      } else if (data.status === 'FAILED') {
        alert(`Sync failed: ${data.error || 'Unknown error'}`);
      } else if (data.status === 'COMPLETED') {
        alert('Activity synced to Garmin!');
      }
      // Refresh data to show updated status
      fetchData();
    } catch (err) {
      console.error('Sync error:', err);
      alert('Failed to trigger sync');
    } finally {
      setSyncingActivity(null);
    }
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatDistance(meters: number): string {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
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
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useTokenMode}
                      onChange={(e) => setUseTokenMode(e.target.checked)}
                      className="rounded"
                    />
                    Use token (bypass rate limit)
                  </label>
                </div>
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
                {useTokenMode && (
                  <textarea
                    placeholder='Paste token JSON from local script'
                    value={garminForm.tokenData}
                    onChange={(e) => setGarminForm({ ...garminForm, tokenData: e.target.value })}
                    className="input min-h-[80px] text-xs font-mono"
                    required
                  />
                )}
                <button
                  type="submit"
                  disabled={garminLoading}
                  className="btn-secondary w-full"
                >
                  {garminLoading ? 'Connecting...' : 'Connect Garmin'}
                </button>
                {useTokenMode ? (
                  <p className="text-xs text-slate-500">
                    Run locally: node scripts/generate-garmin-token.js email password
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Note: 2FA must be disabled. If rate limited, use token mode.
                  </p>
                )}
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

        {/* Strava Activities */}
        {user?.garminConnected && activities.length > 0 && (
          <div className="card mb-8">
            <h2 className="text-lg font-semibold mb-4">Strava Activities</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Activity</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Type</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Distance</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Duration</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Date</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 px-2">
                        <span className="font-medium">{activity.name}</span>
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {activity.sport_type || activity.type}
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {formatDistance(activity.distance)}
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {formatDuration(activity.moving_time)}
                      </td>
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {new Date(activity.start_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2">
                        {activity.syncStatus === 'COMPLETED' ? (
                          <span className="badge badge-success">Synced</span>
                        ) : activity.syncStatus === 'PROCESSING' || activity.syncStatus === 'PENDING' ? (
                          <span className="badge badge-warning">{activity.syncStatus}</span>
                        ) : activity.syncStatus === 'FAILED' ? (
                          <button
                            onClick={() => syncActivity(activity.id)}
                            disabled={syncingActivity === activity.id}
                            className="text-sm text-orange-500 hover:text-orange-600"
                          >
                            {syncingActivity === activity.id ? 'Syncing...' : 'Retry'}
                          </button>
                        ) : (
                          <button
                            onClick={() => syncActivity(activity.id)}
                            disabled={syncingActivity === activity.id}
                            className="text-sm text-blue-500 hover:text-blue-600"
                          >
                            {syncingActivity === activity.id ? 'Syncing...' : 'Sync to Garmin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <th className="text-left py-3 px-2 text-sm font-medium text-slate-500">Device</th>
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
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-400">
                        {record.deviceName || '-'}
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
                              : record.status === 'SKIPPED'
                              ? 'badge-secondary'
                              : 'badge-warning'
                          }`}
                          title={record.status === 'SKIPPED' ? 'Already on Garmin' : record.errorMessage || ''}
                        >
                          {record.status === 'SKIPPED' ? 'SKIPPED (Garmin)' : record.status}
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
