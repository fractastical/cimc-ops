import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings, sendDailySummary, sendWeeklySummary, syncOrganization, addRepositoryByName, sendRepoSummary, sendResearchSummary, type TimeFrame } from "@/lib/api";
import { toast } from "sonner";
import { Save, RefreshCw, Send, GitBranch, Plus, Trash2, Rocket, Microscope } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

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
    githubOrganization: "",
    enableRealtimeAlerts: false,
    enableDailySummary: true,
    dailySummaryTime: "09:00",
    enableWeeklySummary: true,
    weeklySummaryDay: "monday",
    weeklySummaryTime: "09:00",
    monthlyReminderTime: "09:00",
  });

  const [milestoneQuestions, setMilestoneQuestions] = useState<{ label: string; required: boolean }[]>([
    { label: "What milestone did you make progress on?", required: true },
    { label: "What was completed?", required: true },
    { label: "What is planned next?", required: true },
    { label: "Any block or delays?", required: false },
  ]);

  useEffect(() => {
    if (settings) {
      setFormData({
        slackWebhookUrl: settings.slackWebhookUrl === "***configured***" ? "" : (settings.slackWebhookUrl || ""),
        slackBotToken: settings.slackBotToken === "***configured***" ? "" : (settings.slackBotToken || ""),
        slackChannel: settings.slackChannel || "#ops",
        githubToken: settings.githubToken === "***configured***" ? "" : (settings.githubToken || ""),
        githubOrganization: settings.githubOrganization || "",
        enableRealtimeAlerts: settings.enableRealtimeAlerts,
        enableDailySummary: settings.enableDailySummary,
        dailySummaryTime: settings.dailySummaryTime,
        enableWeeklySummary: settings.enableWeeklySummary,
        weeklySummaryDay: settings.weeklySummaryDay,
        weeklySummaryTime: settings.weeklySummaryTime,
        monthlyReminderTime: settings.monthlyReminderTime || "09:00",
      });
      if (settings.milestoneQuestions && Array.isArray(settings.milestoneQuestions)) {
        setMilestoneQuestions(settings.milestoneQuestions);
      }
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

  const dailySummaryMutation = useMutation({
    mutationFn: sendDailySummary,
    onSuccess: () => {
      toast.success("Daily summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => {
      toast.error("Failed to send daily summary. Check your Slack webhook configuration.");
    },
  });

  const weeklySummaryMutation = useMutation({
    mutationFn: sendWeeklySummary,
    onSuccess: () => {
      toast.success("Weekly summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => {
      toast.error("Failed to send weekly summary. Check your Slack webhook configuration.");
    },
  });

  const syncOrgMutation = useMutation({
    mutationFn: (org: string) => syncOrganization(org),
    onSuccess: (data) => {
      toast.success(`Synced ${data.added + data.updated} repositories (${data.added} new, ${data.updated} updated)`);
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: () => {
      toast.error("Failed to sync organization. Check your GitHub token and organization name.");
    },
  });

  const [individualRepo, setIndividualRepo] = useState("");
  
  const addRepoMutation = useMutation({
    mutationFn: (fullName: string) => addRepositoryByName(fullName),
    onSuccess: (repo) => {
      toast.success(`Added ${repo.fullName} with historical activity`);
      setIndividualRepo("");
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add repository");
    },
  });

  const repoSummaryMutation = useMutation({
    mutationFn: (timeframe: TimeFrame) => sendRepoSummary(timeframe),
    onSuccess: (_, timeframe) => {
      toast.success(`${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} repo summary sent to Slack`);
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => {
      toast.error("Failed to send repo summary. Check your Slack webhook configuration.");
    },
  });

  const researchSummaryMutation = useMutation({
    mutationFn: (timeframe: TimeFrame) => sendResearchSummary(timeframe),
    onSuccess: (_, timeframe) => {
      toast.success(`${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} research summary sent to Slack`);
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => {
      toast.error("Failed to send research summary. Check your Slack webhook configuration.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      milestoneQuestions: milestoneQuestions.filter(q => q.label.trim()),
    } as any);
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
          Configure integrations and automated summaries
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
              <p className="text-xs text-muted-foreground">
                Create an incoming webhook at slack.com/apps → Incoming Webhooks
              </p>
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
              Connect to GitHub and monitor all repositories in an organization
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

            <div className="space-y-2 pt-4 border-t border-border/50">
              <Label htmlFor="githubOrganization" className="font-mono text-sm">
                Organization Name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="githubOrganization"
                  data-testid="input-github-org"
                  placeholder="my-organization"
                  value={formData.githubOrganization}
                  onChange={(e) => setFormData({ ...formData, githubOrganization: e.target.value })}
                  className="font-mono text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (formData.githubOrganization) {
                      syncOrgMutation.mutate(formData.githubOrganization);
                    } else {
                      toast.error("Please enter an organization name");
                    }
                  }}
                  disabled={syncOrgMutation.isPending || !formData.githubOrganization}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  {syncOrgMutation.isPending ? "Syncing..." : "Sync All Repos"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your GitHub organization name to automatically monitor all its repositories
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-border/50">
              <Label htmlFor="individualRepo" className="font-mono text-sm">
                Add Individual Repository
              </Label>
              <div className="flex gap-2">
                <Input
                  id="individualRepo"
                  data-testid="input-individual-repo"
                  placeholder="owner/repository (e.g., torvalds/linux)"
                  value={individualRepo}
                  onChange={(e) => setIndividualRepo(e.target.value)}
                  className="font-mono text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (individualRepo && individualRepo.includes("/")) {
                      addRepoMutation.mutate(individualRepo);
                    } else {
                      toast.error("Please enter a valid repository (owner/repo)");
                    }
                  }}
                  disabled={addRepoMutation.isPending || !individualRepo}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {addRepoMutation.isPending ? "Adding..." : "Add Repo"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add any public or private repository by full name (requires appropriate token permissions)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Summary Settings */}
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono">Automated Summaries</CardTitle>
            <CardDescription>
              Configure daily and weekly summary schedules
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Daily Summary */}
            <div className="space-y-4 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-mono text-sm">Daily Summary</Label>
                  <p className="text-xs text-muted-foreground">
                    Send a summary of yesterday's activity each morning
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
                <div className="flex items-center gap-4 pl-4 border-l-2 border-primary/30">
                  <div className="space-y-2">
                    <Label htmlFor="dailySummaryTime" className="font-mono text-xs text-muted-foreground">
                      Time (24h)
                    </Label>
                    <Input
                      id="dailySummaryTime"
                      data-testid="input-daily-time"
                      type="time"
                      value={formData.dailySummaryTime}
                      onChange={(e) =>
                        setFormData({ ...formData, dailySummaryTime: e.target.value })
                      }
                      className="font-mono text-sm w-32"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => dailySummaryMutation.mutate()}
                    disabled={dailySummaryMutation.isPending}
                    className="mt-6"
                  >
                    <Send className="h-3 w-3 mr-2" />
                    {dailySummaryMutation.isPending ? "Sending..." : "Send Now"}
                  </Button>
                </div>
              )}
            </div>

            {/* Weekly Summary */}
            <div className="space-y-4 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-mono text-sm">Weekly Summary</Label>
                  <p className="text-xs text-muted-foreground">
                    Send a comprehensive summary of the week's activity
                  </p>
                </div>
                <Switch
                  data-testid="switch-weekly-summary"
                  checked={formData.enableWeeklySummary}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enableWeeklySummary: checked })
                  }
                />
              </div>

              {formData.enableWeeklySummary && (
                <div className="flex items-center gap-4 pl-4 border-l-2 border-primary/30 flex-wrap">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs text-muted-foreground">Day</Label>
                    <Select
                      value={formData.weeklySummaryDay}
                      onValueChange={(value) =>
                        setFormData({ ...formData, weeklySummaryDay: value })
                      }
                    >
                      <SelectTrigger className="w-36 font-mono text-sm" data-testid="select-weekly-day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weeklySummaryTime" className="font-mono text-xs text-muted-foreground">
                      Time (24h)
                    </Label>
                    <Input
                      id="weeklySummaryTime"
                      data-testid="input-weekly-time"
                      type="time"
                      value={formData.weeklySummaryTime}
                      onChange={(e) =>
                        setFormData({ ...formData, weeklySummaryTime: e.target.value })
                      }
                      className="font-mono text-sm w-32"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => weeklySummaryMutation.mutate()}
                    disabled={weeklySummaryMutation.isPending}
                    className="mt-6"
                  >
                    <Send className="h-3 w-3 mr-2" />
                    {weeklySummaryMutation.isPending ? "Sending..." : "Send Now"}
                  </Button>
                </div>
              )}
            </div>

            {/* Monthly Milestone Reminder */}
            <div className="space-y-4">
              <div className="space-y-0.5">
                <Label className="font-mono text-sm">Monthly Milestone Reminder</Label>
                <p className="text-xs text-muted-foreground">
                  Sends milestone check-in emails to team leads on the last Thursday of each month.
                  Each team lead gets one consolidated email listing all their project milestones.
                </p>
              </div>
              <div className="flex items-center gap-4 pl-4 border-l-2 border-primary/30">
                <div className="space-y-2">
                  <Label htmlFor="monthlyReminderTime" className="font-mono text-xs text-muted-foreground">
                    Time (24h)
                  </Label>
                  <Input
                    id="monthlyReminderTime"
                    data-testid="input-monthly-reminder-time"
                    type="time"
                    value={formData.monthlyReminderTime}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyReminderTime: e.target.value })
                    }
                    className="font-mono text-sm w-32"
                  />
                </div>
              </div>
              <div className="pl-4 border-l-2 border-primary/30 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs text-muted-foreground">Milestone Check-In Questions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMilestoneQuestions([...milestoneQuestions, { label: "", required: false }])}
                    data-testid="button-add-milestone-question"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Question
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  These questions appear on every milestone submission form
                </p>
                {milestoneQuestions.map((q, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Question text..."
                      value={q.label}
                      onChange={(e) => {
                        const updated = [...milestoneQuestions];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setMilestoneQuestions(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-milestone-question-${idx}`}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => {
                          const updated = [...milestoneQuestions];
                          updated[idx] = { ...updated[idx], required: e.target.checked };
                          setMilestoneQuestions(updated);
                        }}
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setMilestoneQuestions(milestoneQuestions.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual Summaries */}
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono">Send Slack Summaries</CardTitle>
            <CardDescription>
              Manually send summaries to Slack with different timeframes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Repository Summaries */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <Label className="font-mono text-sm">Repository Summary</Label>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {(["weekly", "monthly", "quarterly"] as TimeFrame[]).map((timeframe) => (
                  <Button
                    key={`repo-${timeframe}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => repoSummaryMutation.mutate(timeframe)}
                    disabled={repoSummaryMutation.isPending}
                    data-testid={`button-repo-${timeframe}`}
                  >
                    <Send className="h-3 w-3 mr-2" />
                    {repoSummaryMutation.isPending ? "..." : timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Research Summaries */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Microscope className="h-4 w-4 text-emerald-500" />
                <Label className="font-mono text-sm">Research Summary</Label>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {(["weekly", "monthly", "quarterly"] as TimeFrame[]).map((timeframe) => (
                  <Button
                    key={`research-${timeframe}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => researchSummaryMutation.mutate(timeframe)}
                    disabled={researchSummaryMutation.isPending}
                    data-testid={`button-research-${timeframe}`}
                  >
                    <Send className="h-3 w-3 mr-2" />
                    {researchSummaryMutation.isPending ? "..." : timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
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
