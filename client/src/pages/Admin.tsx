import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  LogOut, 
  Activity, 
  Clock, 
  FileText, 
  Database,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Cloud,
  Upload,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  CheckCircle2
} from "lucide-react";
import { getAdminActions, getCurrentUser, logout, type AdminActionLog, type AuthUser } from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  imported: boolean;
}

interface GdriveSettings {
  folders: DriveFolder[];
  autoSync: boolean;
  lastSyncAt: string | null;
}

function GoogleDriveImportPanel() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ importing: boolean; message: string; current: number; total: number; updatesCreated: number } | null>(null);

  const { data: settings } = useQuery<GdriveSettings>({
    queryKey: ["gdriveSettings"],
    queryFn: () => fetch("/api/gdrive/settings").then(r => r.json()),
  });

  const { data: searchResults = [], isLoading: searching } = useQuery<DriveFolder[]>({
    queryKey: ["gdriveFolderSearch", searchQuery],
    queryFn: () => fetch(`/api/gdrive/folders?search=${encodeURIComponent(searchQuery)}`).then(r => r.json()),
    enabled: showSearch && searchQuery.length >= 2,
  });

  const activeFolder = expandedFolder || (settings?.folders?.length === 1 ? settings.folders[0].id : null);

  const { data: files = [], isLoading: filesLoading } = useQuery<DriveFile[]>({
    queryKey: ["gdriveFiles", activeFolder],
    queryFn: () => fetch(`/api/gdrive/files?folderId=${activeFolder}`).then(r => r.json()),
    enabled: !!activeFolder,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (body: { folders: DriveFolder[]; autoSync?: boolean }) =>
      fetch("/api/gdrive/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdriveSettings"] });
      queryClient.invalidateQueries({ queryKey: ["gdriveFiles"] });
    },
  });

  const toggleAutoSync = useMutation({
    mutationFn: (autoSync: boolean) =>
      fetch("/api/gdrive/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folders: settings?.folders || [], autoSync }) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdriveSettings"] });
    },
  });

  const startImport = async (body: { fileIds?: string[]; folderIds?: string[] }) => {
    if (importProgress?.importing) return;
    setImportProgress({ importing: true, message: "Starting import...", current: 0, total: 0, updatesCreated: 0 });

    try {
      const response = await fetch("/api/gdrive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Import request failed" }));
        toast.error(errData.error || "Import request failed");
        setImportProgress(null);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "progress") {
              setImportProgress(prev => ({ ...prev!, message: event.message, current: event.current, total: event.total }));
            } else if (event.type === "file_done") {
              setImportProgress(prev => ({ ...prev!, updatesCreated: prev!.updatesCreated + (event.updates || 0) }));
            } else if (event.type === "file_error") {
              toast.error(`Error processing: ${event.fileName}`);
            } else if (event.type === "status") {
              setImportProgress(prev => ({ ...prev!, message: event.message, total: event.total || prev!.total }));
            } else if (event.type === "done") {
              gotDone = true;
              toast.success(event.message);
              setImportProgress(null);
              setSelectedFileIds(new Set());
              queryClient.invalidateQueries({ queryKey: ["gdriveFiles"] });
              queryClient.invalidateQueries({ queryKey: ["researchTimeline"] });
              queryClient.invalidateQueries({ queryKey: ["gdriveSettings"] });
            } else if (event.type === "error") {
              gotDone = true;
              toast.error(event.error || "Import failed");
              setImportProgress(null);
            }
          } catch {}
        }
      }
      if (!gotDone) {
        setImportProgress(null);
      }
    } catch (err) {
      toast.error("Failed to import from Google Drive");
      setImportProgress(null);
    }
  };

  const addFolder = (folder: DriveFolder) => {
    const current = settings?.folders || [];
    if (current.some(f => f.id === folder.id)) {
      toast.info("Folder already added");
      return;
    }
    const updated = [...current, folder];
    saveSettingsMutation.mutate({ folders: updated, autoSync: settings?.autoSync });
    setShowSearch(false);
    setSearchQuery("");
    toast.success(`Added "${folder.name}"`);
  };

  const removeFolder = (folderId: string) => {
    const updated = (settings?.folders || []).filter(f => f.id !== folderId);
    saveSettingsMutation.mutate({ folders: updated, autoSync: settings?.autoSync });
    if (expandedFolder === folderId) setExpandedFolder(null);
  };

  const toggleFile = (fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const hasFolders = (settings?.folders?.length || 0) > 0;
  const newFiles = files.filter(f => !f.imported);
  const importedFiles = files.filter(f => f.imported);

  return (
    <Card className="glass-panel border-primary/20" data-testid="card-gdrive-import">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-lg flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Google Drive Transcript Import
          </CardTitle>
          <div className="flex items-center gap-3">
            {hasFolders && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Switch
                  checked={settings?.autoSync || false}
                  onCheckedChange={(checked) => toggleAutoSync.mutate(checked)}
                  data-testid="switch-auto-sync"
                />
                Auto-sync
              </label>
            )}
            {hasFolders && (
              <Button
                size="sm"
                onClick={() => startImport({ folderIds: settings!.folders.map(f => f.id) })}
                disabled={!!importProgress?.importing}
                data-testid="button-import-all-drive"
              >
                {importProgress?.importing ? (
                  <><RefreshCw className="h-3 w-3 animate-spin mr-1" /> Importing...</>
                ) : (
                  <><Upload className="h-3 w-3 mr-1" /> Import All New</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {importProgress?.importing && (
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-primary/20" data-testid="import-progress">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="font-mono text-xs flex-1 truncate">{importProgress.message}</span>
              {importProgress.updatesCreated > 0 && (
                <Badge variant="secondary" className="text-xs">{importProgress.updatesCreated} updates</Badge>
              )}
            </div>
            {importProgress.total > 0 && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {hasFolders && (
          <div className="space-y-1">
            {settings!.folders.map(folder => (
              <div key={folder.id} className="space-y-1">
                <div
                  className={`flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/30 cursor-pointer group ${expandedFolder === folder.id ? "bg-muted/20" : ""}`}
                  data-testid={`folder-monitored-${folder.id}`}
                >
                  <button
                    className="flex items-center gap-2 text-sm flex-1 text-left"
                    onClick={() => setExpandedFolder(expandedFolder === folder.id ? null : folder.id)}
                  >
                    {expandedFolder === folder.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <FolderOpen className="h-4 w-4 text-yellow-500" />
                    <span className="font-mono">{folder.name}</span>
                  </button>
                  <button
                    onClick={() => removeFolder(folder.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-folder-${folder.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {expandedFolder === folder.id && (
                  <div className="ml-6 space-y-1">
                    {filesLoading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Loading files...
                      </div>
                    ) : (
                      <>
                        {newFiles.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{newFiles.length} new file{newFiles.length !== 1 ? "s" : ""}</span>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs"
                                  onClick={() => {
                                    if (selectedFileIds.size === newFiles.length) setSelectedFileIds(new Set());
                                    else setSelectedFileIds(new Set(newFiles.map(f => f.id)));
                                  }}
                                  data-testid="button-select-all-files"
                                >
                                  {selectedFileIds.size === newFiles.length ? "Deselect" : "Select All"}
                                </Button>
                                {selectedFileIds.size > 0 && (
                                  <Button
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => startImport({ fileIds: Array.from(selectedFileIds), folderIds: [folder.id] })}
                                    disabled={!!importProgress?.importing}
                                    data-testid="button-import-selected"
                                  >
                                    Import ({selectedFileIds.size})
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-0.5 max-h-40 overflow-y-auto">
                              {newFiles.map(file => (
                                <label
                                  key={file.id}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-muted/20 rounded cursor-pointer text-xs"
                                  data-testid={`file-new-${file.id}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedFileIds.has(file.id)}
                                    onChange={() => toggleFile(file.id)}
                                    className="rounded border-border"
                                  />
                                  <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="flex-1 truncate">{file.name}</span>
                                  <span className="text-muted-foreground/60 flex-shrink-0">
                                    {format(new Date(file.modifiedTime), "MMM d")}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {newFiles.length === 0 && importedFiles.length > 0 && (
                          <div className="flex items-center gap-1 py-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                            All {importedFiles.length} files imported
                          </div>
                        )}
                        {importedFiles.length > 0 && newFiles.length > 0 && (
                          <div className="text-xs text-muted-foreground/60">
                            + {importedFiles.length} already imported
                          </div>
                        )}
                        {files.length === 0 && (
                          <p className="text-xs text-muted-foreground py-1">No files in this folder</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {settings?.lastSyncAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last sync: {format(new Date(settings.lastSyncAt), "MMM d, h:mm a")}
          </div>
        )}

        {!showSearch ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSearch(true)}
            data-testid="button-add-folder"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
        ) : (
          <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-background/50">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search for a folder name (e.g. CIMC)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                data-testid="input-folder-search"
              />
              <Button size="sm" variant="ghost" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {searching ? (
              <div className="flex items-center gap-2 py-2 justify-center text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : searchQuery.length >= 2 && searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No folders found</p>
            ) : (
              <div className="grid gap-1 max-h-48 overflow-y-auto">
                {searchResults.map(folder => {
                  const alreadyAdded = settings?.folders?.some(f => f.id === folder.id);
                  return (
                    <div key={folder.id} className="flex items-center justify-between hover:bg-muted/30 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <FolderOpen className="h-4 w-4 text-yellow-500" />
                        {folder.name}
                      </div>
                      {alreadyAdded ? (
                        <Badge variant="secondary" className="text-xs">Added</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7"
                          onClick={() => addFolder(folder)}
                          data-testid={`button-add-folder-${folder.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading: userLoading } = useQuery<AuthUser | null>({
    queryKey: ["currentUser"],
    queryFn: getCurrentUser,
  });

  const { data: actions, isLoading: actionsLoading, refetch } = useQuery<AdminActionLog[]>({
    queryKey: ["adminActions"],
    queryFn: () => getAdminActions(50),
  });

  const handleLogout = async () => {
    try {
      await logout();
      setLocation("/");
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getActionBadgeColor = (action: string): string => {
    if (action.includes("create") || action.includes("add")) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (action.includes("delete") || action.includes("remove")) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (action.includes("update") || action.includes("edit")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-primary/20 text-primary border-primary/30";
  };

  const getEntityIcon = (entityType: string | null) => {
    switch (entityType) {
      case "milestone": return <FileText className="h-4 w-4" />;
      case "project": return <Database className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">User info, activity log, and data imports</p>
        </div>
      </div>

      <GoogleDriveImportPanel />

      <Card className="glass-panel border-primary/20" data-testid="card-visualizations">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-mono text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Embeddable Visualizations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="/viz/github"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="link-viz-github"
            >
              <div className="w-10 h-10 rounded bg-black border border-white/20 flex items-center justify-center text-white text-xs font-mono shrink-0">
                G
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  GitHub Activity
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Commits, PRs, issues over time
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </a>
            <a
              href="/viz/research"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="link-viz-research"
            >
              <div className="w-10 h-10 rounded bg-black border border-white/20 flex items-center justify-center text-white text-xs font-mono shrink-0">
                R
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Research Activity
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Meetings, milestones, submissions
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </a>
            <a
              href="/viz/comms"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="link-viz-comms"
            >
              <div className="w-10 h-10 rounded bg-black border border-white/20 flex items-center justify-center text-white text-xs font-mono shrink-0">
                C
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Communications
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Slack messages, bots, alerts
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            These pages are publicly accessible and can be embedded via iframe.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-panel border-primary/20" data-testid="card-user-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-lg">
              <User className="h-5 w-5 text-primary" />
              Current User
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {userLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : user ? (
              <>
                <div className="flex items-center gap-4">
                  {user.profileImageUrl ? (
                    <img 
                      src={user.profileImageUrl} 
                      alt="Profile" 
                      className="w-16 h-16 rounded-full border-2 border-primary/30"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-lg">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
                  </div>
                </div>
                <Separator className="bg-border/50" />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono text-xs">{(user.id || "N/A").substring(0, 12)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Role:</span>
                    <Badge variant="outline" className={user.isAdmin ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground"}>
                      {user.isAdmin ? "Admin" : "User"}
                    </Badge>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-4 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">Not logged in</p>
                <Button 
                  className="mt-4"
                  onClick={() => window.location.href = "/api/login"}
                  data-testid="button-login"
                >
                  Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/20 lg:col-span-2" data-testid="card-action-log">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-mono text-lg">
              <Activity className="h-5 w-5 text-primary" />
              Admin Activity Log
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-refresh-actions"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : actions && actions.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {actions.map((action) => (
                    <div 
                      key={action.id} 
                      className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/30 transition-colors"
                      data-testid={`action-log-${action.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getEntityIcon(action.entityType)}
                          <Badge variant="outline" className={getActionBadgeColor(action.action)}>
                            {action.action}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">By: </span>
                        <span className="font-mono text-xs">{action.actorEmail || (action.actorUserId || "unknown").substring(0, 12)}</span>
                        {action.entityType && (
                          <>
                            <span className="text-muted-foreground"> on </span>
                            <span className="text-primary">{action.entityType}</span>
                            {action.entityId && (
                              <span className="font-mono text-xs text-muted-foreground"> ({action.entityId.substring(0, 8)})</span>
                            )}
                          </>
                        )}
                      </div>
                      {action.metadata && (
                        <div className="mt-2 text-xs font-mono text-muted-foreground bg-background/50 p-2 rounded">
                          {JSON.stringify(action.metadata, null, 2).substring(0, 200)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">No admin actions recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">Actions will appear here as admins make changes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
