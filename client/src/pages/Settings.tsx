import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings } from "@/lib/api";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const [formData, setFormData] = useState({
    slackWebhookUrl: "",
    slackBotToken: "",
    slackChannel: "#ops",
    githubToken: "",
    enableRealtimeAlerts: true,
    enableDailySummary: true,
    dailySummaryTime: "09:00",
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        slackWebhookUrl: settings.slackWebhookUrl === "***configured***" ? "" : (settings.slackWebhookUrl || ""),
        slackBotToken: settings.slackBotToken === "***configured***" ? "" : (settings.slackBotToken || ""),
        slackChannel: settings.slackChannel || "#ops",
        githubToken: settings.githubToken === "***configured***" ? "" : (settings.githubToken || ""),
        enableRealtimeAlerts: settings.enableRealtimeAlerts,
        enableDailySummary: settings.enableDailySummary,
        dailySummaryTime: settings.dailySummaryTime,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved successfully");
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Settings</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Configure integrations and automation preferences
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Slack Integration */}
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono">Slack Integration</CardTitle>
            <CardDescription>
              Configure Slack webhook for automated notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slackWebhookUrl" className="font-mono text-sm">
                Webhook URL
              </Label>
              <Input
                id="slackWebhookUrl"
                data-testid="input-slack-webhook"
                type="password"
                placeholder="https://hooks.slack.com/services/..."
                value={formData.slackWebhookUrl}
                onChange={(e) => setFormData({ ...formData, slackWebhookUrl: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slackChannel" className="font-mono text-sm">
                Channel
              </Label>
              <Input
                id="slackChannel"
                data-testid="input-slack-channel"
                placeholder="#ops"
                value={formData.slackChannel}
                onChange={(e) => setFormData({ ...formData, slackChannel: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* GitHub Integration */}
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono">GitHub Integration</CardTitle>
            <CardDescription>
              Add GitHub personal access token to sync repositories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="githubToken" className="font-mono text-sm">
                Personal Access Token
              </Label>
              <Input
                id="githubToken"
                data-testid="input-github-token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxx"
                value={formData.githubToken}
                onChange={(e) => setFormData({ ...formData, githubToken: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Required scopes: repo, read:org
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Automation Settings */}
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono">Automation</CardTitle>
            <CardDescription>
              Configure automated notifications and summaries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-mono text-sm">Real-time Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Send Slack notifications for each GitHub event
                </p>
              </div>
              <Switch
                data-testid="switch-realtime-alerts"
                checked={formData.enableRealtimeAlerts}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, enableRealtimeAlerts: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-mono text-sm">Daily Summary</Label>
                <p className="text-xs text-muted-foreground">
                  Automated daily activity summary
                </p>
              </div>
              <Switch
                data-testid="switch-daily-summary"
                checked={formData.enableDailySummary}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, enableDailySummary: checked })
                }
              />
            </div>

            {formData.enableDailySummary && (
              <div className="space-y-2">
                <Label htmlFor="dailySummaryTime" className="font-mono text-sm">
                  Summary Time (24h format)
                </Label>
                <Input
                  id="dailySummaryTime"
                  data-testid="input-summary-time"
                  type="time"
                  value={formData.dailySummaryTime}
                  onChange={(e) =>
                    setFormData({ ...formData, dailySummaryTime: e.target.value })
                  }
                  className="font-mono text-sm w-40"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          data-testid="button-save-settings"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </div>
  );
}
