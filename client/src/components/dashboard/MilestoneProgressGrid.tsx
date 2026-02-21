import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CheckCircle, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Milestone, MilestoneSubmission, ResearchProject } from "@/lib/api";

type CellStatus = "finished" | "in-progress" | "to-do" | "no-submission" | "no-milestone";

const statusConfig: Record<CellStatus, { bg: string; border: string; label: string }> = {
  "finished": { bg: "bg-green-500", border: "border-green-400", label: "Finished" },
  "in-progress": { bg: "bg-yellow-500", border: "border-yellow-400", label: "In Progress" },
  "to-do": { bg: "bg-muted/40", border: "border-muted-foreground/30", label: "To Do" },
  "no-submission": { bg: "bg-transparent", border: "border-muted-foreground/20 border-dashed", label: "Not Submitted" },
  "no-milestone": { bg: "bg-transparent", border: "border-transparent", label: "" },
};

function getMilestoneStatus(
  milestone: Milestone,
  submissions: MilestoneSubmission[],
  allMilestones: Milestone[]
): { status: CellStatus; submission?: MilestoneSubmission } {
  const projectMilestoneIds = new Set(
    allMilestones.filter(m => m.projectId === milestone.projectId).map(m => m.id)
  );
  const projectSubs = submissions.filter(s => projectMilestoneIds.has(s.milestoneId));

  for (const sub of projectSubs) {
    const answers = sub.customAnswers || {};
    const statusKey = `milestone_status:${milestone.id}`;
    if (answers[statusKey]) {
      try {
        const parsed = JSON.parse(answers[statusKey]);
        return { status: parsed.status as CellStatus, submission: sub };
      } catch {}
    }
  }

  const directSub = submissions.find(s => s.milestoneId === milestone.id);
  if (!directSub) return { status: "no-submission" };

  if (directSub.completionPercentage !== null && directSub.completionPercentage !== undefined) {
    if (directSub.completionPercentage >= 100) return { status: "finished", submission: directSub };
    if (directSub.completionPercentage > 0) return { status: "in-progress", submission: directSub };
  }

  return { status: "to-do", submission: directSub };
}


export function MilestoneProgressGrid({ 
  milestones, 
  submissions, 
  projects 
}: { 
  milestones: Milestone[]; 
  submissions: MilestoneSubmission[]; 
  projects: ResearchProject[];
}) {
  const [hideTestProjects, setHideTestProjects] = useState(true);

  if (!milestones?.length || !projects?.length) {
    return (
      <Card className="glass-panel border-primary/20">
        <CardContent className="py-8 text-center text-muted-foreground">
          No milestone data available to display progress.
        </CardContent>
      </Card>
    );
  }

  const projectMap = new Map(projects.map(p => [p.id, p]));
  const isTestProject = (projectId: string) => {
    const name = projectMap.get(projectId)?.name || "";
    return name.startsWith("[TEST]");
  };

  const filteredMilestones = hideTestProjects 
    ? milestones.filter(m => !isTestProject(m.projectId)) 
    : milestones;

  const allMonths = Array.from(new Set(filteredMilestones.map(m => m.month))).sort();
  const projectIds = Array.from(new Set(filteredMilestones.map(m => m.projectId)));

  const currentMonth = format(new Date(), "yyyy-MM");

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Milestone Progress
          </CardTitle>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
            <Checkbox
              checked={hideTestProjects}
              onCheckedChange={(checked) => setHideTestProjects(checked === true)}
              data-testid="checkbox-hide-test-projects"
            />
            Hide test projects
          </label>
        </div>
        <CardDescription>Individual milestones by project and month</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              <div className="flex items-end gap-1 mb-2">
                <div className="w-96 shrink-0" />
                {allMonths.map(month => (
                  <div 
                    key={month} 
                    className={`w-12 text-center text-xs font-mono ${month === currentMonth ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                  >
                    {format(parseISO(month + "-01"), "MMM")}
                    <div className="text-[10px]">{format(parseISO(month + "-01"), "yy")}</div>
                  </div>
                ))}
              </div>

              {projectIds.map(projectId => {
                const project = projectMap.get(projectId);
                if (!project) return null;
                const projectMilestones = filteredMilestones
                  .filter(m => m.projectId === projectId)
                  .sort((a, b) => a.month.localeCompare(b.month));

                return (
                  <div key={projectId} data-testid={`progress-row-${projectId}`} className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="truncate text-sm font-mono font-medium text-foreground" title={project.name}>
                        {project.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {projectMilestones.length}
                      </Badge>
                    </div>
                    <div className="ml-2 border-l border-border/30 pl-2">
                      {projectMilestones.map(milestone => {
                        const { status, submission } = getMilestoneStatus(milestone, submissions, filteredMilestones);
                        const config = statusConfig[status];
                        const descriptionPreview = milestone.description.split('\n')[0].slice(0, 200);

                        return (
                          <div 
                            key={milestone.id} 
                            className="flex items-start gap-1 mb-1"
                            data-testid={`progress-milestone-${milestone.id}`}
                          >
                            <div className="w-96 shrink-0 pr-2">
                              <div className="text-xs text-muted-foreground leading-snug" title={milestone.description}>
                                <span className="font-mono text-primary/70">
                                  {format(parseISO(milestone.month + "-01"), "MMM")}:
                                </span>{" "}
                                {descriptionPreview}
                              </div>
                            </div>
                            {allMonths.map(month => {
                              const isThisMonth = month === milestone.month;
                              if (!isThisMonth) {
                                return (
                                  <div key={month} className="w-12 h-7 flex items-center justify-center">
                                    <div className="w-px h-3 bg-border/20" />
                                  </div>
                                );
                              }

                              const tooltipText = `${project.name} — ${format(parseISO(month + "-01"), "MMMM yyyy")}\n${config.label}\n${milestone.description.slice(0, 120)}${submission ? `\nSubmitted: ${format(new Date(submission.submittedAt), "MMM d")}` : ''}`;

                              return (
                                <div
                                  key={month}
                                  className={`w-12 h-7 rounded-md border ${config.border} ${config.bg} transition-all hover:scale-110 cursor-default flex items-center justify-center`}
                                  title={tooltipText}
                                  data-testid={`progress-milestone-cell-${milestone.id}-${month}`}
                                >
                                  {status === "finished" && <CheckCircle className="h-3 w-3 text-white/80" />}
                                  {status === "in-progress" && <Clock className="h-3 w-3 text-white/80" />}
                                  {status === "to-do" && <div className="w-1.5 h-1.5 rounded-sm bg-muted-foreground/40" />}
                                  {status === "no-submission" && <div className="w-1.5 h-1.5 rounded-sm border border-dashed border-muted-foreground/30" />}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/40">
            <span className="font-medium">Legend:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm bg-green-500 border border-green-400" />
              <span>Finished</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm bg-yellow-500 border border-yellow-400" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm bg-muted/40 border border-muted-foreground/30" />
              <span>To Do</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm border border-dashed border-muted-foreground/30" />
              <span>Not Submitted</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
