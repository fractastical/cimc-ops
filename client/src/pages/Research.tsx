import { useState, useEffect } from "react";
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
  linkProjectToHypothesis,
  getProjectHypotheses,
  unlinkProjectFromHypothesis,
  updateResearchProject,
  mergeResearchProjects,
  getResearchProjects,
  getMilestones,
  getMilestoneSubmissions,
  getNotionDatabases,
  getNotionDatabaseEntries,
  getNotionPage,
  type ResearchTimeline,
  type Hypothesis,
  type NotionDatabase,
  type NotionResearcher,
  type NotionPageContent,
  type Milestone,
  type MilestoneSubmission,
} from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { RefreshCw, Upload, Calendar, User, ChevronDown, ChevronRight, Lightbulb, Link2, X, Plus, Download, Pencil, Check, ExternalLink, BookOpen, Database, FileText, Merge, Trash2, FileDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

function ResearchTimelineChart({ timeline, hypotheses, notionEntries, onResearcherClick, milestones, milestoneSubmissions }: { timeline: ResearchTimeline[]; hypotheses: Hypothesis[]; notionEntries?: NotionResearcher[]; onResearcherClick?: (researcher: NotionResearcher) => void; milestones?: Milestone[]; milestoneSubmissions?: MilestoneSubmission[] }) {
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

  const sortedTimeline = [...timeline].sort((a, b) => {
    const aMilestones = (milestoneSubmissions || []).filter(s => s.projectId === a.project.id).length;
    const bMilestones = (milestoneSubmissions || []).filter(s => s.projectId === b.project.id).length;
    if (bMilestones !== aMilestones) return bMilestones - aMilestones;
    return b.updates.length - a.updates.length;
  });

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
              <div className="w-64 shrink-0">Project</div>
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

            {/* Project rows - sorted by milestones completed, then by update count */}
            {sortedTimeline.map((project, idx) => {
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
                    <div className="w-64 shrink-0 flex items-center gap-2">
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

function MergeProjectsPanel({ timeline }: { timeline: ResearchTimeline[] }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [keepId, setKeepId] = useState<string | null>(null);

  const mergeMutation = useMutation({
    mutationFn: ({ keepId, mergeIds }: { keepId: string; mergeIds: string[] }) =>
      mergeResearchProjects(keepId, mergeIds),
    onSuccess: (data) => {
      toast.success(`Merged projects! ${data.updatesReassigned} updates reassigned.`);
      setSelectedIds(new Set());
      setKeepId(null);
      queryClient.invalidateQueries({ queryKey: ["researchTimeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/research-projects"] });
    },
    onError: () => toast.error("Failed to merge projects"),
  });

  const projects = timeline.map(t => ({
    id: t.project.id,
    name: t.project.name,
    color: t.project.color || "#3b82f6",
    updateCount: t.updates.length,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      if (keepId === id) setKeepId(null);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleMerge = () => {
    if (!keepId || selectedIds.size < 2) return;
    const mergeIds = Array.from(selectedIds).filter(id => id !== keepId);
    mergeMutation.mutate({ keepId, mergeIds });
  };

  return (
    <Card className="glass-panel border-primary/20" data-testid="card-merge-projects">
      <CardHeader>
        <CardTitle className="font-mono text-lg flex items-center gap-2">
          <Merge className="h-5 w-5 text-primary" />
          Merge Duplicate Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select projects to merge, then pick which one to keep. All updates from the others will be moved to the kept project, and the duplicates will be deleted.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
          {projects.map(p => (
            <div
              key={p.id}
              data-testid={`merge-project-${p.id}`}
              onClick={() => toggleSelect(p.id)}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer border text-sm transition-colors ${
                selectedIds.has(p.id) 
                  ? keepId === p.id 
                    ? "border-green-500 bg-green-500/10" 
                    : "border-primary bg-primary/10" 
                  : "border-border/30 hover:border-border/60"
              }`}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="truncate flex-1">{p.name}</span>
              <Badge variant="secondary" className="text-xs">{p.updateCount}</Badge>
              {selectedIds.has(p.id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setKeepId(p.id); }}
                  className={`text-xs px-1.5 py-0.5 rounded ${keepId === p.id ? "bg-green-500 text-white" : "bg-muted hover:bg-muted/80"}`}
                  data-testid={`keep-project-${p.id}`}
                >
                  {keepId === p.id ? "Keeping" : "Keep"}
                </button>
              )}
            </div>
          ))}
        </div>
        {selectedIds.size >= 2 && (
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMerge}
              disabled={!keepId || mergeMutation.isPending}
              data-testid="button-merge-projects"
            >
              <Merge className="h-4 w-4 mr-2" />
              {mergeMutation.isPending ? "Merging..." : `Merge ${selectedIds.size} projects`}
            </Button>
            {!keepId && <span className="text-sm text-amber-400">Click "Keep" on the project you want to keep</span>}
            <Button variant="ghost" onClick={() => { setSelectedIds(new Set()); setKeepId(null); }}>Clear</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Research() {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-pdf">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open("/api/reports/monthly-pdf?months=1", "_blank")} data-testid="export-1-month">
                <FileDown className="h-4 w-4 mr-2" />
                Last 1 Month
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("/api/reports/monthly-pdf?months=3", "_blank")} data-testid="export-3-month">
                <FileDown className="h-4 w-4 mr-2" />
                Last 3 Months
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("/api/reports/monthly-pdf?months=6", "_blank")} data-testid="export-6-month">
                <FileDown className="h-4 w-4 mr-2" />
                Last 6 Months
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("/api/reports/monthly-pdf?months=12", "_blank")} data-testid="export-12-month">
                <FileDown className="h-4 w-4 mr-2" />
                Last 12 Months
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            variant="outline" 
            onClick={() => setShowMerge(!showMerge)}
            data-testid="button-toggle-merge"
          >
            <Merge className="h-4 w-4 mr-2" />
            Merge Duplicates
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

      {showMerge && <MergeProjectsPanel timeline={timeline || []} />}

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
        milestones={allMilestones}
        milestoneSubmissions={milestoneSubmissions}
      />

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
