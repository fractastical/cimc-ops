import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sparkles
} from "lucide-react";
import { getAdminActions, getCurrentUser, logout, type AdminActionLog, type AuthUser } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

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
          <p className="text-sm text-muted-foreground">User info and activity log</p>
        </div>
      </div>

      <Card className="glass-panel border-primary/20" data-testid="card-visualizations">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-mono text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Embeddable Visualizations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="/viz/tagcloud"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="link-viz-tagcloud"
            >
              <div className="w-10 h-10 rounded bg-black border border-white/20 flex items-center justify-center text-white text-xs font-mono shrink-0">
                W
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Research Tag Cloud
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Animated wave visualization from meeting transcripts
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
                    <span className="font-mono text-xs">{user.id.substring(0, 12)}...</span>
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
                        <span className="font-mono text-xs">{action.actorEmail || action.actorUserId.substring(0, 12)}</span>
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
