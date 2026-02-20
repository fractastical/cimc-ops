import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getResearchTimeline, 
  importResearchNotes, 
  getHypotheses,
  syncHypotheses,
  createHypothesis,
  linkProjectToHypothesis,
  getProjectHypotheses,
  unlinkProjectFromHypothesis,
  getHypothesisActivity,
  getHypothesisActivityTimeline,
  updateResearchProject,
  getResearchProjects,
  getMilestones,
  getMilestoneSubmissions,
  getNotionDatabases,
  getNotionDatabaseEntries,
  getNotionPage,
  type ResearchTimeline,
  type Hypothesis,
  type HypothesisActivity,
  type NotionDatabase,
  type NotionResearcher,
  type NotionPageContent,
} from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { RefreshCw, Upload, Calendar, User, ChevronDown, ChevronRight, Lightbulb, Link2, GitBranch, X, Plus, Github, Download, Pencil, Check, ExternalLink, BookOpen, Database } from "lucide-react";
import { MilestoneProgressGrid } from "@/components/dashboard/MilestoneProgressGrid";
import { format, parseISO } from "date-fns";
import ReactMarkdown from "react-markdown";

const PROJECT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", 
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
];

function MapHypothesesModal({ 
  project, 
  hypotheses, 
  onClose 
}: { 
  project: ResearchTimeline; 
  hypotheses: Hypothesis[]; 
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: links = [] } = useQuery({
    queryKey: ["projectHypotheses", project.project.id],
    queryFn: () => getProjectHypotheses(project.project.id),
  });

  const linkedIds = new Set(links.map(l => l.hypothesisId));

  const linkMutation = useMutation({
    mutationFn: (hypothesisId: string) =>
      linkProjectToHypothesis(project.project.id, hypothesisId, "tests"),
    onSuccess: () => {
      toast.success("Hypothesis linked");
      queryClient.invalidateQueries({ queryKey: ["projectHypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivity"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivityTimeline"] });
    },
    onError: () => {
      toast.error("Failed to link hypothesis");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (hypothesisId: string) =>
      unlinkProjectFromHypothesis(project.project.id, hypothesisId),
    onSuccess: () => {
      toast.success("Hypothesis unlinked");
      queryClient.invalidateQueries({ queryKey: ["projectHypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivity"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivityTimeline"] });
    },
    onError: () => {
      toast.error("Failed to unlink hypothesis");
    },
  });

  const filteredHypotheses = hypotheses.filter(h =>
    h.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (h.summary && h.summary.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-400" />
            <h3 className="font-mono font-semibold">Map Hypotheses to {project.project.name}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 border-b border-border">
          <Input
            placeholder="Search hypotheses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="font-mono"
            data-testid="input-search-hypotheses"
          />
        </div>
        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {filteredHypotheses.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No hypotheses found</p>
          ) : (
            filteredHypotheses.map((hypothesis) => {
              const isLinked = linkedIds.has(hypothesis.id);
              return (
                <div
                  key={hypothesis.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    isLinked 
                      ? 'border-amber-500/50 bg-amber-500/10' 
                      : 'border-border/40 hover:border-primary/40 hover:bg-muted/10'
                  }`}
                  onClick={() => {
                    if (isLinked) {
                      unlinkMutation.mutate(hypothesis.id);
                    } else {
                      linkMutation.mutate(hypothesis.id);
                    }
                  }}
                  data-testid={`hypothesis-toggle-${hypothesis.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{hypothesis.title}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {hypothesis.status}
                        </Badge>
                      </div>
                      {hypothesis.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {hypothesis.summary}
                        </p>
                      )}
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      isLinked ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'
                    }`}>
                      {isLinked && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="p-4 border-t border-border flex justify-end">
          <Button onClick={onClose} data-testid="button-close-modal">Done</Button>
        </div>
      </div>
    </div>
  );
}

function ResearchTimelineChart({ timeline, hypotheses, notionEntries, onResearcherClick }: { timeline: ResearchTimeline[]; hypotheses: Hypothesis[]; notionEntries?: NotionResearcher[]; onResearcherClick?: (researcher: NotionResearcher) => void }) {
  const queryClient = useQueryClient();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [mappingProject, setMappingProject] = useState<ResearchTimeline | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateResearchProject(id, { name }),
    onSuccess: () => {
      toast.success("Project renamed");
      queryClient.invalidateQueries({ queryKey: ["researchTimeline"] });
      setEditingProjectId(null);
    },
    onError: () => {
      toast.error("Failed to rename project");
    },
  });

  const findNotionResearcher = (name: string): NotionResearcher | undefined => {
    if (!notionEntries || !notionEntries.length || !name) return undefined;
    const lower = name.toLowerCase().trim();
    const parts = lower.split(/\s+/);
    const lastName = parts[parts.length - 1];
    const firstName = parts[0];

    return notionEntries.find(e => {
      const eName = e.name.toLowerCase().trim();
      if (eName === lower) return true;
      if (eName.includes(lower) || lower.includes(eName)) return true;
      const eParts = eName.split(/\s+/);
      const eLastName = eParts[eParts.length - 1];
      const eFirstName = eParts[0];
      if (lastName.length > 2 && eLastName === lastName) return true;
      if (lastName.length > 2 && eLastName.length > 2 && (eLastName.includes(lastName) || lastName.includes(eLastName))) return true;
      if (firstName.length > 2 && eFirstName.length > 2 && eLastName === lastName && (eFirstName.startsWith(firstName.slice(0, 3)) || firstName.startsWith(eFirstName.slice(0, 3)))) return true;
      if (parts.length === 1 && firstName.length > 3 && eFirstName === firstName) return true;
      return false;
    });
  };

  if (timeline.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 font-mono">
        No research projects yet. Import meeting notes to get started.
      </div>
    );
  }

  // Get all unique dates
  const allDates = new Set<string>();
  timeline.forEach(t => t.updates.forEach(u => {
    allDates.add(format(parseISO(u.date), 'yyyy-MM-dd'));
  }));
  const sortedDates = Array.from(allDates).sort();

  // Get unique grantees
  const grantees = new Set<string>();
  timeline.forEach(t => t.updates.forEach(u => {
    if (u.grantee) grantees.add(u.grantee);
  }));

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-panel border-primary/20">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{timeline.length}</div>
            <div className="text-sm text-muted-foreground font-mono">Active Projects</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-primary/20">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-500">
              {timeline.reduce((sum, t) => sum + t.updates.length, 0)}
            </div>
            <div className="text-sm text-muted-foreground font-mono">Total Updates</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-primary/20">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-500">{grantees.size}</div>
            <div className="text-sm text-muted-foreground font-mono">Contributors</div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Visualization */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg">Research Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Date headers */}
            <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground font-mono overflow-x-auto">
              <div className="w-48 shrink-0">Project</div>
              <div className="flex gap-1 flex-1">
                {sortedDates.map(date => (
                  <div 
                    key={date} 
                    className="w-8 text-center shrink-0"
                    title={format(parseISO(date), 'MMM d, yyyy')}
                  >
                    {format(parseISO(date), 'MM/dd').slice(0, 5)}
                  </div>
                ))}
              </div>
            </div>

            {/* Project rows */}
            {timeline.map((project, idx) => {
              const isExpanded = expandedProject === project.project.id;
              const updateDates = new Map(
                project.updates.map(u => [format(parseISO(u.date), 'yyyy-MM-dd'), u])
              );

              return (
                <div key={project.project.id} className="group">
                  <div 
                    className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setExpandedProject(isExpanded ? null : project.project.id)}
                  >
                    <div className="w-48 shrink-0 flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div 
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: project.project.color || PROJECT_COLORS[idx % PROJECT_COLORS.length] }}
                      />
                      {editingProjectId === project.project.id ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingName.trim()) {
                                renameMutation.mutate({ id: project.project.id, name: editingName.trim() });
                              }
                              if (e.key === "Escape") {
                                setEditingProjectId(null);
                              }
                            }}
                            className="h-6 text-sm font-mono px-1 py-0"
                            autoFocus
                            data-testid={`input-rename-project-${project.project.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (editingName.trim()) {
                                renameMutation.mutate({ id: project.project.id, name: editingName.trim() });
                              }
                            }}
                            data-testid={`button-confirm-rename-${project.project.id}`}
                          >
                            <Check className="h-3 w-3 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectId(null);
                            }}
                            data-testid={`button-cancel-rename-${project.project.id}`}
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <span 
                          className="font-mono text-sm truncate group/name flex items-center gap-1 cursor-pointer hover:text-primary transition-colors" 
                          title={`Click to rename "${project.project.name}"`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProjectId(project.project.id);
                            setEditingName(project.project.name);
                          }}
                        >
                          {project.project.name}
                          <Pencil
                            className="h-3 w-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 hover:text-primary transition-all cursor-pointer shrink-0"
                            data-testid={`button-edit-project-name-${project.project.id}`}
                          />
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-1">
                      {sortedDates.map(date => {
                        const hasUpdate = updateDates.has(date);
                        return (
                          <div
                            key={date}
                            className={`w-8 h-6 rounded shrink-0 flex items-center justify-center transition-all ${
                              hasUpdate 
                                ? 'cursor-pointer hover:scale-110' 
                                : 'bg-muted/10'
                            }`}
                            style={hasUpdate ? { 
                              backgroundColor: project.project.color || PROJECT_COLORS[idx % PROJECT_COLORS.length],
                              opacity: 0.9
                            } : undefined}
                            title={hasUpdate ? updateDates.get(date)?.description.slice(0, 100) : undefined}
                          >
                            {hasUpdate && (
                              <div className="w-2 h-2 bg-white rounded-full opacity-80" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="w-12 text-right font-mono text-xs text-muted-foreground">
                      {project.updates.length}
                    </div>
                  </div>

                  {/* Linked Hypotheses */}
                  <ProjectHypothesesBadges projectId={project.project.id} hypotheses={hypotheses} />

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="ml-8 pl-4 border-l-2 border-primary/30 py-2 space-y-3">
                      <div className="flex items-center gap-2 pb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMappingProject(project);
                          }}
                          data-testid={`button-map-hypotheses-${project.project.id}`}
                        >
                          <Lightbulb className="h-3 w-3 mr-1 text-amber-400" />
                          Map Hypotheses
                        </Button>
                      </div>
                      {project.updates
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(update => (
                        <div key={update.id} className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span className="font-mono">{format(parseISO(update.date), 'MMM d, yyyy')}</span>
                            {update.grantee && (() => {
                              const notionMatch = findNotionResearcher(update.grantee);
                              return (
                                <>
                                  <User className="h-3 w-3 ml-2" />
                                  {notionMatch && onResearcherClick ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onResearcherClick(notionMatch); }}
                                      className="text-primary hover:underline cursor-pointer"
                                      data-testid={`link-researcher-${update.id}`}
                                    >
                                      {update.grantee}
                                    </button>
                                  ) : (
                                    <span>{update.grantee}</span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <p className="text-sm text-foreground/90 leading-relaxed">
                            {update.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Contributors List */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg">Contributors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from(grantees).sort().map(grantee => {
              const count = timeline.reduce((sum, t) => 
                sum + t.updates.filter(u => u.grantee === grantee).length, 0
              );
              const notionMatch = findNotionResearcher(grantee);
              const isClickable = notionMatch && onResearcherClick;
              return (
                <button 
                  key={grantee}
                  onClick={() => isClickable && onResearcherClick(notionMatch)}
                  className={`px-3 py-1.5 rounded-full border text-sm font-mono flex items-center gap-2 transition-colors ${
                    isClickable
                      ? "bg-primary/10 border-primary/30 hover:bg-primary/20 hover:border-primary/50 cursor-pointer"
                      : "bg-muted/30 border-border/50 cursor-default"
                  }`}
                  data-testid={`button-contributor-${grantee}`}
                >
                  <User className={`h-3 w-3 ${isClickable ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={isClickable ? "text-primary" : ""}>{grantee}</span>
                  <span className="text-xs text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Map Hypotheses Modal */}
      {mappingProject && (
        <MapHypothesesModal
          project={mappingProject}
          hypotheses={hypotheses}
          onClose={() => setMappingProject(null)}
        />
      )}
    </div>
  );
}

function ProjectHypothesesBadges({ projectId, hypotheses }: { projectId: string; hypotheses: Hypothesis[] }) {
  const queryClient = useQueryClient();
  
  const { data: links = [] } = useQuery({
    queryKey: ["projectHypotheses", projectId],
    queryFn: () => getProjectHypotheses(projectId),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ hypothesisId }: { hypothesisId: string }) =>
      unlinkProjectFromHypothesis(projectId, hypothesisId),
    onSuccess: () => {
      toast.success("Hypothesis unlinked");
      queryClient.invalidateQueries({ queryKey: ["projectHypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivity"] });
      queryClient.invalidateQueries({ queryKey: ["hypothesisActivityTimeline"] });
    },
    onError: () => {
      toast.error("Failed to unlink hypothesis");
    },
  });

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {links.map((link) => {
        const hypothesis = link.hypothesis || hypotheses.find(h => h.id === link.hypothesisId);
        if (!hypothesis) return null;
        return (
          <Badge
            key={link.hypothesisId}
            variant="outline"
            className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1 group"
          >
            <Lightbulb className="h-3 w-3" />
            <span className="max-w-[150px] truncate" title={hypothesis.title}>
              {hypothesis.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                unlinkMutation.mutate({ hypothesisId: link.hypothesisId });
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-1"
              title="Unlink hypothesis"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}

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

                {/* Expanded content */}
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

                {/* Link to project UI */}
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

const HYPOTHESIS_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", 
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
];

const STATUS_COLORS: Record<string, string> = {
  "pending": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "in_progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "reviewing": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "completed": "bg-green-500/20 text-green-400 border-green-500/30",
  "published": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "archived": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "unknown": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function HypothesisActivityPanel() {
  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["hypothesisActivity"],
    queryFn: getHypothesisActivity,
  });

  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["hypothesisActivityTimeline"],
    queryFn: getHypothesisActivityTimeline,
  });

  // Only show hypotheses with linked projects
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

  // Sort by total updates descending
  const sortedActivity = [...linkedActivity].sort((a, b) => b.totalUpdates - a.totalUpdates);

  // Prepare chart data - merge all hypothesis timelines into one array with cumulative counts
  const chartData = linkedTimeline.length > 0 
    ? linkedTimeline[0].data.map((_, weekIndex) => {
        const point: Record<string, string | number> = { 
          week: linkedTimeline[0].data[weekIndex].week 
        };
        linkedTimeline.forEach((h) => {
          // Sum all counts from week 0 to current week for cumulative total
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
        {/* Line Chart */}
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

        {/* Activity Summary Cards */}
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

function NotionResearcherDetail({ researcher, onClose }: { researcher: NotionResearcher; onClose: () => void }) {
  const { data: pageContent, isLoading } = useQuery({
    queryKey: ["notionPage", researcher.id],
    queryFn: () => getNotionPage(researcher.id),
  });

  const skipProps = new Set(["_name", "Name", "name"]);
  const displayProps = Object.entries(researcher.properties).filter(
    ([key, val]) => !skipProps.has(key) && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h3 className="font-mono font-semibold">{researcher.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={researcher.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
              data-testid="link-notion-page"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {displayProps.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {displayProps.map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <span className="text-xs text-muted-foreground font-mono uppercase">{key}</span>
                  <div className="text-sm">
                    {Array.isArray(val) ? (
                      <div className="flex flex-wrap gap-1">
                        {val.map((v: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{v}</Badge>
                        ))}
                      </div>
                    ) : typeof val === "boolean" ? (
                      <Badge variant={val ? "default" : "outline"} className="text-xs">
                        {val ? "Yes" : "No"}
                      </Badge>
                    ) : typeof val === "string" && val.startsWith("http") ? (
                      <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs break-all">
                        {val}
                      </a>
                    ) : (
                      <span className="text-foreground">{String(val)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}

          {pageContent && pageContent.blocks.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <h4 className="font-mono text-sm font-semibold text-muted-foreground">Page Content</h4>
              <div className="space-y-1 text-sm">
                {pageContent.blocks
                  .filter(b => b.text)
                  .map((block) => (
                    <div key={block.id} className={
                      block.type === "heading_1" ? "text-lg font-bold mt-3" :
                      block.type === "heading_2" ? "text-base font-semibold mt-2" :
                      block.type === "heading_3" ? "text-sm font-semibold mt-1" :
                      block.type === "bulleted_list_item" ? "pl-4 before:content-['•'] before:mr-2 before:text-primary" :
                      block.type === "numbered_list_item" ? "pl-4" :
                      block.type === "to_do" ? "pl-4" :
                      block.type === "quote" ? "pl-4 border-l-2 border-primary/40 italic text-muted-foreground" :
                      block.type === "code" ? "font-mono bg-muted/20 p-2 rounded text-xs" :
                      "text-foreground"
                    }>
                      {block.text}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotionResearchersPanel() {
  const [selectedResearcher, setSelectedResearcher] = useState<NotionResearcher | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: databases = [], isLoading: loadingDbs } = useQuery({
    queryKey: ["notionDatabases"],
    queryFn: getNotionDatabases,
  });

  const researcherDb = databases.find(db => 
    db.title.toLowerCase().includes("grantee") || 
    db.title.toLowerCase().includes("researcher")
  ) || databases.find(db => 
    db.title.toLowerCase().includes("people")
  ) || (databases.length > 0 ? databases[0] : null);
  const activeDbId = researcherDb?.id || null;
  const activeDbTitle = researcherDb?.title || "";

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ["notionEntries", activeDbId],
    queryFn: () => getNotionDatabaseEntries(activeDbId!),
    enabled: !!activeDbId,
  });

  const filteredEntries = entries.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    Object.values(e.properties).some(v => 
      typeof v === "string" && v.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const isLoading = loadingDbs || (!!activeDbId && loadingEntries);

  return (
    <Card className="glass-panel border-primary/20" data-testid="card-notion-researchers">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            {activeDbTitle || "Researcher Profiles (Notion)"}
          </CardTitle>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {entries.length} entries
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : databases.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No Notion databases found. Make sure to share databases with the integration.
          </p>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder="Search researchers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="font-mono text-sm h-8"
              data-testid="input-search-researchers"
            />
            
            {filteredEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No entries found</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredEntries.map((entry) => {
                  const propsToShow = Object.entries(entry.properties)
                    .filter(([key, val]) => 
                      key !== "Name" && key !== "name" && key !== "_name" &&
                      val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)
                    )
                    .slice(0, 3);
                  
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedResearcher(entry)}
                      className="text-left p-3 rounded-lg border border-border/30 hover:border-primary/40 hover:bg-muted/10 transition-colors"
                      data-testid={`card-researcher-${entry.id}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-mono text-sm font-medium truncate">{entry.name || "Untitled"}</span>
                        </div>
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-primary shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {propsToShow.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {propsToShow.map(([key, val]) => (
                            <div key={key} className="text-xs text-muted-foreground truncate">
                              <span className="font-mono text-muted-foreground/60">{key}:</span>{" "}
                              {Array.isArray(val) ? val.join(", ") : String(val)}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {selectedResearcher && (
        <NotionResearcherDetail
          researcher={selectedResearcher}
          onClose={() => setSelectedResearcher(null)}
        />
      )}
    </Card>
  );
}

export default function Research() {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [selectedResearcherForModal, setSelectedResearcherForModal] = useState<NotionResearcher | null>(null);

  const { data: timeline, isLoading } = useQuery({
    queryKey: ["researchTimeline"],
    queryFn: getResearchTimeline,
  });

  const { data: hypotheses = [] } = useQuery({
    queryKey: ["hypotheses"],
    queryFn: getHypotheses,
  });

  const { data: researchProjects = [] } = useQuery({
    queryKey: ["/api/research-projects"],
    queryFn: getResearchProjects,
  });

  const { data: allMilestones = [] } = useQuery({
    queryKey: ["/api/milestones"],
    queryFn: () => getMilestones(),
  });

  const { data: milestoneSubmissions = [] } = useQuery({
    queryKey: ["/api/milestone-submissions"],
    queryFn: () => getMilestoneSubmissions(),
  });

  const { data: notionDatabases = [] } = useQuery({
    queryKey: ["notionDatabases"],
    queryFn: getNotionDatabases,
  });

  const researcherNotionDb = notionDatabases.find(db => 
    db.title.toLowerCase().includes("grantee") || 
    db.title.toLowerCase().includes("researcher")
  ) || notionDatabases.find(db => 
    db.title.toLowerCase().includes("people")
  ) || (notionDatabases.length > 0 ? notionDatabases[0] : null);
  const researcherDbId = researcherNotionDb?.id || null;

  const { data: notionEntries = [] } = useQuery({
    queryKey: ["notionEntries", researcherDbId],
    queryFn: () => getNotionDatabaseEntries(researcherDbId!),
    enabled: !!researcherDbId,
  });

  const importMutation = useMutation({
    mutationFn: (notes: { project: string; date: string; description: string }[]) => 
      importResearchNotes(notes),
    onSuccess: (data) => {
      toast.success(data.message);
      setJsonInput("");
      setShowImport(false);
      queryClient.invalidateQueries({ queryKey: ["researchTimeline"] });
    },
    onError: () => {
      toast.error("Failed to import notes. Check JSON format.");
    },
  });

  const handleImport = () => {
    try {
      const notes = JSON.parse(jsonInput);
      if (!Array.isArray(notes)) {
        toast.error("JSON must be an array of meeting notes");
        return;
      }
      importMutation.mutate(notes);
    } catch (e) {
      toast.error("Invalid JSON format");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Research Projects</h1>
          <p className="text-muted-foreground font-mono text-sm">
            Track progress across research projects, hypotheses, and grantees
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => window.open("/api/reports/monthly-pdf", "_blank")}
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowImport(!showImport)}
            data-testid="button-toggle-import"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Notes
          </Button>
        </div>
      </div>

      {showImport && (
        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="font-mono text-lg">Import Meeting Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a JSON array of meeting notes. Each note should have: project, date, description
            </p>
            <Textarea
              data-testid="textarea-json-import"
              placeholder='[{"project": "Project Name", "date": "2025-01-15", "description": "Update details..."}]'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleImport}
                disabled={importMutation.isPending || !jsonInput.trim()}
                data-testid="button-import-notes"
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowImport(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <MilestoneProgressGrid
        milestones={allMilestones}
        submissions={milestoneSubmissions}
        projects={researchProjects}
      />

      <ResearchTimelineChart 
        timeline={timeline || []} 
        hypotheses={hypotheses} 
        notionEntries={notionEntries}
        onResearcherClick={setSelectedResearcherForModal}
      />

      <HypothesisActivityPanel />

      <HypothesesSection timeline={timeline || []} />

      <NotionResearchersPanel />

      {selectedResearcherForModal && (
        <NotionResearcherDetail
          researcher={selectedResearcherForModal}
          onClose={() => setSelectedResearcherForModal(null)}
        />
      )}
    </div>
  );
}
