import { subDays, format } from "date-fns";

// Types
export type Status = "operational" | "degraded" | "outage";
export type ProjectStatus = "researching" | "prototyping" | "development" | "review" | "deployed";

export interface RepoActivity {
  date: string;
  count: number;
}

export interface Repo {
  id: string;
  name: string;
  description: string;
  status: Status;
  language: string;
  stars: number;
  forks: number;
  activity: RepoActivity[];
  lastCommit: string;
}

export interface ResearchItem {
  id: string;
  title: string;
  assignee: string;
  status: ProjectStatus;
  progress: number;
  tags: string[];
  deadline: string;
}

export interface SlackMessage {
  id: string;
  user: string;
  avatar: string;
  message: string;
  timestamp: string;
  isBot: boolean;
  channel: string;
}

// Mock Generators

// Generate last 30 days of activity
export const generateActivityData = (days: number = 30): RepoActivity[] => {
  const data: RepoActivity[] = [];
  for (let i = days; i >= 0; i--) {
    data.push({
      date: format(subDays(new Date(), i), "yyyy-MM-dd"),
      count: Math.floor(Math.random() * 15), // 0-15 commits per day
    });
  }
  return data;
};

export const mockRepos: Repo[] = [
  {
    id: "repo-1",
    name: "neural-arch-search",
    description: "Automated architecture search for transformer models on edge devices.",
    status: "operational",
    language: "Python",
    stars: 1240,
    forks: 89,
    activity: generateActivityData(60),
    lastCommit: "10m ago",
  },
  {
    id: "repo-2",
    name: "distributed-inference-engine",
    description: "Low-latency inference across heterogeneous compute clusters.",
    status: "degraded",
    language: "Rust",
    stars: 856,
    forks: 42,
    activity: generateActivityData(60),
    lastCommit: "2h ago",
  },
  {
    id: "repo-3",
    name: "visual-cortex-mapper",
    description: "Mapping activation patterns in synthetic vision models.",
    status: "operational",
    language: "TypeScript",
    stars: 2300,
    forks: 340,
    activity: generateActivityData(60),
    lastCommit: "1d ago",
  },
  {
    id: "repo-4",
    name: "bot-slack-integration",
    description: "The core logic for the Ops bot handling alerts and status.",
    status: "operational",
    language: "Go",
    stars: 120,
    forks: 12,
    activity: generateActivityData(60),
    lastCommit: "5m ago",
  },
];

export const mockResearch: ResearchItem[] = [
  {
    id: "res-1",
    title: "Optimize Attention Mechanisms for Mobile",
    assignee: "Dr. Sarah Chen",
    status: "prototyping",
    progress: 65,
    tags: ["AI", "Optimization", "Mobile"],
    deadline: "2025-04-15",
  },
  {
    id: "res-2",
    title: "GPT-5 Behavior Analysis in Code Gen",
    assignee: "Alex Rivera",
    status: "researching",
    progress: 30,
    tags: ["LLM", "Code"],
    deadline: "2025-05-01",
  },
  {
    id: "res-3",
    title: "Automated CI/CD for ML Pipelines",
    assignee: "Ops Bot",
    status: "deployed",
    progress: 100,
    tags: ["Infrastructure", "DevOps"],
    deadline: "2025-01-20",
  },
  {
    id: "res-4",
    title: "Quantum Resistance in TLS 1.3",
    assignee: "Marcus Wei",
    status: "review",
    progress: 90,
    tags: ["Security", "Cryptography"],
    deadline: "2025-03-10",
  },
];

export const mockSlackMessages: SlackMessage[] = [
  {
    id: "msg-1",
    user: "System",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=System",
    message: "Deployment of service 'neural-arch-search' completed successfully in 45s.",
    timestamp: "10:30 AM",
    isBot: true,
    channel: "#deployments",
  },
  {
    id: "msg-2",
    user: "Sarah Chen",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    message: "@OpsBot status report on cluster-alpha?",
    timestamp: "10:32 AM",
    isBot: false,
    channel: "#ops",
  },
  {
    id: "msg-3",
    user: "Ops Bot",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=OpsBot",
    message: "Cluster-alpha is operating at 98% efficiency. No anomalies detected. 12 nodes active.",
    timestamp: "10:32 AM",
    isBot: true,
    channel: "#ops",
  },
];
