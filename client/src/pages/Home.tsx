import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { BotTerminal } from "@/components/dashboard/BotTerminal";
import { ResearchBoard } from "@/components/dashboard/ResearchBoard";
import { MonthlyActivityChart } from "@/components/dashboard/MonthlyActivityChart";
import { MilestoneProgressGrid } from "@/components/dashboard/MilestoneProgressGrid";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRepositories, getSlackMessages, getResearchProjects, getResearchUpdates, sendDailySummary, sendWeeklySummary, sendRepoSummary, sendResearchSummary, getMilestones, getMilestoneSubmissions, TimeFrame } from "@/lib/api";
import { motion } from "framer-motion";
import { RefreshCw, Send, Calendar, CalendarDays, Rocket, Microscope } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Home() {
  const queryClient = useQueryClient();
  
  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  const { data: slackMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["slackMessages"],
    queryFn: () => getSlackMessages(50),
    refetchInterval: 30000, // Refetch every 30 seconds
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

  if (reposLoading || messagesLoading || projectsLoading || updatesLoading) {
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

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Top Row: Activity Heatmap */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="md:col-span-12"
        >
          <div className="h-full flex flex-col gap-4">
            {repos.length > 0 ? (
              <ActivityHeatmap repos={repos} />
            ) : (
              <div className="glass-panel p-8 text-center border-primary/20">
                <p className="text-muted-foreground font-mono">
                  No repositories configured. Add repositories in Settings to start monitoring.
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Monthly Activity Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="md:col-span-12"
        >
          <MonthlyActivityChart />
        </motion.div>

        {/* Middle/Bottom Row: Operations & Research */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="md:col-span-5 lg:col-span-4 h-[500px]"
        >
          <BotTerminal messages={slackMessages} />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="md:col-span-7 lg:col-span-8 h-[500px]"
        >
          <ResearchBoard projects={researchProjects} updates={researchUpdates} />
        </motion.div>
      </div>
    </div>
  );
}
