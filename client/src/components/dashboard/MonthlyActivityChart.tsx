import { useQuery } from "@tanstack/react-query";
import { getMonthlyActivity } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, RefreshCw } from "lucide-react";
import { format, parse } from "date-fns";

export function MonthlyActivityChart() {
  const { data: monthlyStats = [], isLoading } = useQuery({
    queryKey: ["monthlyActivity"],
    queryFn: getMonthlyActivity,
  });

  const formattedData = monthlyStats.map((stat) => {
    const date = parse(stat.month, "yyyy-MM", new Date());
    return {
      month: format(date, "MMM yy"),
      fullMonth: format(date, "MMMM yyyy"),
      commits: stat.commits,
    };
  });

  const totalCommits = monthlyStats.reduce((sum, stat) => sum + stat.commits, 0);

  if (isLoading) {
    return (
      <Card className="glass-panel border-primary/20 h-full">
        <CardContent className="flex items-center justify-center h-full">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-primary/20 h-full" data-testid="card-monthly-activity">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            All-Time Activity
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">
            {totalCommits.toLocaleString()} total commits
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {formattedData.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground font-mono text-sm">
            No activity data yet. Sync repositories to see history.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="month" 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="glass-panel border border-primary/20 p-2 rounded-md shadow-lg">
                        <p className="font-mono text-xs text-foreground">{data.fullMonth}</p>
                        <p className="font-mono text-sm text-primary font-semibold">
                          {data.commits} commits
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="commits" 
                fill="url(#greenGradient)" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
