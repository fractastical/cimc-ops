import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Copy, Check, Rocket, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ExternalApp {
  id: string;
  name: string;
  apiKey: string;
  description: string | null;
  active: boolean;
  createdAt: string;
}

async function fetchApps(): Promise<ExternalApp[]> {
  const res = await fetch("/api/external/apps");
  if (!res.ok) throw new Error("Failed to fetch apps");
  return res.json();
}

async function registerApp(payload: { name: string; description: string }): Promise<ExternalApp> {
  const res = await fetch("/api/external/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to register app");
  return res.json();
}

async function deleteApp(id: string): Promise<void> {
  const res = await fetch(`/api/external/apps/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete app");
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-primary/20 rounded-md p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 hover:bg-primary/40 text-white rounded p-1"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function IntegrationGuide() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: apps = [], isLoading } = useQuery({ queryKey: ["external-apps"], queryFn: fetchApps });

  const registerMutation = useMutation({
    mutationFn: registerApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apps"] });
      setNewName("");
      setNewDesc("");
      toast.success("App registered — copy its API key now, it won't be shown again");
    },
    onError: () => toast.error("Failed to register app"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apps"] });
      toast.success("App removed");
    },
  });

  const exampleKey = apps[0]?.apiKey ?? "cimc_YOUR_API_KEY_HERE";
  const baseUrl = "https://cimcops.org";

  const curlDaily = `curl -X POST ${baseUrl}/api/external/usage \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "${exampleKey}",
    "period_type": "daily",
    "period_date": "2026-05-19",
    "stats": {
      "active_users": 142,
      "sessions": 318,
      "compute_minutes": 4820,
      "new_signups": 7
    }
  }'`;

  const curlWeekly = `curl -X POST ${baseUrl}/api/external/usage \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "${exampleKey}",
    "period_type": "weekly",
    "period_date": "2026-05-19",
    "stats": {
      "active_users": 890,
      "total_sessions": 2140,
      "compute_hours": 562,
      "new_signups": 34,
      "retention_rate": 0.71
    }
  }'`;

  const jsExample = `// Send daily stats from your CIMC app
async function reportDailyStats(stats) {
  const res = await fetch("${baseUrl}/api/external/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.CIMCOPS_API_KEY,
      period_type: "daily",
      period_date: new Date().toISOString().slice(0, 10),
      stats,
    }),
  });
  if (!res.ok) throw new Error(\`CIMC Ops rejected stats: \${res.status}\`);
  return res.json();
}

// Call once per day, e.g. in a cron job or scheduled function
await reportDailyStats({
  active_users: 142,
  sessions: 318,
  compute_minutes: 4820,
});`;

  const pythonExample = `import requests
from datetime import date

def report_daily_stats(stats: dict):
    resp = requests.post(
        "${baseUrl}/api/external/usage",
        json={
            "api_key": "YOUR_API_KEY",
            "period_type": "daily",
            "period_date": date.today().isoformat(),
            "stats": stats,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()

# Example usage
report_daily_stats({
    "active_users": 142,
    "sessions": 318,
    "compute_minutes": 4820,
})`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background/60 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="font-mono text-base font-bold">CIMC<span className="text-primary">.AI</span></span>
            <span className="text-xs text-muted-foreground hidden sm:inline">/ App Integration Guide</span>
          </div>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back
          </Link>
        </div>
      </header>

    <div className="space-y-6 p-6 max-w-4xl mx-auto py-10">
      <div>
        <h1 className="font-mono text-2xl font-bold text-primary">App Integration Guide</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Any CIMC app (cimc.io, neurocompute.me, etc.) can push daily and weekly usage stats to Mission Control for unified analytics.
        </p>
      </div>

      {/* How it works */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2">
            <li>Register your app below to get an API key.</li>
            <li>
              From your app, call <code className="font-mono text-primary text-xs bg-primary/10 px-1 py-0.5 rounded">POST /api/external/usage</code> with your API key, the period type (<code className="font-mono text-xs">daily</code> or <code className="font-mono text-xs">weekly</code>), the date, and a JSON object of whatever stats you want to track.
            </li>
            <li>Stats are stored and will appear in the weekly analytics email sent to the team.</li>
          </ol>
          <p className="text-xs pt-1">
            The <code className="font-mono text-xs">stats</code> field is flexible — send any key/value pairs meaningful to your app. There is no fixed schema.
          </p>
        </CardContent>
      </Card>

      {/* Registered Apps */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-base">Registered Apps</CardTitle>
          <CardDescription>Each app gets a unique API key. Store it securely — it is only shown once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : apps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No apps registered yet.</p>
          ) : (
            <div className="space-y-2">
              {apps.map((app) => (
                <div key={app.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-primary/15 bg-black/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{app.name}</span>
                      <Badge variant={app.active ? "default" : "secondary"} className="text-xs">
                        {app.active ? "active" : "inactive"}
                      </Badge>
                    </div>
                    {app.description && <p className="text-xs text-muted-foreground mt-0.5">{app.description}</p>}
                    <p className="font-mono text-xs text-primary/70 mt-1 truncate">{app.apiKey}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        navigator.clipboard.writeText(app.apiKey);
                        toast.success("API key copied");
                      }}
                      data-testid={`button-copy-key-${app.id}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(app.id)}
                      data-testid={`button-delete-app-${app.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Register new */}
          <div className="pt-2 border-t border-primary/15 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Register a new app</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-mono text-xs">App name</Label>
                <Input
                  placeholder="cimc.io"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-new-app-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs">Description (optional)</Label>
                <Input
                  placeholder="Main CIMC platform"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-new-app-desc"
                />
              </div>
            </div>
            <Button
              onClick={() => registerMutation.mutate({ name: newName.trim(), description: newDesc.trim() })}
              disabled={!newName.trim() || registerMutation.isPending}
              size="sm"
              data-testid="button-register-app"
            >
              <Plus className="h-3 w-3 mr-1" />
              {registerMutation.isPending ? "Registering…" : "Register App"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint reference */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-base">Endpoint Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-mono text-xs text-primary font-semibold mb-1">POST /api/external/usage</p>
            <p className="text-xs text-muted-foreground mb-2">Push usage stats for a given period. No authentication header required — API key goes in the body.</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="border-b border-primary/20">
                    <th className="text-left py-1 pr-4 font-mono text-muted-foreground">Field</th>
                    <th className="text-left py-1 pr-4 font-mono text-muted-foreground">Type</th>
                    <th className="text-left py-1 font-mono text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  {[
                    ["api_key", "string", "Your app's API key"],
                    ["period_type", '"daily" | "weekly"', "Reporting period"],
                    ["period_date", "string (ISO date)", "The date this report covers, e.g. 2026-05-19"],
                    ["stats", "object", "Any key/value pairs — active_users, sessions, revenue, etc."],
                  ].map(([field, type, desc]) => (
                    <tr key={field}>
                      <td className="py-1.5 pr-4 font-mono text-primary">{field}</td>
                      <td className="py-1.5 pr-4 font-mono text-yellow-400/80">{type}</td>
                      <td className="py-1.5 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="font-mono text-xs font-semibold mb-1 text-green-400">Response (200)</p>
            <CodeBlock code={`{ "ok": true, "id": "uuid", "app": "cimc.io" }`} />
          </div>
        </CardContent>
      </Card>

      {/* Code examples */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-base">Code Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-2">cURL — daily report</p>
            <CodeBlock code={curlDaily} />
          </div>
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-2">cURL — weekly report</p>
            <CodeBlock code={curlWeekly} />
          </div>
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-2">JavaScript / Node.js</p>
            <CodeBlock code={jsExample} language="javascript" />
          </div>
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-2">Python</p>
            <CodeBlock code={pythonExample} language="python" />
          </div>
        </CardContent>
      </Card>

      {/* Best practices */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-base">Best Practices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <ul className="list-disc list-inside space-y-1.5">
            <li>Store your API key in an environment variable, never in source code.</li>
            <li>Send daily stats once per day — pick a consistent time (e.g. midnight UTC via a cron job).</li>
            <li>Send weekly stats on the same day each week (e.g. Monday morning) with the Monday date as <code className="font-mono text-primary">period_date</code>.</li>
            <li>If a submission fails, retry with the same <code className="font-mono text-primary">period_date</code> — duplicate dates are stored separately so nothing is lost.</li>
            <li>Keep <code className="font-mono text-primary">stats</code> keys consistent across submissions so the analytics email can show trends.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
