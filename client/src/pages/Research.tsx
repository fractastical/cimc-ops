import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getResearchTimeline, importResearchNotes, type ResearchTimeline } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Upload, Calendar, User, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";

const PROJECT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", 
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
];

function ResearchTimelineChart({ timeline }: { timeline: ResearchTimeline[] }) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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
                      <span className="font-mono text-sm truncate" title={project.project.name}>
                        {project.project.name}
                      </span>
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

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="ml-8 pl-4 border-l-2 border-primary/30 py-2 space-y-3">
                      {project.updates
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(update => (
                        <div key={update.id} className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span className="font-mono">{format(parseISO(update.date), 'MMM d, yyyy')}</span>
                            {update.grantee && (
                              <>
                                <User className="h-3 w-3 ml-2" />
                                <span>{update.grantee}</span>
                              </>
                            )}
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
              return (
                <div 
                  key={grantee}
                  className="px-3 py-1.5 rounded-full bg-muted/30 border border-border/50 text-sm font-mono flex items-center gap-2"
                >
                  <User className="h-3 w-3 text-muted-foreground" />
                  {grantee}
                  <span className="text-xs text-muted-foreground">({count})</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Research() {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data: timeline, isLoading } = useQuery({
    queryKey: ["researchTimeline"],
    queryFn: getResearchTimeline,
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
            Track progress across research projects and grantees
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setShowImport(!showImport)}
          data-testid="button-toggle-import"
        >
          <Upload className="h-4 w-4 mr-2" />
          Import Notes
        </Button>
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

      <ResearchTimelineChart timeline={timeline || []} />
    </div>
  );
}
