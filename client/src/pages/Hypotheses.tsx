import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getResearchTimeline, 
  getHypotheses,
  syncHypotheses,
  createHypothesis,
  linkProjectToHypothesis,
  unlinkProjectFromHypothesis,
  getHypothesisActivity,
  getHypothesisActivityTimeline,
  type ResearchTimeline,
  type Hypothesis,
  type HypothesisActivity,
} from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { RefreshCw, Calendar, ChevronDown, ChevronRight, Lightbulb, Link2, GitBranch, X, Plus, Github } from "lucide-react";
import { format, parseISO } from "date-fns";
import ReactMarkdown from "react-markdown";

const HYPOTHESIS_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", 
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
];

function HypothesesSection({ timeline }: { timeline: ResearchTimeline[] }) {
  const queryClient = useQueryClient();
  const [syncRepo, setSyncRepo] = useState({ owner: "cimcai", repo: "hypotheses", path: "" });
  const [showSync, setShowSync] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newHypothesis, setNewHypothesis] = useState({ title: "", content: "" });
  const [linkingProject, setLinkingProject] = useState<string | null>(null);
  const [expandedHypothesis, setExpandedHypothesis] = useState<string | null>(null);

  const { data: hypotheses = [], isLoading } = useQuery({
    queryKey: ["hypotheses"],
    queryFn: getHypotheses,
  });

  const syncMutation = useMutation({
    mutationFn: (params?: { owner: string; repo: string; path: string }) => {
      const { owner, repo, path } = params || syncRepo;
      return syncHypotheses(owner, repo, path);
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} new, updated ${data.updated} hypotheses`);
      if (data.errors.length > 0) {
        console.error("Sync errors:", data.errors);
      }
      queryClient.invalidateQueries({ queryKey: ["hypotheses"] });
      setShowSync(false);
    },
    onError: () => {
      toast.error("Failed to sync hypotheses");
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createHypothesis(newHypothesis.title, newHypothesis.content, true),
    onSuccess: () => {
      toast.success("Hypothesis created and pushed to GitHub!");
      queryClient.invalidateQueries({ queryKey: ["hypotheses"] });
      setNewHypothesis({ title: "", content: "" });
      setShowCreate(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create hypothesis");
    },
  });

  const quickSync = () => {
    syncMutation.mutate({ owner: "cimcai", repo: "hypotheses", path: "" });
  };

  const linkMutation = useMutation({
    mutationFn: ({ projectId, hypothesisId }: { projectId: string; hypothesisId: string }) =>
      linkProjectToHypothesis(projectId, hypothesisId, "tests"),
    onSuccess: () => {
      toast.success("Project linked to hypothesis");
      queryClient.invalidateQueries({ queryKey: ["hypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["projectHypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivity"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivityTimeline"] });
      setLinkingProject(null);
    },
    onError: () => {
      toast.error("Failed to link project");
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "validated": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "invalidated": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "archived": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  if (isLoading) {
    return <RefreshCw className="h-6 w-6 animate-spin text-primary mx-auto" />;
  }

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-mono text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Hypotheses
          <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
            cimcai/hypotheses
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            variant="default" 
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={quickSync}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setShowSync(!showSync)}
          >
            <GitBranch className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCreate && (
          <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-mono text-primary">
              <Github className="h-4 w-4" />
              New Hypothesis → cimcai/hypotheses
            </div>
            <Input
              placeholder="Hypothesis title"
              value={newHypothesis.title}
              onChange={(e) => setNewHypothesis(h => ({ ...h, title: e.target.value }))}
              className="font-mono text-sm"
              data-testid="input-hypothesis-title"
            />
            <Textarea
              placeholder="Describe the hypothesis..."
              value={newHypothesis.content}
              onChange={(e) => setNewHypothesis(h => ({ ...h, content: e.target.value }))}
              className="font-mono text-sm min-h-[100px]"
              data-testid="input-hypothesis-content"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newHypothesis.title || !newHypothesis.content}
                data-testid="button-create-hypothesis"
              >
                <Github className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Pushing..." : "Create & Push to GitHub"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {showSync && (
          <div className="p-4 border border-border/50 rounded-lg bg-muted/10 space-y-3">
            <p className="text-sm text-muted-foreground">
              Sync hypotheses from a GitHub repository containing markdown files.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Owner (e.g., myorg)"
                value={syncRepo.owner}
                onChange={(e) => setSyncRepo(s => ({ ...s, owner: e.target.value }))}
                className="font-mono text-sm"
              />
              <Input
                placeholder="Repo (e.g., hypotheses)"
                value={syncRepo.repo}
                onChange={(e) => setSyncRepo(s => ({ ...s, repo: e.target.value }))}
                className="font-mono text-sm"
              />
              <Input
                placeholder="Path (optional)"
                value={syncRepo.path}
                onChange={(e) => setSyncRepo(s => ({ ...s, path: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => syncMutation.mutate(syncRepo)}
                disabled={syncMutation.isPending || !syncRepo.owner || !syncRepo.repo}
              >
                {syncMutation.isPending ? "Syncing..." : "Sync"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSync(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {hypotheses.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 font-mono">
            No hypotheses yet. Sync from a GitHub repository to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {hypotheses.map((hypothesis) => (
              <div 
                key={hypothesis.id}
                className="p-4 border border-border/40 rounded-lg bg-muted/5 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => setExpandedHypothesis(
                      expandedHypothesis === hypothesis.id ? null : hypothesis.id
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {expandedHypothesis === hypothesis.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <h4 className="font-medium text-sm">{hypothesis.title}</h4>
                      <Badge variant="outline" className={`text-xs ${getStatusColor(hypothesis.status)}`}>
                        {hypothesis.status}
                      </Badge>
                    </div>
                    {hypothesis.summary && (
                      <p className="text-xs text-muted-foreground ml-6 line-clamp-2">
                        {hypothesis.summary}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLinkingProject(
                      linkingProject === hypothesis.id ? null : hypothesis.id
                    )}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>

                {expandedHypothesis === hypothesis.id && (
                  <div className="mt-4 ml-6 p-4 bg-muted/20 rounded border border-border/30 max-h-96 overflow-y-auto">
                    <div className="prose prose-sm prose-invert max-w-none
                      prose-headings:text-foreground prose-headings:font-mono prose-headings:font-semibold
                      prose-h1:text-xl prose-h1:border-b prose-h1:border-border/50 prose-h1:pb-2 prose-h1:mb-4
                      prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2
                      prose-h3:text-base prose-h3:mt-4
                      prose-p:text-foreground/80 prose-p:leading-relaxed
                      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-ul:text-foreground/80 prose-ol:text-foreground/80
                      prose-li:marker:text-primary
                      prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                      prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50
                      prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
                    ">
                      <ReactMarkdown>{hypothesis.content}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {linkingProject === hypothesis.id && (
                  <div className="mt-3 ml-6 p-3 border border-primary/30 rounded-lg bg-primary/5">
                    <p className="text-xs text-muted-foreground mb-2">Link to a research project:</p>
                    <div className="flex flex-wrap gap-2">
                      {timeline.map((t) => (
                        <Button
                          key={t.project.id}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => linkMutation.mutate({
                            projectId: t.project.id,
                            hypothesisId: hypothesis.id,
                          })}
                          disabled={linkMutation.isPending}
                        >
                          <div 
                            className="w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: t.project.color || "#10b981" }}
                          />
                          {t.project.name}
                        </Button>
                      ))}
                      {timeline.length === 0 && (
                        <span className="text-xs text-muted-foreground">No projects available</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HypothesisActivityPanel() {
  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["hypothesisActivity"],
    queryFn: getHypothesisActivity,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["hypothesisActivityTimeline"],
    queryFn: getHypothesisActivityTimeline,
  });

  const linkedActivity = activity.filter(a => a.linkedProjects.length > 0);
  const linkedTimeline = timeline.filter(t => 
    linkedActivity.some(a => a.hypothesis.id === t.hypothesisId)
  );

  const isLoading = activityLoading || timelineLoading;

  if (isLoading) {
    return (
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            Hypothesis Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (linkedActivity.length === 0) {
    return (
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            Hypothesis Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-6">
            No hypotheses are linked to projects yet. Map hypotheses to projects to see activity.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sortedActivity = [...linkedActivity].sort((a, b) => b.totalUpdates - a.totalUpdates);

  const chartData = linkedTimeline.length > 0 
    ? linkedTimeline[0].data.map((_, weekIndex) => {
        const point: Record<string, string | number> = { 
          week: linkedTimeline[0].data[weekIndex].week 
        };
        linkedTimeline.forEach((h) => {
          let cumulative = 0;
          for (let i = 0; i <= weekIndex; i++) {
            cumulative += h.data[i]?.count || 0;
          }
          point[h.hypothesisTitle] = cumulative;
        });
        return point;
      })
    : [];

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader>
        <CardTitle className="font-mono text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          Hypothesis Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {chartData.length > 0 && (
          <div className="h-64" data-testid="hypothesis-activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey="week" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px' }}
                />
                {linkedTimeline.map((h, idx) => (
                  <Line
                    key={h.hypothesisId}
                    type="monotone"
                    dataKey={h.hypothesisTitle}
                    stroke={HYPOTHESIS_COLORS[idx % HYPOTHESIS_COLORS.length]}
                    strokeWidth={2}
                    dot={{ fill: HYPOTHESIS_COLORS[idx % HYPOTHESIS_COLORS.length], r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="space-y-4">
          {sortedActivity.map(({ hypothesis, totalUpdates, lastActivityDate, linkedProjects }, idx) => (
            <div 
              key={hypothesis.id}
              className="p-4 border border-border/40 rounded-lg bg-muted/5"
              data-testid={`hypothesis-activity-${hypothesis.id}`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: HYPOTHESIS_COLORS[idx % HYPOTHESIS_COLORS.length] }}
                    />
                    <h4 className="font-medium text-sm truncate">{hypothesis.title}</h4>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {hypothesis.status}
                    </Badge>
                  </div>
                  {hypothesis.summary && (
                    <p className="text-xs text-muted-foreground mt-1 ml-5 line-clamp-1">
                      {hypothesis.summary}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold text-primary">{totalUpdates}</div>
                  <div className="text-xs text-muted-foreground">updates</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground ml-5">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Last: {lastActivityDate 
                      ? format(parseISO(lastActivityDate), 'MMM d, yyyy')
                      : 'No activity'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {linkedProjects.map(project => (
                    <div 
                      key={project.id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/30"
                      title={`${project.name}: ${project.updateCount} updates`}
                    >
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: project.color || "#10b981" }}
                      />
                      <span className="truncate max-w-[80px]">{project.name}</span>
                      <span className="text-primary font-mono">({project.updateCount})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HypothesesPage() {
  const { data: timeline = [], isLoading } = useQuery({
    queryKey: ["researchTimeline"],
    queryFn: getResearchTimeline,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Hypotheses</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Track and manage research hypotheses, sync from GitHub, and link to projects
        </p>
      </div>

      <HypothesisActivityPanel />

      <HypothesesSection timeline={timeline} />
    </div>
  );
}
