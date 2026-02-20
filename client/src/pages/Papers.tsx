import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPapersWithCollaborators,
  syncPapers,
  getCollaborators,
  searchOpenAlexAuthors,
  createCollaborator,
  linkPaperCollaborator,
  unlinkPaperCollaborator,
  type PaperStage,
  type PaperWithCollaborators,
  type Collaborator,
  type OpenAlexAuthor,
} from "@/lib/api";
import { toast } from "sonner";
import { FileText, RefreshCw, ChevronDown, ChevronRight, Users, User, X, Plus, Search, Award, ArrowUpDown, ExternalLink } from "lucide-react";

function CollaboratorSearchModal({
  paperId,
  paperTitle,
  existingCollaborators,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  existingCollaborators: Collaborator[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<OpenAlexAuthor[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data: allCollaborators = [] } = useQuery({
    queryKey: ["collaborators"],
    queryFn: getCollaborators,
  });

  const existingIds = new Set(existingCollaborators.map(c => c.id));

  const searchMutation = useMutation({
    mutationFn: (name: string) => searchOpenAlexAuthors(name),
    onSuccess: (results) => {
      setSearchResults(results);
      setIsSearching(false);
    },
    onError: () => {
      toast.error("Search failed");
      setIsSearching(false);
    },
  });

  const addFromOpenAlexMutation = useMutation({
    mutationFn: async (author: OpenAlexAuthor) => {
      const collaborator = await createCollaborator({
        name: author.display_name,
        openalexId: author.id,
        hIndex: author.summary_stats?.h_index,
        citationCount: author.cited_by_count,
        worksCount: author.works_count,
        institution: author.last_known_institutions?.[0]?.display_name,
        orcid: author.orcid,
      });
      await linkPaperCollaborator(paperId, collaborator.id);
      return collaborator;
    },
    onSuccess: () => {
      toast.success("Collaborator added");
      queryClient.invalidateQueries({ queryKey: ["papersWithCollaborators"] });
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
    },
    onError: () => {
      toast.error("Failed to add collaborator");
    },
  });

  const linkMutation = useMutation({
    mutationFn: (collaboratorId: string) => linkPaperCollaborator(paperId, collaboratorId),
    onSuccess: () => {
      toast.success("Collaborator linked");
      queryClient.invalidateQueries({ queryKey: ["papersWithCollaborators"] });
    },
    onError: () => {
      toast.error("Failed to link collaborator");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (collaboratorId: string) => unlinkPaperCollaborator(paperId, collaboratorId),
    onSuccess: () => {
      toast.success("Collaborator removed");
      queryClient.invalidateQueries({ queryKey: ["papersWithCollaborators"] });
    },
    onError: () => {
      toast.error("Failed to remove collaborator");
    },
  });

  const handleSearch = () => {
    if (searchTerm.trim()) {
      setIsSearching(true);
      searchMutation.mutate(searchTerm.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-mono font-semibold text-sm">Collaborators for {paperTitle}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Search OpenAlex by author name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="font-mono text-sm"
              data-testid="input-search-collaborators"
            />
            <Button onClick={handleSearch} disabled={isSearching || !searchTerm.trim()} size="sm">
              <Search className={`h-4 w-4 ${isSearching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {existingCollaborators.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Current Collaborators</h4>
              <div className="space-y-2">
                {existingCollaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{collab.name}</span>
                      {collab.hIndex && (
                        <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Award className="h-3 w-3 mr-1" />
                          h-index: {collab.hIndex}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMutation.mutate(collab.id)}
                      disabled={unlinkMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allCollaborators.filter(c => !existingIds.has(c.id)).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Saved Collaborators</h4>
              <div className="space-y-1">
                {allCollaborators.filter(c => !existingIds.has(c.id)).map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-muted/10 cursor-pointer"
                    onClick={() => linkMutation.mutate(collab.id)}
                    data-testid={`collaborator-link-${collab.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{collab.name}</span>
                      {collab.hIndex && (
                        <Badge variant="outline" className="text-xs">
                          h: {collab.hIndex}
                        </Badge>
                      )}
                    </div>
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">OpenAlex Results</h4>
              <div className="space-y-1">
                {searchResults.map((author) => (
                  <div
                    key={author.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-muted/10 cursor-pointer"
                    onClick={() => addFromOpenAlexMutation.mutate(author)}
                    data-testid={`openalex-author-${author.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{author.display_name}</span>
                        {author.summary_stats?.h_index && (
                          <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                            h: {author.summary_stats.h_index}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {author.last_known_institutions?.[0]?.display_name || "No institution"}
                        {" · "}{author.works_count} works · {author.cited_by_count} citations
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && !isSearching && searchTerm && searchMutation.isSuccess && (
            <p className="text-sm text-muted-foreground text-center py-4">No authors found</p>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end">
          <Button onClick={onClose} data-testid="button-close-collaborator-modal">Done</Button>
        </div>
      </div>
    </div>
  );
}

function getStageProgress(stage: PaperStage | undefined): { completed: number; total: number; percent: number } {
  if (!stage) return { completed: 0, total: 0, percent: 0 };
  const factorEntries = stage.factors ? Object.entries(stage.factors) : [];
  
  const relevantFactors = factorEntries.filter(([key]) => key !== "next_deadline_recorded");
  const total = relevantFactors.length;
  
  let totalProgress = 0;
  for (const [, factor] of relevantFactors) {
    const target = factor.target || 1;
    const current = factor.current || 0;
    const factorProgress = Math.min(current / target, 1);
    totalProgress += factorProgress;
  }
  
  const completedCount = relevantFactors.filter(([, f]) => f.current >= (f.target || 0)).length;
  const percent = total > 0 ? Math.round((totalProgress / total) * 100) : 0;
  
  return { completed: completedCount, total, percent };
}

function PapersPipelineSection() {
  const queryClient = useQueryClient();
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null);
  const [sortByHIndex, setSortByHIndex] = useState(false);
  const [collaboratorModalPaper, setCollaboratorModalPaper] = useState<PaperWithCollaborators | null>(null);
  
  const { data: papers = [], isLoading, error } = useQuery({
    queryKey: ["papersWithCollaborators"],
    queryFn: getPapersWithCollaborators,
    retry: 1,
  });

  const syncMutation = useMutation({
    mutationFn: syncPapers,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["papersWithCollaborators"] });
      toast.success(`Synced ${result.synced} new, updated ${result.updated} papers`);
    },
    onError: () => {
      toast.error("Failed to sync papers");
    },
  });

  const getPaperCompletion = (paper: PaperWithCollaborators) => {
    const currentStage = paper.currentStage as "before" | "mid" | "after";
    const stageData = paper.stages?.[currentStage];
    const progress = getStageProgress(stageData);
    return progress.percent;
  };

  const sortedPapers = [...papers].sort((a, b) => {
    if (sortByHIndex) {
      return (b.maxHIndex || 0) - (a.maxHIndex || 0);
    }
    return getPaperCompletion(b) - getPaperCompletion(a);
  });

  const stageEmoji = { before: "📝", mid: "🔄", after: "✅" };
  const stageNames = { before: "Draft", mid: "Review", after: "Published" };
  const stageColors = { before: "text-yellow-400", mid: "text-blue-400", after: "text-green-400" };

  if (isLoading) {
    return (
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            Papers Pipeline
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

  if (error) {
    return (
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            Papers Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-6">
            Could not load papers. Click Sync to fetch from GitHub.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync from GitHub
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stageGroups = {
    before: papers.filter(p => p.currentStage === "before"),
    mid: papers.filter(p => p.currentStage === "mid"),
    after: papers.filter(p => p.currentStage === "after"),
  };

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-mono text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-400" />
          Papers Pipeline
          <Badge variant="outline" className="ml-2 text-xs font-normal">
            {papers.length} papers
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant={sortByHIndex ? "default" : "outline"}
            size="sm"
            onClick={() => setSortByHIndex(!sortByHIndex)}
            data-testid="button-sort-hindex"
            title="Sort by highest h-index"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            <Award className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-papers"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {papers.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm mb-4">
              No papers found. Sync from cimcai/paper-pipeline to get started.
            </p>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync from GitHub
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {(["before", "mid", "after"] as const).map((stage, index) => (
                <div key={stage} className="p-3 rounded-lg bg-muted/30 border border-border/50 relative">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{stageEmoji[stage]}</span>
                    <span className={`text-sm font-medium ${stageColors[stage]}`}>{stageNames[stage]}</span>
                  </div>
                  <div className="text-2xl font-bold">{stageGroups[stage].length}</div>
                  {index < 2 && (
                    <div className="absolute right-0 top-1/2 w-3 h-px bg-border/50 translate-x-full" />
                  )}
                </div>
              ))}
            </div>

            <div className="h-px bg-border/30" />

            <div className="space-y-2 divide-y divide-border/20">
              {sortedPapers.map((paper) => {
                const currentStage = paper.currentStage as "before" | "mid" | "after";
                const stageData = paper.stages?.[currentStage];
                const progress = getStageProgress(stageData);
                const isExpanded = expandedPaper === paper.paperId;

                return (
                  <div
                    key={paper.paperId}
                    data-testid={`card-paper-${paper.paperId}`}
                    className="py-3 first:pt-0 last:pb-0 hover:bg-muted/10 transition-colors -mx-1 px-1 rounded"
                  >
                    <div 
                      className="flex items-start justify-between cursor-pointer"
                      onClick={() => setExpandedPaper(isExpanded ? null : paper.paperId)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{stageEmoji[currentStage]}</span>
                          <h4 className="text-sm font-medium text-foreground truncate">
                            {paper.title}
                          </h4>
                          {paper.maxHIndex && (
                            <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0">
                              <Award className="h-3 w-3 mr-1" />
                              h: {paper.maxHIndex}
                            </Badge>
                          )}
                        </div>
                        
                        {paper.collaborators && paper.collaborators.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {paper.collaborators.slice(0, 3).map((collab) => (
                              <Badge 
                                key={collab.id} 
                                variant="outline" 
                                className="text-xs bg-muted/30"
                                title={`h-index: ${collab.hIndex || 'N/A'}`}
                              >
                                <User className="h-3 w-3 mr-1" />
                                {collab.name.split(' ').pop()}
                              </Badge>
                            ))}
                            {paper.collaborators.length > 3 && (
                              <Badge variant="outline" className="text-xs bg-muted/30">
                                +{paper.collaborators.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all bg-primary/80"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono w-16 text-right">
                            {progress.percent}% ({progress.completed}/{progress.total})
                          </span>
                        </div>
                      </div>
                      
                      <div className="ml-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && stageData && (
                      <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                        <div className="text-xs text-muted-foreground">
                          Stage: <span className={stageColors[currentStage]}>{stageData.stage_name || stageNames[currentStage]}</span>
                        </div>
                        
                        {stageData.factors && Object.entries(stageData.factors).map(([key, factor]) => {
                          const factorPercent = factor.target > 0 ? Math.round((factor.current / factor.target) * 100) : 0;
                          const isComplete = factor.current >= factor.target;
                          const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className={`text-xs ${isComplete ? 'text-green-400' : 'text-muted-foreground'}`}>
                                {isComplete ? '✓' : '○'}
                              </span>
                              <span className="text-xs flex-1 truncate" title={displayName}>
                                {displayName}
                              </span>
                              <div className="w-20 h-1 bg-muted/30 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${isComplete ? 'bg-primary' : 'bg-primary/60'}`}
                                  style={{ width: `${Math.min(factorPercent, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                                {factor.current}/{factor.target}
                              </span>
                            </div>
                          );
                        })}

                        {paper.latexFile && (
                          <div className="text-xs text-muted-foreground mt-2">
                            File: <code className="bg-muted/50 px-1 rounded">{paper.latexFile}</code>
                          </div>
                        )}

                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCollaboratorModalPaper(paper);
                            }}
                            data-testid={`button-manage-collaborators-${paper.paperId}`}
                          >
                            <Users className="h-3 w-3 mr-1" />
                            Manage Collaborators
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {collaboratorModalPaper && (
          <CollaboratorSearchModal
            paperId={collaboratorModalPaper.id}
            paperTitle={collaboratorModalPaper.title}
            existingCollaborators={collaboratorModalPaper.collaborators || []}
            onClose={() => setCollaboratorModalPaper(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function Papers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold glow-text" data-testid="text-papers-title">Papers Pipeline</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-papers-subtitle">
          Track paper progress, collaborators, and publication pipeline
        </p>
      </div>
      <PapersPipelineSection />
    </div>
  );
}
