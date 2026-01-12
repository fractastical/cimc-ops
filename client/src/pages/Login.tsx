import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
      
      <Card className="w-full max-w-md glass-panel border-primary/20 relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/30">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            <span className="font-mono">CIMC</span>
            <span className="text-primary">.AI</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground font-mono">
            Mission Control Access Required
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <Button 
            onClick={handleLogin}
            className="w-full"
            data-testid="button-login"
          >
            Sign in with Replit
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Authenticate using your Replit, Google, or GitHub account
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
