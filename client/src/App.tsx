import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import Research from "@/pages/Research";
import Milestones from "@/pages/Milestones";
import MilestoneSubmit from "@/pages/MilestoneSubmit";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import LoginDenied from "@/pages/LoginDenied";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RefreshCw } from "lucide-react";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/repos" component={Home} />
        <Route path="/slackbot" component={Home} />
        <Route path="/research" component={Research} />
        <Route path="/milestones" component={Milestones} />
        <Route path="/submit-milestone/:milestoneId" component={MilestoneSubmit} />
        <Route path="/admin" component={Admin} />
        <Route path="/settings" component={Settings} />
        
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AuthenticatedApp() {
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/user");
      if (res.ok) {
        setAuthState("authenticated");
      } else if (res.status === 401) {
        setAuthState("unauthenticated");
      } else {
        setAuthState("authenticated");
      }
    } catch {
      setAuthState("authenticated");
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onLogin={() => setAuthState("authenticated")} />;
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/login-denied" component={LoginDenied} />
          <Route>
            <AuthenticatedApp />
          </Route>
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
