"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, CheckCircle, Copy, Check, Download } from "lucide-react";
import Link from "next/link";

const SCRIPT_CONTENT = `const{GarminConnect}=require('garmin-connect');
const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});
console.log('\\n🔐 Garmin Token Generator for OpenCadence\\n');
rl.question('Garmin Email: ',email=>{
  rl.question('Garmin Password: ',async password=>{
    try{
      console.log('\\nConnecting to Garmin...');
      const client=new GarminConnect({username:email,password});
      await client.login();
      const tokens=await client.exportToken();
      console.log('\\n✅ Success! Copy this token:\\n');
      console.log('════════════════════════════════════════');
      console.log(Buffer.from(JSON.stringify(tokens)).toString('base64'));
      console.log('════════════════════════════════════════\\n');
    }catch(e){console.error('\\n❌ Error:',e.message)}
    rl.close();
  });
});`;

export default function ConnectGarminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
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

    try {
      const trimmedToken = token.trim();
      if (!trimmedToken) {
        throw new Error("Please paste your token");
      }

      // Validate token format
      try {
        const decoded = atob(trimmedToken);
        const parsed = JSON.parse(decoded);
        if (!parsed.oauth1 && !parsed.oauth2) {
          throw new Error("Invalid token format");
        }
      } catch {
        throw new Error("Invalid token. Make sure you copied the entire token from the script output.");
      }

      const res = await fetch("/api/connect/garmin/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmedToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect Garmin");
      }

      setSuccess(true);
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string, step: number) {
    navigator.clipboard.writeText(text);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  }

  function downloadScript() {
    const blob = new Blob([SCRIPT_CONTENT], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "garmin-token.js";
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Connect Garmin</h1>
      </div>

      {/* Step 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
            Create a folder and install the package
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <pre className="bg-muted p-3 rounded-lg text-sm font-mono overflow-x-auto">
              mkdir garmin-token && cd garmin-token && npm init -y && npm install garmin-connect
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-8 w-8"
              onClick={() => copyToClipboard("mkdir garmin-token && cd garmin-token && npm init -y && npm install garmin-connect", 1)}
            >
              {copiedStep === 1 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
            Download and run the script
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={downloadScript} variant="outline" className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Download garmin-token.js
          </Button>
          <p className="text-sm text-muted-foreground">
            Save the file to your garmin-token folder, then run:
          </p>
          <div className="relative">
            <pre className="bg-muted p-3 rounded-lg text-sm font-mono">
              node garmin-token.js
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-8 w-8"
              onClick={() => copyToClipboard("node garmin-token.js", 2)}
            >
              {copiedStep === 2 ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your Garmin credentials when prompted. The script runs locally on your computer.
          </p>
        </CardContent>
      </Card>

      {/* Step 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">3</span>
            Paste Your Token
          </CardTitle>
          <CardDescription>
            Copy the token from the script output and paste it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Textarea
              placeholder="Paste your token here..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
              disabled={loading}
            />

            <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
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
          <CardTitle className="text-base">Why This Process?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Garmin aggressively rate-limits login attempts from servers. By running the script
            on your computer, the login uses your IP address, avoiding these limits.
          </p>
          <p>
            Your password is never sent to our servers - only the session token is used.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requirements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Node.js installed (<a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="underline">download here</a>)</p>
          <p>• Two-factor authentication disabled on Garmin</p>
          <p>• Your Garmin Connect credentials</p>
        </CardContent>
      </Card>
    </div>
  );
}
