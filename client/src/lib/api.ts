// API client functions

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string;
  stars: number;
  forks: number;
  isActive: boolean;
  activity?: { date: string; count: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSettings {
  id: string;
  slackWebhookUrl: string | null;
  slackBotToken: string | null;
  slackChannel: string;
  githubToken: string | null;
  enableRealtimeAlerts: boolean;
  enableDailySummary: boolean;
  dailySummaryTime: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  repositoryId: string;
  eventType: string;
  author: string;
  message: string;
  url: string | null;
  metadata: any;
  createdAt: string;
}

export interface SlackMessage {
  id: string;
  user: string;
  message: string;
  isBot: boolean;
  channel: string;
  timestamp: string;
}

// Settings
export async function getSettings(): Promise<IntegrationSettings | null> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(settings: Partial<IntegrationSettings>): Promise<IntegrationSettings> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

// Repositories
export async function getRepositories(): Promise<Repository[]> {
  const res = await fetch("/api/repositories");
  if (!res.ok) throw new Error("Failed to fetch repositories");
  return res.json();
}

export async function addRepository(repo: { fullName: string; owner: string; name: string }): Promise<Repository> {
  const res = await fetch("/api/repositories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(repo),
  });
  if (!res.ok) throw new Error("Failed to add repository");
  return res.json();
}

export async function syncRepository(fullName: string): Promise<Repository> {
  const res = await fetch(`/api/repositories/sync/${encodeURIComponent(fullName)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to sync repository");
  return res.json();
}

export async function deleteRepository(id: string): Promise<void> {
  const res = await fetch(`/api/repositories/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete repository");
}

// Activity
export async function getActivity(days: number = 30): Promise<ActivityLog[]> {
  const res = await fetch(`/api/activity?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

export async function getRepositoryActivity(id: string, days: number = 30): Promise<ActivityLog[]> {
  const res = await fetch(`/api/activity/repository/${id}?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch repository activity");
  return res.json();
}

// Slack Messages
export async function getSlackMessages(limit: number = 50): Promise<SlackMessage[]> {
  const res = await fetch(`/api/slack/messages?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch Slack messages");
  return res.json();
}

export async function sendSlackMessage(user: string, message: string, channel: string = "#ops"): Promise<SlackMessage> {
  const res = await fetch("/api/slack/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, message, isBot: false, channel }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

export async function sendDailySummary(): Promise<void> {
  const res = await fetch("/api/slack/send-summary", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send summary");
}
