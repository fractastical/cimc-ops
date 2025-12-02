import { storage } from "../storage";

interface SlackMessagePayload {
  text: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export class SlackService {
  private webhookUrl: string | null = null;
  private botToken: string | null = null;
  private channel: string = "#ops";

  async initialize() {
    const settings = await storage.getIntegrationSettings();
    if (settings) {
      this.webhookUrl = settings.slackWebhookUrl;
      this.botToken = settings.slackBotToken;
      this.channel = settings.slackChannel || "#ops";
    }
  }

  async sendMessage(text: string, customChannel?: string): Promise<boolean> {
    await this.initialize();
    
    if (!this.webhookUrl) {
      console.warn("Slack webhook URL not configured. Message not sent:", text);
      return false;
    }

    const payload: SlackMessagePayload = {
      text,
      channel: customChannel || this.channel,
      username: "Ops Bot",
      icon_emoji: ":robot_face:",
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("Failed to send Slack message:", response.statusText);
        return false;
      }

      // Log to database
      await storage.createSlackMessage({
        user: "Ops Bot",
        message: text,
        isBot: true,
        channel: customChannel || this.channel,
      });

      return true;
    } catch (error) {
      console.error("Error sending Slack message:", error);
      return false;
    }
  }

  async sendGitHubUpdate(repoName: string, event: string, author: string, message: string, url?: string) {
    const emoji = this.getEventEmoji(event);
    const text = `${emoji} *${repoName}* - ${event}\n` +
                 `Author: ${author}\n` +
                 `${message}` +
                 (url ? `\n<${url}|View on GitHub>` : "");
    
    return await this.sendMessage(text);
  }

  async sendDailySummary(summary: {
    totalCommits: number;
    totalPRs: number;
    activeRepos: number;
    topContributor: string;
    repoActivity: Array<{ repo: string; commits: number }>;
  }) {
    const text = `:bar_chart: *Daily GitHub Activity Summary*\n\n` +
                 `• Total Commits: ${summary.totalCommits}\n` +
                 `• Pull Requests: ${summary.totalPRs}\n` +
                 `• Active Repositories: ${summary.activeRepos}\n` +
                 `• Top Contributor: ${summary.topContributor}\n\n` +
                 `*Repository Activity:*\n` +
                 summary.repoActivity
                   .map(r => `  • ${r.repo}: ${r.commits} commits`)
                   .join("\n");

    return await this.sendMessage(text);
  }

  async sendWeeklySummary(summary: {
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    activeRepos: number;
    contributors: string[];
    repoActivity: Array<{ repo: string; commits: number; prs: number }>;
    weekStart: string;
    weekEnd: string;
  }) {
    const text = `:calendar: *Weekly GitHub Activity Summary*\n` +
                 `_${summary.weekStart} - ${summary.weekEnd}_\n\n` +
                 `*Overview:*\n` +
                 `• Total Commits: ${summary.totalCommits}\n` +
                 `• Pull Requests: ${summary.totalPRs}\n` +
                 `• Issues: ${summary.totalIssues}\n` +
                 `• Active Repositories: ${summary.activeRepos}\n` +
                 `• Contributors: ${summary.contributors.length}\n\n` +
                 `*Top Contributors:*\n` +
                 summary.contributors.slice(0, 5).map((c, i) => `  ${i + 1}. ${c}`).join("\n") +
                 `\n\n*Repository Breakdown:*\n` +
                 summary.repoActivity
                   .map(r => `  • *${r.repo}*: ${r.commits} commits, ${r.prs} PRs`)
                   .join("\n");

    return await this.sendMessage(text);
  }

  private getEventEmoji(event: string): string {
    const emojiMap: Record<string, string> = {
      push: ":rocket:",
      pull_request: ":arrows_counterclockwise:",
      pull_request_merged: ":white_check_mark:",
      issues: ":bug:",
      release: ":package:",
      star: ":star:",
      fork: ":fork_and_knife:",
    };
    return emojiMap[event] || ":bell:";
  }
}

export const slackService = new SlackService();
