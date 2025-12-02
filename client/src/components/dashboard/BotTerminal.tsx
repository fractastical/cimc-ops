import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Terminal } from "lucide-react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendSlackMessage } from "@/lib/api";
import type { SlackMessage } from "@/lib/api";

interface BotTerminalProps {
  messages: SlackMessage[];
}

export function BotTerminal({ messages: initialMessages }: BotTerminalProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendSlackMessage("User", message),
    onSuccess: (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
      queryClient.invalidateQueries({ queryKey: ["slackMessages"] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const tempMessage: SlackMessage = {
      id: `temp-${Date.now()}`,
      user: "User",
      message: input,
      timestamp: new Date().toISOString(),
      isBot: false,
      channel: "#ops",
    };

    setMessages((prev) => [...prev, tempMessage]);
    sendMutation.mutate(input);
    setInput("");
  };

  return (
    <Card className="glass-panel h-full flex flex-col border-primary/20 bg-background/50">
      <CardHeader className="pb-2 border-b border-border/40 bg-muted/10">
        <CardTitle className="text-sm font-medium font-mono flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span>Slack Integration // #ops-channel</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col h-[400px]">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.isBot ? "bg-muted/10 p-2 rounded-md -mx-2" : ""}`}
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarImage src={`https://api.dicebear.com/7.x/${msg.isBot ? 'bottts' : 'avataaars'}/svg?seed=${msg.user}`} />
                  <AvatarFallback>{msg.user[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-bold ${msg.isBot ? "text-primary" : "text-foreground"}`}>
                      {msg.user}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(msg.timestamp), "hh:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap font-mono leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-border/40 bg-background/40">
          <form onSubmit={handleSend} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">{">"}</span>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a command..."
                className="pl-6 bg-background/50 border-border font-mono text-sm focus-visible:ring-primary/50"
                data-testid="input-slack-message"
                disabled={sendMutation.isPending}
              />
            </div>
            <button
              type="submit"
              data-testid="button-send-message"
              className="bg-primary text-primary-foreground p-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={sendMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
