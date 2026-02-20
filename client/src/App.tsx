import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
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
import Papers from "@/pages/Papers";
import Grants from "@/pages/Grants";
import Login from "@/pages/Login";
import LoginDenied from "@/pages/LoginDenied";
import Landing from "@/pages/Landing";
import VizGithub from "@/pages/VizGithub";
import VizResearch from "@/pages/VizResearch";
import VizComms from "@/pages/VizComms";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RefreshCw } from "lucide-react";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/repos" component={Home} />
        <Route path="/slackbot" component={Home} />
        <Route path="/research" component={Research} />
        <Route path="/papers" component={Papers} />
        <Route path="/milestones" component={Milestones} />
        <Route path="/grants" component={Grants} />
        <Route path="/admin" component={Admin} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AuthenticatedApp() {
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [, setLocation] = useLocation();

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
    return <Login onLogin={() => {
      setAuthState("authenticated");
      setLocation("/dashboard");
    }} />;
  }

  return <DashboardRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={() => <AuthenticatedApp />} />
          <Route path="/login-denied" component={LoginDenied} />
          <Route path="/submit-milestone/:milestoneId/:leadId?" component={MilestoneSubmit} />
          <Route path="/viz/github" component={VizGithub} />
          <Route path="/viz/research" component={VizResearch} />
          <Route path="/viz/comms" component={VizComms} />
          <Route path="/dashboard">
            <AuthenticatedApp />
          </Route>
          <Route path="/repos">
            <AuthenticatedApp />
          </Route>
          <Route path="/slackbot">
            <AuthenticatedApp />
          </Route>
          <Route path="/research">
            <AuthenticatedApp />
          </Route>
          <Route path="/papers">
            <AuthenticatedApp />
          </Route>
          <Route path="/milestones">
            <AuthenticatedApp />
          </Route>
          <Route path="/grants">
            <AuthenticatedApp />
          </Route>
          <Route path="/admin">
            <AuthenticatedApp />
          </Route>
          <Route path="/settings">
            <AuthenticatedApp />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
