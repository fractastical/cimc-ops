import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Clock, FileText, User } from "lucide-react";
import type { ResearchProject, ResearchUpdate } from "@/lib/api";

interface ResearchBoardProps {
  projects: ResearchProject[];
  updates: ResearchUpdate[];
}

export function ResearchBoard({ projects, updates }: ResearchBoardProps) {
  const getUpdateCount = (projectId: string) => {
    return updates.filter(u => u.projectId === projectId).length;
  };

  const getLatestUpdate = (projectId: string) => {
    const projectUpdates = updates.filter(u => u.projectId === projectId);
    if (projectUpdates.length === 0) return null;
    return projectUpdates.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Card className="glass-panel h-full border-primary/20 bg-background/50 overflow-hidden flex flex-col">
      <CardHeader className="pb-4 flex flex-row items-center justify-between flex-shrink-0">
        <CardTitle className="text-sm font-medium font-mono text-muted-foreground uppercase tracking-widest">
          Active Research
        </CardTitle>
        <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/10">
          {projects.length} Project{projects.length !== 1 ? "s" : ""}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto flex-1">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <FlaskConical className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground font-mono text-sm">
              No research projects yet.
            </p>
            <p className="text-muted-foreground/70 font-mono text-xs mt-1">
              Add projects in the Research tab to start tracking.
            </p>
          </div>
        ) : (
          projects.map((project) => {
            const updateCount = getUpdateCount(project.id);
            const latestUpdate = getLatestUpdate(project.id);
            
            return (
              <div
                key={project.id}
                data-testid={`card-research-${project.id}`}
                className="group flex flex-col gap-3 p-3 rounded-md border border-border/40 bg-muted/5 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color || "#10b981" }}
                      />
                      <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </h4>
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground pl-5 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px] flex-shrink-0 ml-2">
                    <FileText className="h-3 w-3 mr-1" />
                    {updateCount} update{updateCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
                
                {latestUpdate && (
                  <div className="pl-5 space-y-2">
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 border border-border/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3 w-3" />
                        <span className="font-mono">{formatDate(latestUpdate.date)}</span>
                        {latestUpdate.grantee && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <User className="h-3 w-3" />
                            <span>{latestUpdate.grantee}</span>
                          </>
                        )}
                      </div>
                      <p className="line-clamp-2 text-foreground/80">
                        {latestUpdate.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
