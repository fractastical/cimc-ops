import { StatusCard } from "@/components/dashboard/StatusCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { BotTerminal } from "@/components/dashboard/BotTerminal";
import { ResearchBoard } from "@/components/dashboard/ResearchBoard";
import { mockRepos, mockResearch, mockSlackMessages } from "@/lib/mockData";
import { motion } from "framer-motion";

export default function Home() {
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
              {/* We can put a summary or just the heatmap here directly */}
              <ActivityHeatmap repos={mockRepos} />
           </div>
        </motion.div>

        {/* Middle/Bottom Row: Operations & Research */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="md:col-span-5 lg:col-span-4 h-[500px]"
        >
          <BotTerminal messages={mockSlackMessages} />
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
