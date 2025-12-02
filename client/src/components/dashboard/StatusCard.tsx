import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Activity, Server, Wifi } from "lucide-react";
import { motion } from "framer-motion";

const generateHeartbeat = () => {
  return Array.from({ length: 20 }, (_, i) => ({
    time: i,
    value: 50 + Math.random() * 10 - 5 + (Math.random() > 0.9 ? 30 : 0), // Base + noise + random spikes
  }));
};

export function StatusCard() {
  const [data, setData] = useState(generateHeartbeat());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const newData = [...prev.slice(1), { 
            time: prev[prev.length - 1].time + 1, 
            value: 50 + Math.random() * 10 - 5 + (Math.random() > 0.9 ? 30 : 0) 
        }];
        return newData;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="glass-panel h-full overflow-hidden border-primary/20 bg-background/50">
      <CardHeader className="pb-2 space-y-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium font-mono text-muted-foreground uppercase tracking-widest">
          System Status
        </CardTitle>
        <div className="flex items-center space-x-2">
          <motion.div 
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" 
          />
          <span className="text-xs font-bold text-primary font-mono">ONLINE</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline space-x-2 mb-4">
          <span className="text-4xl font-bold tracking-tighter text-foreground glow-text">100%</span>
          <span className="text-sm text-muted-foreground font-mono">UPTIME (30D)</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="flex items-center space-x-2 p-2 rounded bg-accent/20 border border-accent/10">
            <Server className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase">Latency</span>
                <span className="text-xs font-mono font-bold">24ms</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 p-2 rounded bg-accent/20 border border-accent/10">
            <Wifi className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase">Bandwidth</span>
                <span className="text-xs font-mono font-bold">1.2 GB/s</span>
            </div>
          </div>
        </div>

        <div className="h-[120px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis domain={[0, 100]} hide />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
