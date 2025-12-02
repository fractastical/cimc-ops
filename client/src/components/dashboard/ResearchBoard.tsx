import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ResearchItem } from "@/lib/mockData";
import { FlaskConical, Clock, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

interface ResearchBoardProps {
  items: ResearchItem[];
}

export function ResearchBoard({ items }: ResearchBoardProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "deployed": return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "researching": return <FlaskConical className="h-4 w-4 text-blue-400" />;
      case "prototyping": return <Loader2 className="h-4 w-4 text-amber-400 animate-spin-slow" />;
      default: return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="glass-panel h-full border-primary/20 bg-background/50">
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium font-mono text-muted-foreground uppercase tracking-widest">
          Active Research
        </CardTitle>
        <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/10">
          {items.length} Active
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex flex-col gap-3 p-3 rounded-md border border-border/40 bg-muted/5 hover:bg-muted/10 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                    </h4>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Lead: {item.assignee}
                </p>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                {item.status}
              </Badge>
            </div>
            
            <div className="pl-6 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                    <span>Progress</span>
                    <span>{item.progress}%</span>
                </div>
                <Progress value={item.progress} className="h-1.5 bg-muted/50" />
                
                <div className="flex items-center justify-between pt-1">
                    <div className="flex gap-1">
                        {item.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 text-accent-foreground border border-accent">
                                {tag}
                            </span>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        {item.deadline}
                    </div>
                </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
