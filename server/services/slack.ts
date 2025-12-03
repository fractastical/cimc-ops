import { storage } from "../storage";
import crypto from "crypto";

interface SlackMessagePayload {
  text: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  blocks?: any[];
}

interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  event?: {
    type: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
  };
  team_id?: string;
}

interface SlackCommandPayload {
  command: string;
  text: string;
  response_url: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
}

export class SlackService {
  private webhookUrl: string | null = null;
  private botToken: string | null = null;
  private signingSecret: string | null = null;
  private channel: string = "#ops";

  constructor() {
    this.signingSecret = process.env.SLACK_SIGNING_SECRET || null;
    this.botToken = process.env.SLACK_BOT_TOKEN || null;
  }

  async initialize() {
    const settings = await storage.getIntegrationSettings();
    if (settings) {
      this.webhookUrl = settings.slackWebhookUrl;
      if (settings.slackBotToken) {
        this.botToken = settings.slackBotToken;
      }
      this.channel = settings.slackChannel || "#ops";
    }
    
    if (!this.botToken) {
      this.botToken = process.env.SLACK_BOT_TOKEN || null;
    }
    if (!this.signingSecret) {
      this.signingSecret = process.env.SLACK_SIGNING_SECRET || null;
    }
  }

  verifySlackSignature(signature: string, timestamp: string, body: string): boolean {
    if (!this.signingSecret) {
      console.warn("Slack signing secret not configured");
      return false;
    }

    const requestTimestamp = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (Math.abs(currentTime - requestTimestamp) > 60 * 5) {
      console.warn("Slack request timestamp too old");
      return false;
    }

    const sigBaseString = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', this.signingSecret)
      .update(sigBaseString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  }

  async handleEvent(payload: SlackEventPayload): Promise<any> {
    if (payload.type === "url_verification") {
      return { challenge: payload.challenge };
    }

    if (payload.type === "event_callback" && payload.event) {
      const event = payload.event;
      
      if (event.type === "app_mention") {
        await this.handleMention(event);
      } else if (event.type === "message" && !event.thread_ts) {
        await this.logMessage(event);
      }
    }

    return { ok: true };
  }

  private async handleMention(event: any) {
    const text = event.text?.toLowerCase() || "";
    const channel = event.channel;

    if (text.includes("status")) {
      await this.sendStatusUpdate(channel);
    } else if (text.includes("research")) {
      await this.sendResearchStatus(channel);
    } else if (text.includes("help")) {
      await this.sendHelpMessage(channel);
    } else {
      await this.sendBotMessage(channel, 
        "👋 Hi! I'm the Research Ops Bot. Try asking me about `status`, `research`, or say `help` for more options."
      );
    }
  }

  private async logMessage(event: any) {
    try {
      await storage.createSlackMessage({
        user: event.user || "unknown",
        message: event.text || "",
        isBot: false,
        channel: event.channel || this.channel,
      });
    } catch (error) {
      console.error("Error logging Slack message:", error);
    }
  }

  async handleCommand(payload: SlackCommandPayload): Promise<any> {
    const command = payload.command;
    const args = payload.text.trim().split(/\s+/);

    switch (command) {
      case "/research":
        return await this.handleResearchCommand(args, payload);
      case "/status":
        return await this.handleStatusCommand(args, payload);
      case "/ops":
        return await this.handleOpsCommand(args, payload);
      default:
        return { text: `Unknown command: ${command}` };
    }
  }

  private async handleResearchCommand(args: string[], payload: SlackCommandPayload): Promise<any> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case "list":
        return await this.getProjectList();
      case "summary":
        const timeframe = args[1] || "weekly";
        return await this.getResearchSummaryResponse(timeframe);
      default:
        return {
          response_type: "ephemeral",
          text: "📊 *Research Commands:*\n" +
                "• `/research list` - Show all active research projects\n" +
                "• `/research summary [weekly|monthly|quarterly]` - Get research summary"
        };
    }
  }

  private async handleStatusCommand(args: string[], payload: SlackCommandPayload): Promise<any> {
    const repos = await storage.getRepositories();
    const activities = await storage.getRecentActivity(10);
    
    const activeRepos = repos.filter((r: any) => r.lastActivity);
    const totalCommits = activities.filter((a: any) => a.eventType === "push").length;

    return {
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🖥️ System Status",
            emoji: true
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Tracked Repos:*\n${repos.length}`
            },
            {
              type: "mrkdwn",
              text: `*Active Repos:*\n${activeRepos.length}`
            },
            {
              type: "mrkdwn",
              text: `*Recent Commits:*\n${totalCommits}`
            },
            {
              type: "mrkdwn",
              text: `*Bot Status:*\n🟢 Online`
            }
          ]
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Last updated: ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    };
  }

  private async handleOpsCommand(args: string[], payload: SlackCommandPayload): Promise<any> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case "sync":
        return {
          response_type: "ephemeral",
          text: "🔄 Syncing repositories... This will take a moment. You'll be notified when complete."
        };
      case "alert":
        const message = args.slice(1).join(" ");
        if (message) {
          await this.sendMessage(`🚨 *Alert from ${payload.user_name}:*\n${message}`);
          return { response_type: "ephemeral", text: "Alert sent to ops channel!" };
        }
        return { response_type: "ephemeral", text: "Usage: `/ops alert <message>`" };
      default:
        return {
          response_type: "ephemeral",
          text: "⚙️ *Ops Commands:*\n" +
                "• `/ops sync` - Trigger repository sync\n" +
                "• `/ops alert <message>` - Send an alert to the ops channel"
        };
    }
  }

  private async getProjectList(): Promise<any> {
    const projects = await storage.getResearchProjects();
    
    if (projects.length === 0) {
      return { text: "No research projects found." };
    }

    const projectBlocks = projects.slice(0, 10).map((p: any) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${p.name}*\n${p.description || "No description"}\n_Status: ${p.status}_${p.grantee ? ` | Grantee: ${p.grantee}` : ""}`
      }
    }));

    return {
      response_type: "ephemeral",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔬 Research Projects",
            emoji: true
          }
        },
        ...projectBlocks,
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Showing ${Math.min(projects.length, 10)} of ${projects.length} projects`
            }
          ]
        }
      ]
    };
  }

  private async getResearchSummaryResponse(timeframe: string): Promise<any> {
    const now = new Date();
    let startDate: Date;
    let periodLabel: string;

    switch (timeframe) {
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        break;
      case "quarterly":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        periodLabel = `Q${quarter + 1} ${now.getFullYear()}`;
        break;
      default:
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        periodLabel = `Week of ${startDate.toLocaleDateString()}`;
    }

    const projects = await storage.getResearchProjects();
    const allUpdates = await storage.getResearchUpdates();
    const updates = allUpdates.filter((u: any) => new Date(u.date) >= startDate);

    return {
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `📊 ${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} Research Summary`,
            emoji: true
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Period:*\n${periodLabel}`
            },
            {
              type: "mrkdwn",
              text: `*Active Projects:*\n${projects.filter((p: any) => p.status === "active").length}`
            },
            {
              type: "mrkdwn",
              text: `*Updates:*\n${updates.length}`
            }
          ]
        }
      ]
    };
  }

  async sendBotMessage(channel: string, text: string, blocks?: any[]): Promise<boolean> {
    await this.initialize();
    
    if (!this.botToken) {
      console.warn("Slack bot token not configured");
      return false;
    }

    try {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({
          channel,
          text,
          blocks,
        }),
      });

      const result = await response.json();
      
      if (!result.ok) {
        console.error("Failed to send Slack bot message:", result.error);
        return false;
      }

      await storage.createSlackMessage({
        user: "Ops Bot",
        message: text,
        isBot: true,
        channel,
      });

      return true;
    } catch (error) {
      console.error("Error sending Slack bot message:", error);
      return false;
    }
  }

  private async sendStatusUpdate(channel: string) {
    const repos = await storage.getRepositories();
    const activities = await storage.getRecentActivity(20);
    
    const text = `🖥️ *System Status*\n` +
                 `• Tracked Repositories: ${repos.length}\n` +
                 `• Recent Activities: ${activities.length}\n` +
                 `• Bot Status: 🟢 Online\n` +
                 `• Last Updated: ${new Date().toLocaleString()}`;

    await this.sendBotMessage(channel, text);
  }

  private async sendResearchStatus(channel: string) {
    const projects = await storage.getResearchProjects();
    const activeProjects = projects.filter((p: any) => p.status === "active");

    const text = `🔬 *Research Status*\n` +
                 `• Total Projects: ${projects.length}\n` +
                 `• Active Projects: ${activeProjects.length}\n\n` +
                 `*Active Projects:*\n` +
                 activeProjects.slice(0, 5).map((p: any) => 
                   `  • ${p.name}${p.grantee ? ` (${p.grantee})` : ""}`
                 ).join("\n");

    await this.sendBotMessage(channel, text);
  }

  private async sendHelpMessage(channel: string) {
    const text = `🤖 *Research Ops Bot Help*\n\n` +
                 `*Mention Commands:*\n` +
                 `• \`@bot status\` - Get system status\n` +
                 `• \`@bot research\` - Get research overview\n` +
                 `• \`@bot help\` - Show this message\n\n` +
                 `*Slash Commands:*\n` +
                 `• \`/research list\` - List research projects\n` +
                 `• \`/research summary [timeframe]\` - Research summary\n` +
                 `• \`/status\` - System status\n` +
                 `• \`/ops sync\` - Sync repositories\n` +
                 `• \`/ops alert <message>\` - Send alert`;

    await this.sendBotMessage(channel, text);
  }

  async sendMessage(text: string, customChannel?: string): Promise<boolean> {
    await this.initialize();
    
    if (this.botToken) {
      const channel = customChannel || this.channel;
      return await this.sendBotMessage(channel, text);
    }

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

  async sendRepoSummary(summary: {
    timeframe: string;
    periodLabel: string;
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    activeRepos: number;
    contributors: string[];
    repoActivity: Array<{ repo: string; commits: number; prs: number }>;
  }) {
    const timeframeEmoji = {
      daily: ":sunrise:",
      weekly: ":calendar:",
      monthly: ":date:",
      quarterly: ":chart_with_upwards_trend:",
    }[summary.timeframe] || ":bar_chart:";

    const text = `${timeframeEmoji} *${summary.timeframe.charAt(0).toUpperCase() + summary.timeframe.slice(1)} Repository Summary*\n` +
                 `_${summary.periodLabel}_\n\n` +
                 `*Overview:*\n` +
                 `• Total Commits: ${summary.totalCommits}\n` +
                 `• Pull Requests: ${summary.totalPRs}\n` +
                 `• Issues: ${summary.totalIssues}\n` +
                 `• Active Repositories: ${summary.activeRepos}\n` +
                 `• Contributors: ${summary.contributors.length}\n\n` +
                 `*Top Contributors:*\n` +
                 (summary.contributors.length > 0 
                   ? summary.contributors.slice(0, 5).map((c, i) => `  ${i + 1}. ${c}`).join("\n")
                   : "  No activity") +
                 `\n\n*Repository Breakdown:*\n` +
                 (summary.repoActivity.length > 0
                   ? summary.repoActivity.map(r => `  • *${r.repo}*: ${r.commits} commits, ${r.prs} PRs`).join("\n")
                   : "  No activity");

    return await this.sendMessage(text);
  }

  async sendResearchSummary(summary: {
    timeframe: string;
    periodLabel: string;
    totalProjects: number;
    totalUpdates: number;
    grantees: string[];
    projectUpdates: Array<{ name: string; updateCount: number; latestUpdate: string; grantee?: string | null }>;
  }) {
    const timeframeEmoji = {
      daily: ":microscope:",
      weekly: ":dna:",
      monthly: ":bulb:",
      quarterly: ":trophy:",
    }[summary.timeframe] || ":rocket:";

    let text = `${timeframeEmoji} *${summary.timeframe.charAt(0).toUpperCase() + summary.timeframe.slice(1)} Research Summary*\n` +
               `_${summary.periodLabel}_\n\n` +
               `*Overview:*\n` +
               `• Active Projects: ${summary.totalProjects}\n` +
               `• Total Updates: ${summary.totalUpdates}\n` +
               `• Contributors: ${summary.grantees.length}\n\n`;

    if (summary.projectUpdates.length > 0) {
      text += `*Project Updates:*\n`;
      for (const project of summary.projectUpdates) {
        text += `\n:small_blue_diamond: *${project.name}* (${project.updateCount} update${project.updateCount !== 1 ? "s" : ""})\n`;
        if (project.latestUpdate) {
          text += `   _Latest:_ ${project.latestUpdate}`;
          if (project.grantee) {
            text += ` — ${project.grantee}`;
          }
          text += "\n";
        }
      }
    } else {
      text += `_No research updates in this period._`;
    }

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
