import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Star, GitCommit, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Repository } from "@/lib/api";

interface ActivityHeatmapProps {
  repos: Repository[];
}

export function ActivityHeatmap({ repos }: ActivityHeatmapProps) {
  return (
    <div className="grid gap-4">
      {repos.map((repo) => {
        const activity = repo.activity || [];
        const maxCount = Math.max(...activity.map(d => d.count), 1);
        
        return (
          <Card key={repo.id} className="glass-panel border-border/50 bg-background/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-mono font-semibold text-foreground">
                    {repo.name}
                  </CardTitle>
                </div>
                <div className="flex items-center space-x-4 text-muted-foreground text-xs font-mono">
                  <span className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${
                      repo.language === 'Python' ? 'bg-blue-500' : 
                      repo.language === 'Rust' ? 'bg-orange-500' : 
                      repo.language === 'TypeScript' ? 'bg-blue-300' : 
                      'bg-cyan-400'
                    }`} />
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
              {repo.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1 pl-6">
                  {repo.description}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-[2px] h-[40px] w-full overflow-hidden mt-2">
                {activity.length > 0 ? (
                  activity.map((day, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(10, (day.count / maxCount) * 100)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.01 }}
                      className={`w-full rounded-sm min-w-[4px] ${
                        day.count > maxCount * 0.7
                          ? "bg-primary"
                          : day.count > maxCount * 0.3
                          ? "bg-primary/70"
                          : day.count > 0
                          ? "bg-primary/30"
                          : "bg-muted/20"
                      }`}
                      title={`${day.date}: ${day.count} events`}
                    />
                  ))
                ) : (
                  <div className="w-full text-center text-xs text-muted-foreground">No activity data</div>
                )}
              </div>
              <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1">
                  <GitCommit className="h-3 w-3" /> {repo.fullName}
                </span>
                <span>60 Day Activity</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
