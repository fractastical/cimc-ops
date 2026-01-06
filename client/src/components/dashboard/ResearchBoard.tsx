import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Clock, FileText, User } from "lucide-react";
import type { ResearchProject, ResearchUpdate } from "@/lib/api";
import { updateResearchProject } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ResearchBoardProps {
  projects: ResearchProject[];
  updates: ResearchUpdate[];
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "bg-green-500" },
  { value: "on-hold", label: "On Hold", color: "bg-yellow-500" },
  { value: "completed", label: "Completed", color: "bg-blue-500" },
  { value: "archived", label: "Archived", color: "bg-gray-500" },
];

export function ResearchBoard({ projects, updates }: ResearchBoardProps) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { status?: string; hIndex?: number } }) =>
      updateResearchProject(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["researchTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["researchProjects"] });
      toast.success("Project updated");
    },
    onError: () => {
      toast.error("Failed to update project");
    },
  });

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

  const statusOrder: Record<string, number> = { active: 0, "on-hold": 1, completed: 2, archived: 3 };
  const sortedProjects = [...projects].sort((a, b) => {
    const statusA = statusOrder[a.status || "active"] ?? 4;
    const statusB = statusOrder[b.status || "active"] ?? 4;
    if (statusA !== statusB) return statusA - statusB;
    return (b.hIndex || 0) - (a.hIndex || 0);
  });

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getStatusColor = (status: string | null) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return opt?.color || "bg-green-500";
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
          sortedProjects.map((project) => {
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
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(project.status)}`}
                      />
                      <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {project.name}
                      </h4>
                      {project.hIndex !== null && project.hIndex > 0 && (
                        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                          h:{project.hIndex}
                        </Badge>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground pl-5 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Select
                      value={project.status || "active"}
                      onValueChange={(value) => updateMutation.mutate({ id: project.id, updates: { status: value } })}
                    >
                      <SelectTrigger 
                        className="h-7 w-24 text-xs font-mono"
                        data-testid={`select-status-${project.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      <FileText className="h-3 w-3 mr-1" />
                      {updateCount}
                    </Badge>
                  </div>
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
