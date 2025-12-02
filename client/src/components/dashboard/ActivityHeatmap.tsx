import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Repo } from "@/lib/mockData";
import { GitBranch, Star, GitCommit, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

interface ActivityHeatmapProps {
  repos: Repo[];
}

export function ActivityHeatmap({ repos }: ActivityHeatmapProps) {
  return (
    <div className="grid gap-4">
      {repos.map((repo) => (
        <Card key={repo.id} className="glass-panel border-border/50 bg-background/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {repo.status === "operational" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
                <CardTitle className="text-base font-mono font-semibold text-foreground">
                  {repo.name}
                </CardTitle>
              </div>
              <div className="flex items-center space-x-4 text-muted-foreground text-xs font-mono">
                <span className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${repo.language === 'Python' ? 'bg-blue-500' : repo.language === 'Rust' ? 'bg-orange-500' : repo.language === 'TypeScript' ? 'bg-blue-300' : 'bg-cyan-400'}`} />
                    {repo.language}
                </span>
                <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" /> {repo.stars}
                </span>
                <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" /> {repo.forks}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-1 pl-6">
                {repo.description}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-[40px] w-full overflow-hidden mt-2">
              {repo.activity.map((day, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(10, (day.count / 15) * 100)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.01 }}
                  className={`w-full rounded-sm min-w-[4px] ${
                    day.count > 10
                      ? "bg-primary"
                      : day.count > 5
                      ? "bg-primary/70"
                      : day.count > 0
                      ? "bg-primary/30"
                      : "bg-muted/20"
                  }`}
                  title={`${day.date}: ${day.count} commits`}
                />
              ))}
            </div>
            <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1"><GitCommit className="h-3 w-3"/> Last commit: {repo.lastCommit}</span>
                <span>30 Day Activity</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
