import { StatusCard } from "@/components/dashboard/StatusCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { BotTerminal } from "@/components/dashboard/BotTerminal";
import { ResearchBoard } from "@/components/dashboard/ResearchBoard";
import { mockResearch } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import { getRepositories, getSlackMessages } from "@/lib/api";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

export default function Home() {
  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  const { data: slackMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["slackMessages"],
    queryFn: () => getSlackMessages(50),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (reposLoading || messagesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Mission Control</h1>
        <p className="text-muted-foreground font-mono text-sm">
          System Overview // {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Top Row: Status & Critical Metrics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="md:col-span-4 lg:col-span-3 h-[300px]"
        >
          <StatusCard />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="md:col-span-8 lg:col-span-9"
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
          <ResearchBoard items={mockResearch} />
        </motion.div>
      </div>
    </div>
  );
}
