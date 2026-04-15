import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { ResearchBoard } from "@/components/dashboard/ResearchBoard";
import { MonthlyActivityChart } from "@/components/dashboard/MonthlyActivityChart";
import { MilestoneProgressGrid } from "@/components/dashboard/MilestoneProgressGrid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRepositories, getResearchProjects, getResearchUpdates, sendDailySummary, sendWeeklySummary, sendRepoSummary, sendResearchSummary, getMilestones, getMilestoneSubmissions, getNeurocomputeStats, getSettings, TimeFrame } from "@/lib/api";
import { motion } from "framer-motion";
import { RefreshCw, Calendar, CalendarDays, Rocket, Microscope, Cpu, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Home() {
  const queryClient = useQueryClient();
  
  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  const { data: researchProjects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["researchProjects"],
    queryFn: getResearchProjects,
  });

  const { data: researchUpdates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ["researchUpdates"],
    queryFn: getResearchUpdates,
  });

  const { data: allMilestones = [] } = useQuery({
    queryKey: ["milestones", "all"],
    queryFn: () => getMilestones(),
  });

  const { data: milestoneSubmissions = [] } = useQuery({
    queryKey: ["milestoneSubmissions"],
    queryFn: () => getMilestoneSubmissions(),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: neurocompute, isError: ncError } = useQuery({
    queryKey: ["neurocompute"],
    queryFn: getNeurocomputeStats,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const dailyMutation = useMutation({
    mutationFn: sendDailySummary,
    onSuccess: () => {
      toast.success("Daily summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => toast.error("Failed to send daily summary"),
  });

  const weeklyMutation = useMutation({
    mutationFn: sendWeeklySummary,
    onSuccess: () => {
      toast.success("Weekly summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => toast.error("Failed to send weekly summary"),
  });

  const repoMutation = useMutation({
    mutationFn: sendRepoSummary,
    onSuccess: () => {
      toast.success("Repository summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => toast.error("Failed to send repository summary"),
  });

  const researchMutation = useMutation({
    mutationFn: sendResearchSummary,
    onSuccess: () => {
      toast.success("Research summary sent to Slack");
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
    onError: () => toast.error("Failed to send research summary"),
  });

  if (reposLoading || projectsLoading || updatesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Mission Control</h1>
          <p className="text-muted-foreground font-mono text-sm">
            System Overview // {new Date().toLocaleDateString()}
          </p>
        </div>

        <Card className="glass-panel border-primary/20">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground mr-2">Quick Updates:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dailyMutation.mutate()}
                disabled={dailyMutation.isPending}
                data-testid="button-quick-daily"
                className="h-7 text-xs"
              >
                <Calendar className="h-3 w-3 mr-1" />
                {dailyMutation.isPending ? "..." : "Daily"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => weeklyMutation.mutate()}
                disabled={weeklyMutation.isPending}
                data-testid="button-quick-weekly"
                className="h-7 text-xs"
              >
                <CalendarDays className="h-3 w-3 mr-1" />
                {weeklyMutation.isPending ? "..." : "Weekly"}
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => repoMutation.mutate("weekly")}
                disabled={repoMutation.isPending}
                data-testid="button-quick-repo"
                className="h-7 text-xs"
              >
                <Rocket className="h-3 w-3 mr-1" />
                {repoMutation.isPending ? "..." : "Repos"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => researchMutation.mutate("weekly")}
                disabled={researchMutation.isPending}
                data-testid="button-quick-research"
                className="h-7 text-xs"
              >
                <Microscope className="h-3 w-3 mr-1" />
                {researchMutation.isPending ? "..." : "Research"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync health + Neurocompute stats bar */}
      {(settings?.lastGithubSyncAt || neurocompute) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"
        >
          {settings?.lastGithubSyncAt && (() => {
            const ago = Date.now() - new Date(settings.lastGithubSyncAt!).getTime();
            const hours = Math.floor(ago / (1000 * 60 * 60));
            const mins = Math.floor((ago % (1000 * 60 * 60)) / (1000 * 60));
            const healthy = ago < 13 * 60 * 60 * 1000;
            return (
              <Card className={`glass-panel col-span-2 border-${healthy ? "primary" : "destructive"}/30`} data-testid="card-github-sync-health">
                <CardContent className="p-3 flex items-center gap-2">
                  <Activity className={`h-4 w-4 flex-shrink-0 ${healthy ? "text-primary" : "text-destructive"}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-mono">GitHub Sync</p>
                    <p className={`text-sm font-mono font-medium truncate ${healthy ? "text-primary" : "text-destructive"}`}>
                      {hours > 0 ? `${hours}h ` : ""}{mins}m ago
                    </p>
                  </div>
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-mono ${healthy ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {healthy ? "OK" : "STALE"}
                  </span>
                </CardContent>
              </Card>
            );
          })()}
          {neurocompute && !ncError && (
            <>
              <Card className="glass-panel border-primary/20" data-testid="card-nc-nodes">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground font-mono">NC Nodes</p>
                  <p className="text-xl font-bold font-mono text-foreground">{neurocompute.live.totalNodes.toLocaleString()}</p>
                  <p className="text-xs text-primary font-mono">{neurocompute.live.onlineNow} online now</p>
                </CardContent>
              </Card>
              <Card className="glass-panel border-primary/20" data-testid="card-nc-tokens">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground font-mono">NC Tokens</p>
                  <p className="text-xl font-bold font-mono text-foreground">{(neurocompute.live.totalTokens / 1000000).toFixed(1)}M</p>
                  <p className="text-xs text-muted-foreground font-mono">lifetime</p>
                </CardContent>
              </Card>
              <Card className="glass-panel border-primary/20" data-testid="card-nc-compute">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground font-mono">NC Compute</p>
                  <p className="text-xl font-bold font-mono text-foreground">{(neurocompute.live.computeSeconds / 3600).toFixed(0)}h</p>
                  <p className="text-xs text-muted-foreground font-mono">total compute</p>
                </CardContent>
              </Card>
              <Card className="glass-panel border-primary/20" data-testid="card-nc-contributors">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground font-mono">NC New</p>
                  <p className="text-xl font-bold font-mono text-foreground">{neurocompute.period.newContributors}</p>
                  <p className="text-xs text-muted-foreground font-mono">contributors (7d)</p>
                </CardContent>
              </Card>
            </>
          )}
        </motion.div>
      )}

      {/* 1. Milestone Progress Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <MilestoneProgressGrid
          milestones={allMilestones}
          submissions={milestoneSubmissions}
          projects={researchProjects}
        />
      </motion.div>

      {/* 2. Research Notes for Each Project */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <ResearchBoard projects={researchProjects} updates={researchUpdates} milestoneSubmissions={milestoneSubmissions} />
      </motion.div>

      {/* 3. Repo Summary (Total Bar Chart) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <MonthlyActivityChart />
      </motion.div>

      {/* 4. Individual Repos */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        {repos.length > 0 ? (
          <ActivityHeatmap repos={repos} />
        ) : (
          <div className="glass-panel p-8 text-center border-primary/20">
            <p className="text-muted-foreground font-mono">
              No repositories configured. Add repositories in Settings to start monitoring.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
