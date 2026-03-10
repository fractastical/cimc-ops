import { Rocket, Lock, FileText } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <iframe
        src="/viz/research?theme=crimson&embed=true"
        className="absolute inset-0 w-full h-full border-0"
        style={{ pointerEvents: "auto" }}
        tabIndex={-1}
        data-testid="viz-landing-background"
      />

      <header className="relative z-10 border-b border-border/20 bg-background/40 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="font-mono text-lg font-bold">
              CIMC<span className="text-primary">.AI</span>
            </span>
            <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Research Operations</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/apply"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-apply"
            >
              <FileText className="h-4 w-4" />
              Apply for Grant
            </a>
            <a
              href="/login"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-login"
            >
              <Lock className="h-4 w-4" />
              Admin
            </a>
          </div>
        </div>
      </header>
    </div>
  );
}
