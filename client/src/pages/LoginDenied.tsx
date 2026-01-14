import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function LoginDenied() {
  const handleTryAgain = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-destructive/10" />
      
      <Card className="w-full max-w-md glass-panel border-destructive/20 relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/30">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Access Denied
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your account is not authorized to access this application.
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">Access Requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>You must have a @cimc.ai email address</li>
              <li>Sign in using your Google account linked to your CIMC email</li>
            </ul>
          </div>
          
          <Button 
            onClick={handleTryAgain}
            variant="outline"
            className="w-full"
            data-testid="button-try-again"
          >
            Try Again with Different Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
