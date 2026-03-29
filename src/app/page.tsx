import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">OpenCadence</h1>
          <Link href="/api/auth/strava" className="btn-primary">
            Connect with Strava
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-3xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Sync Your Workouts
            <br />
            <span className="text-orange-500">Automatically</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-xl mx-auto">
            Connect your Strava and Garmin accounts to automatically sync activities.
            Every workout you record on Strava will appear in Garmin Connect.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/api/auth/strava" className="btn-primary text-lg px-6 py-3">
              Get Started
            </Link>
            <Link href="#how-it-works" className="btn-outline text-lg px-6 py-3">
              Learn More
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 text-left mt-16">
            <div className="card">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2">Real-time Sync</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Activities sync automatically via webhooks within seconds of completion.
              </p>
            </div>

            <div className="card">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2">Secure</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Your Garmin credentials are encrypted with AES-256-GCM encryption.
              </p>
            </div>

            <div className="card">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2">Full Data</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                GPS, heart rate, power, cadence - all your metrics transfer perfectly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 px-4 border-t border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">1</div>
              <div>
                <h3 className="font-semibold mb-1">Connect Strava</h3>
                <p className="text-slate-600 dark:text-slate-400">Sign in with your Strava account using secure OAuth authentication.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">2</div>
              <div>
                <h3 className="font-semibold mb-1">Connect Garmin</h3>
                <p className="text-slate-600 dark:text-slate-400">Enter your Garmin Connect credentials. They are encrypted and stored securely.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">3</div>
              <div>
                <h3 className="font-semibold mb-1">Automatic Sync</h3>
                <p className="text-slate-600 dark:text-slate-400">New Strava activities are automatically converted to FIT format and uploaded to Garmin Connect.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-slate-500">
          <p>OpenCadence is not affiliated with Strava or Garmin.</p>
        </div>
      </footer>
    </main>
  );
}
