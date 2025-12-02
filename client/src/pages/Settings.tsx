import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Bell, Github, Slack, Save, Shield } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(true);

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Integration configuration has been updated (Mock).",
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">System Configuration</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Manage integrations, notifications, and security.
        </p>
      </div>

      <Tabs defaultValue="integrations" className="space-y-4">
        <TabsList className="bg-muted/20 border border-border">
          <TabsTrigger value="integrations" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Integrations</TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Notifications</TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">API Access</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4">
          {/* Slack Integration */}
          <Card className="glass-panel border-primary/20 bg-background/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Slack className="h-5 w-5 text-primary" /> Slack Integration
                </CardTitle>
                <CardDescription>Configure the Ops Bot for daily summaries and alerts.</CardDescription>
              </div>
              <Switch checked={slackEnabled} onCheckedChange={setSlackEnabled} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="slack-webhook">Webhook URL</Label>
                <Input id="slack-webhook" placeholder="https://hooks.slack.com/services/..." className="font-mono text-xs bg-background/50" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slack-token">Bot User OAuth Token</Label>
                <Input id="slack-token" type="password" placeholder="xoxb-..." className="font-mono text-xs bg-background/50" />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Switch id="daily-digest" disabled={!slackEnabled} />
                <Label htmlFor="daily-digest" className="text-sm text-muted-foreground">Enable Daily Digest (09:00 AM UTC)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="real-time-alerts" disabled={!slackEnabled} defaultChecked />
                <Label htmlFor="real-time-alerts" className="text-sm text-muted-foreground">Post on Repository Updates</Label>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Integration */}
          <Card className="glass-panel border-primary/20 bg-background/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Github className="h-5 w-5 text-primary" /> GitHub Integration
                </CardTitle>
                <CardDescription>Connect to your organization repositories.</CardDescription>
              </div>
              <Switch checked={githubEnabled} onCheckedChange={setGithubEnabled} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="github-token">Personal Access Token (PAT)</Label>
                <Input id="github-token" type="password" placeholder="ghp_..." className="font-mono text-xs bg-background/50" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" placeholder="e.g. acme-corp-research" className="font-mono text-xs bg-background/50" />
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-end">
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Save className="mr-2 h-4 w-4" /> Save Configuration
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
            <Card className="glass-panel border-border/50 bg-background/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Alert Rules</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground font-mono">
                        Notification rules are managed by the central policy server.
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="api">
            <Card className="glass-panel border-border/50 bg-background/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="p-4 border border-yellow-500/30 bg-yellow-500/10 rounded text-yellow-200 text-xs font-mono">
                        WARNING: API keys grant full read/write access to the Research Ops platform.
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
