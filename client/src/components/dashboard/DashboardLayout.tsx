import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  GitGraph, 
  Bot, 
  FlaskConical, 
  Target,
  Settings, 
  SlidersHorizontal,
  Menu, 
  X,
  Bell,
  LogOut,
  Banknote,
  FileText,
  Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user");
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    retry: false,
  });

  const handleSignOut = () => {
    window.location.href = "/api/logout";
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "?";
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    return user?.email || "User";
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
    { icon: FlaskConical, label: "Research", path: "/research" },
    { icon: Lightbulb, label: "Hypotheses", path: "/hypotheses" },
    { icon: GitGraph, label: "Repos", path: "/repos" },
    { icon: FileText, label: "Papers", path: "/papers" },
    { icon: Target, label: "Milestones", path: "/milestones" },
    { icon: Banknote, label: "Grants", path: "/grants" },
    { icon: Bot, label: "Slackbot", path: "/slackbot" },
    { icon: Settings, label: "Admin", path: "/admin" },
    { icon: SlidersHorizontal, label: "Settings", path: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-background flex overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border
        transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
            <div className="h-6 w-6 bg-primary rounded-sm mr-3 shadow-[0_0_10px_hsl(var(--primary))] animate-pulse" />
            <span className="font-mono font-bold text-lg tracking-widest text-sidebar-foreground">
                CIMC<span className="text-primary">.AI</span>
            </span>
        </div>

        <div className="p-4 space-y-1">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4 px-2 mt-4">
                Main Console
            </div>
          {navItems.map((item) => (
            <Link key={item.path} href={item.path}>
              <div className={`
                flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer
                ${location === item.path 
                  ? 'bg-sidebar-accent text-primary border-l-2 border-primary pl-[10px]' 
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}
              `}>
                <item.icon className={`h-4 w-4 ${location === item.path ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </div>
            </Link>
          ))}
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-sidebar-border bg-sidebar-accent/10">
            <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 border border-primary/30">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={getDisplayName()} />
                    <AvatarFallback className="bg-primary/20 text-primary font-mono font-bold text-xs">
                        {getInitials()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium text-sidebar-foreground truncate" data-testid="user-display-name">
                        {getDisplayName()}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                        {user ? (
                            user.isAdmin ? (
                                <span className="text-primary" data-testid="admin-badge">Admin</span>
                            ) : (
                                "Member"
                            )
                        ) : (
                            <span className="animate-pulse">...</span>
                        )}
                    </span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={handleSignOut}
                    data-testid="button-sign-out"
                    title="Sign out"
                >
                    <LogOut className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                >
                    {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground font-mono">
                    <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" />
                    <span>System Operational</span>
                    <span className="mx-2 text-border">|</span>
                    <span>v2.7.0</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="text-muted-foreground relative">
                    <Bell className="h-4 w-4" />
                    <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-primary" />
                </Button>
            </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-6 md:p-8 scroll-smooth">
            {children}
        </div>
      </main>
    </div>
  );
}
