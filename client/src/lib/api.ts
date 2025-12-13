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
  githubOrganization: string | null;
  enableRealtimeAlerts: boolean;
  enableDailySummary: boolean;
  dailySummaryTime: string;
  enableWeeklySummary: boolean;
  weeklySummaryDay: string;
  weeklySummaryTime: string;
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

export async function syncOrganization(org: string): Promise<{ added: number; updated: number }> {
  const res = await fetch(`/api/repositories/sync-org/${encodeURIComponent(org)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to sync organization");
  return res.json();
}

export async function addRepositoryByName(fullName: string): Promise<Repository> {
  const res = await fetch(`/api/repositories/add/${encodeURIComponent(fullName)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to add repository");
  }
  return res.json();
}

// Activity
export interface MonthlyActivityStats {
  month: string;
  commits: number;
}

export async function getMonthlyActivity(): Promise<MonthlyActivityStats[]> {
  const res = await fetch("/api/activity/monthly");
  if (!res.ok) throw new Error("Failed to fetch monthly activity");
  return res.json();
}

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
  const res = await fetch("/api/slack/send-daily-summary", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send summary");
}

export async function sendWeeklySummary(): Promise<void> {
  const res = await fetch("/api/slack/send-weekly-summary", {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send summary");
}

export type TimeFrame = "daily" | "weekly" | "monthly" | "quarterly";

export async function sendRepoSummary(timeframe: TimeFrame): Promise<void> {
  const res = await fetch(`/api/slack/send-repo-summary/${timeframe}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send summary");
}

export async function sendResearchSummary(timeframe: TimeFrame): Promise<void> {
  const res = await fetch(`/api/slack/send-research-summary/${timeframe}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to send summary");
}

// Research Projects
export interface ResearchProject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
}

export interface ResearchUpdate {
  id: string;
  projectId: string;
  date: string;
  description: string;
  grantee: string | null;
  createdAt: string;
}

export interface ResearchTimeline {
  project: ResearchProject;
  updates: ResearchUpdate[];
}

export async function getResearchProjects(): Promise<ResearchProject[]> {
  const res = await fetch("/api/research/projects");
  if (!res.ok) throw new Error("Failed to fetch research projects");
  return res.json();
}

export async function getResearchUpdates(): Promise<ResearchUpdate[]> {
  const res = await fetch("/api/research/updates");
  if (!res.ok) throw new Error("Failed to fetch research updates");
  return res.json();
}

export async function getResearchTimeline(): Promise<ResearchTimeline[]> {
  const res = await fetch("/api/research/timeline");
  if (!res.ok) throw new Error("Failed to fetch research timeline");
  return res.json();
}

export async function importResearchNotes(notes: { project: string; date: string; description: string }[]): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/research/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notes),
  });
  if (!res.ok) throw new Error("Failed to import research notes");
  return res.json();
}

export async function deleteResearchProject(id: string): Promise<void> {
  const res = await fetch(`/api/research/projects/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete project");
}

// Hypotheses
export interface Hypothesis {
  id: string;
  filename: string;
  title: string;
  content: string;
  summary: string | null;
  status: string;
  sha: string | null;
  syncedAt: string;
  createdAt: string;
}

export interface ProjectHypothesisLink {
  id: string;
  projectId: string;
  hypothesisId: string;
  relationship: string;
  createdAt: string;
  hypothesis?: Hypothesis;
  project?: ResearchProject;
}

export async function getHypotheses(): Promise<Hypothesis[]> {
  const res = await fetch("/api/hypotheses");
  if (!res.ok) throw new Error("Failed to fetch hypotheses");
  return res.json();
}

export interface HypothesisActivity {
  hypothesis: Hypothesis;
  totalUpdates: number;
  lastActivityDate: string | null;
  linkedProjects: Array<{ id: string; name: string; color: string | null; updateCount: number }>;
}

export async function getHypothesisActivity(): Promise<HypothesisActivity[]> {
  const res = await fetch("/api/hypotheses/activity");
  if (!res.ok) throw new Error("Failed to fetch hypothesis activity");
  return res.json();
}

export interface HypothesisActivityTimeline {
  hypothesisId: string;
  hypothesisTitle: string;
  data: Array<{ week: string; count: number }>;
}

export async function getHypothesisActivityTimeline(): Promise<HypothesisActivityTimeline[]> {
  const res = await fetch("/api/hypotheses/activity/timeline");
  if (!res.ok) throw new Error("Failed to fetch hypothesis activity timeline");
  return res.json();
}

export async function getHypothesis(id: string): Promise<Hypothesis> {
  const res = await fetch(`/api/hypotheses/${id}`);
  if (!res.ok) throw new Error("Failed to fetch hypothesis");
  return res.json();
}

export async function syncHypotheses(owner: string, repo: string, path?: string): Promise<{ synced: number; updated: number; errors: string[] }> {
  const res = await fetch("/api/hypotheses/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, path }),
  });
  if (!res.ok) throw new Error("Failed to sync hypotheses");
  return res.json();
}

export async function createHypothesis(title: string, content: string, pushToGitHub: boolean = true): Promise<Hypothesis> {
  const res = await fetch("/api/hypotheses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, pushToGitHub }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create hypothesis");
  }
  return res.json();
}

export async function updateHypothesisStatus(id: string, status: string): Promise<Hypothesis> {
  const res = await fetch(`/api/hypotheses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update hypothesis");
  return res.json();
}

export async function deleteHypothesis(id: string): Promise<void> {
  const res = await fetch(`/api/hypotheses/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete hypothesis");
}

export async function getProjectHypotheses(projectId: string): Promise<ProjectHypothesisLink[]> {
  const res = await fetch(`/api/research/projects/${projectId}/hypotheses`);
  if (!res.ok) throw new Error("Failed to fetch project hypotheses");
  return res.json();
}

export async function linkProjectToHypothesis(projectId: string, hypothesisId: string, relationship: string = "tests"): Promise<ProjectHypothesisLink> {
  const res = await fetch(`/api/research/projects/${projectId}/hypotheses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesisId, relationship }),
  });
  if (!res.ok) throw new Error("Failed to link project to hypothesis");
  return res.json();
}

export async function unlinkProjectFromHypothesis(projectId: string, hypothesisId: string): Promise<void> {
  const res = await fetch(`/api/research/projects/${projectId}/hypotheses/${hypothesisId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to unlink project from hypothesis");
}

// Papers
export interface PaperFactor {
  current: number;
  target: number;
  partner_list?: string[];
  venue_name?: string | null;
}

export interface PaperStage {
  stage_name: string;
  completed: boolean;
  factors: Record<string, PaperFactor>;
}

export interface PaperStages {
  before?: PaperStage;
  mid?: PaperStage;
  after?: PaperStage;
}

export interface Paper {
  id: string;
  paperId: string;
  latexFile?: string;
  title: string;
  currentStage: string;
  stages: PaperStages;
  lastUpdated?: string;
  syncedAt?: string;
}

export async function getPapers(): Promise<Paper[]> {
  const res = await fetch("/api/papers");
  if (!res.ok) throw new Error("Failed to fetch papers");
  return res.json();
}

export async function syncPapers(): Promise<{ synced: number; updated: number; errors: string[] }> {
  const res = await fetch("/api/papers/sync", { method: "POST" });
  if (!res.ok) throw new Error("Failed to sync papers");
  return res.json();
}
