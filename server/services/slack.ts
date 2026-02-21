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

    try {
      const sigBaseString = `v0:${timestamp}:${body}`;
      const mySignature = 'v0=' + crypto
        .createHmac('sha256', this.signingSecret)
        .update(sigBaseString)
        .digest('hex');

      // Ensure both buffers are same length before comparison
      if (mySignature.length !== signature.length) {
        console.warn("Signature length mismatch");
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(signature)
      );
    } catch (error) {
      console.error("Error verifying Slack signature:", error);
      return false;
    }
  }

  async handleEvent(payload: SlackEventPayload): Promise<any> {
    console.log("handleEvent called with type:", payload.type);
    
    if (payload.type === "url_verification") {
      console.log("URL verification request received");
      return { challenge: payload.challenge };
    }

    if (payload.type === "event_callback" && payload.event) {
      const event = payload.event;
      console.log("Event callback received, event type:", event.type, "channel:", event.channel);
      
      if (event.type === "app_mention") {
        console.log("App mention detected, text:", event.text);
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
      case "/opstatus":
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
      case "projects":
        return await this.getProjectList();
      case "summary":
        const timeframe = args[1] || "weekly";
        return await this.getResearchSummaryResponse(timeframe);
      case "hypotheses":
      case "hypothesis":
        return await this.getHypothesisList();
      case "papers":
      case "paper":
        return await this.getPapersList();
      default:
        return {
          response_type: "ephemeral",
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: "📊 Research Commands", emoji: true }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "• `/research projects` - Show all research projects\n• `/research hypotheses` - Show tracked hypotheses\n• `/research papers` - Show papers pipeline status\n• `/research summary [weekly|monthly|quarterly]` - Get research summary"
              }
            }
          ]
        };
    }
  }

  private async getHypothesisList(): Promise<any> {
    const hypotheses = await storage.getHypotheses();
    const projectLinks = await storage.getAllProjectHypothesisLinks();
    const projects = await storage.getResearchProjects();
    
    if (hypotheses.length === 0) {
      return { 
        response_type: "in_channel",
        text: "No hypotheses tracked yet. Sync from cimcai/hypotheses repo to get started." 
      };
    }

    // Group by status
    const statusGroups = {
      active: hypotheses.filter(h => h.status === "active"),
      validated: hypotheses.filter(h => h.status === "validated"),
      invalidated: hypotheses.filter(h => h.status === "invalidated"),
      archived: hypotheses.filter(h => h.status === "archived")
    };

    // Count linked projects
    const linkedHypotheses = new Set(projectLinks.map(l => l.hypothesisId));
    const unlinkedCount = hypotheses.filter(h => !linkedHypotheses.has(h.id)).length;

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "🧬 Research Hypotheses", emoji: true }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total Hypotheses:*\n${hypotheses.length}` },
          { type: "mrkdwn", text: `*Linked to Projects:*\n${linkedHypotheses.size}` },
          { type: "mrkdwn", text: `*Active:*\n${statusGroups.active.length}` },
          { type: "mrkdwn", text: `*Unlinked:*\n${unlinkedCount}` }
        ]
      }
    ];

    // Status breakdown
    if (statusGroups.validated.length > 0 || statusGroups.invalidated.length > 0) {
      blocks.push({
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*✅ Validated:*\n${statusGroups.validated.length}` },
          { type: "mrkdwn", text: `*❌ Invalidated:*\n${statusGroups.invalidated.length}` }
        ]
      });
    }

    blocks.push({ type: "divider" });

    // Show hypotheses with their linked projects
    const hypothesisBlocks: any[] = [];
    for (const h of hypotheses.slice(0, 12)) {
      const links = projectLinks.filter(l => l.hypothesisId === h.id);
      const linkedProjects = links.map(l => {
        const project = projects.find(p => p.id === l.projectId);
        return project ? `${project.name} (${l.relationship || "tests"})` : null;
      }).filter(Boolean);

      const statusEmoji = h.status === "validated" ? "✅" : 
                          h.status === "invalidated" ? "❌" : 
                          h.status === "archived" ? "📦" : "🔬";

      hypothesisBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} *${h.title}*${linkedProjects.length > 0 ? `\n↳ _Projects: ${linkedProjects.join(", ")}_` : " _(unlinked)_"}`
        }
      });
    }

    blocks.push(...hypothesisBlocks);

    if (hypotheses.length > 12) {
      blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Showing 12 of ${hypotheses.length} hypotheses` }
        ]
      });
    }

    return {
      response_type: "in_channel",
      blocks
    };
  }

  private async getPapersList(): Promise<any> {
    const papers = await storage.getPapers();
    
    if (papers.length === 0) {
      return { 
        response_type: "in_channel",
        text: "No papers tracked yet. Papers sync from cimcai/paper-pipeline." 
      };
    }

    // Group by stage
    const stageGroups = {
      before: papers.filter(p => p.currentStage === "before"),
      mid: papers.filter(p => p.currentStage === "mid"),
      after: papers.filter(p => p.currentStage === "after")
    };

    const stageEmoji = { before: "📝", mid: "🔄", after: "✅" };
    const stageNames = { before: "Draft", mid: "Review", after: "Published" };

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "📄 Papers Pipeline", emoji: true }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total Papers:*\n${papers.length}` },
          { type: "mrkdwn", text: `*📝 Draft:*\n${stageGroups.before.length}` },
          { type: "mrkdwn", text: `*🔄 Review:*\n${stageGroups.mid.length}` },
          { type: "mrkdwn", text: `*✅ Published:*\n${stageGroups.after.length}` }
        ]
      },
      { type: "divider" }
    ];

    // Show papers by stage
    for (const [stage, stagePapers] of Object.entries(stageGroups)) {
      if (stagePapers.length === 0) continue;
      
      const emoji = stageEmoji[stage as keyof typeof stageEmoji];
      const name = stageNames[stage as keyof typeof stageNames];
      
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${emoji} ${name} Stage (${stagePapers.length}):*` }
      });

      for (const paper of stagePapers.slice(0, 5)) {
        const stageData = paper.stages?.[stage as keyof typeof paper.stages];
        const factors = stageData?.factors || {};
        const completedFactors = Object.values(factors).filter((f: any) => f.current >= f.target).length;
        const totalFactors = Object.keys(factors).length;
        const progress = totalFactors > 0 ? `${completedFactors}/${totalFactors} factors` : "";

        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `• *${paper.title}*${progress ? ` — _${progress}_` : ""}` }
          ]
        });
      }

      if (stagePapers.length > 5) {
        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `_...and ${stagePapers.length - 5} more_` }
          ]
        });
      }
    }

    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Source: \`cimcai/paper-pipeline\` | Last synced: ${papers[0]?.syncedAt ? new Date(papers[0].syncedAt).toLocaleString() : "Unknown"}` }
      ]
    });

    return {
      response_type: "in_channel",
      blocks
    };
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
    const updates = await storage.getResearchUpdates();
    const hypotheses = await storage.getHypotheses();
    const projectLinks = await storage.getAllProjectHypothesisLinks();
    
    if (projects.length === 0) {
      return { 
        response_type: "in_channel",
        text: "No research projects found." 
      };
    }

    const projectBlocks: any[] = [];
    
    for (const p of projects.slice(0, 10)) {
      const projectUpdates = updates.filter((u: any) => u.projectId === p.id);
      const latestUpdate = projectUpdates[0];
      
      // Get linked hypotheses for this project
      const linkedHypotheses = projectLinks
        .filter(l => l.projectId === p.id)
        .map(l => {
          const h = hypotheses.find(h => h.id === l.hypothesisId);
          return h ? { title: h.title, relationship: l.relationship || "tests" } : null;
        })
        .filter(Boolean);
      
      const latestGrantee = latestUpdate?.grantee;
      projectBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${p.name}*${latestGrantee ? ` — _${latestGrantee}_` : ""}\n${p.description || "No description"}`
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: `${projectUpdates.length} updates`, emoji: true },
          value: p.id,
          action_id: `view_project_${p.id}`
        }
      });
      
      // Show linked hypotheses
      if (linkedHypotheses.length > 0) {
        const hypothesisList = linkedHypotheses
          .slice(0, 3)
          .map(h => `🧬 ${h!.title} _(${h!.relationship})_`)
          .join("\n");
        projectBlocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: hypothesisList }
          ]
        });
      }
      
      if (latestUpdate) {
        projectBlocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 Latest: ${new Date(latestUpdate.date).toLocaleDateString()} — ${latestUpdate.description?.substring(0, 100)}${(latestUpdate.description?.length || 0) > 100 ? "..." : ""}`
            }
          ]
        });
      }
      
      projectBlocks.push({ type: "divider" });
    }

    // Count total linked hypotheses
    const linkedHypothesesCount = new Set(projectLinks.map(l => l.hypothesisId)).size;

    return {
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🔬 Research Projects", emoji: true }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Total Projects:*\n${projects.length}` },
            { type: "mrkdwn", text: `*Total Updates:*\n${updates.length}` },
            { type: "mrkdwn", text: `*Hypotheses:*\n${hypotheses.length}` },
            { type: "mrkdwn", text: `*Linked:*\n${linkedHypothesesCount}` }
          ]
        },
        { type: "divider" },
        ...projectBlocks,
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `Showing ${Math.min(projects.length, 10)} of ${projects.length} projects | Use \`/research hypotheses\` to view all hypotheses` }
          ]
        }
      ]
    };
  }

  private async getResearchSummaryResponse(timeframe: string): Promise<any> {
    const now = new Date();
    let startDate: Date;
    let periodLabel: string;
    let emoji: string;

    switch (timeframe) {
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        emoji = "📅";
        break;
      case "quarterly":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        periodLabel = `Q${quarter + 1} ${now.getFullYear()}`;
        emoji = "📊";
        break;
      default:
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        periodLabel = `Week of ${startDate.toLocaleDateString()}`;
        emoji = "📆";
        timeframe = "weekly";
    }

    const projects = await storage.getResearchProjects();
    const allUpdates = await storage.getResearchUpdates();
    const updates = allUpdates.filter((u: any) => new Date(u.date) >= startDate);
    
    // Get hypotheses data
    const hypotheses = await storage.getHypotheses();
    const projectLinks = await storage.getAllProjectHypothesisLinks();
    const linkedHypotheses = new Set(projectLinks.map(l => l.hypothesisId));
    
    // Get repository activity for the same period
    const repos = await storage.getRepositories();
    const recentActivity = await storage.getRecentActivity(90);
    const repoActivity = recentActivity.filter((a: any) => {
      const activityDate = a.activityDate ? new Date(a.activityDate) : new Date(a.createdAt);
      return activityDate >= startDate;
    });
    
    // Group activity by repo
    const repoActivityMap = new Map<string, { commits: number; repoName: string }>();
    for (const activity of repoActivity) {
      if (activity.eventType === "push") {
        const repo = repos.find((r: any) => r.id === activity.repositoryId);
        if (repo) {
          const existing = repoActivityMap.get(repo.id) || { commits: 0, repoName: repo.name };
          existing.commits++;
          repoActivityMap.set(repo.id, existing);
        }
      }
    }
    const activeRepos = Array.from(repoActivityMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.commits - a.commits);
    
    // Group updates by project
    const projectUpdateMap = new Map<string, any[]>();
    for (const update of updates) {
      const existing = projectUpdateMap.get(update.projectId) || [];
      existing.push(update);
      projectUpdateMap.set(update.projectId, existing);
    }

    // Get unique grantees
    const grantees = Array.from(new Set(updates.map((u: any) => u.grantee).filter(Boolean)));
    
    // Total commits
    const totalCommits = activeRepos.reduce((sum, r) => sum + r.commits, 0);

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} Research Summary`, emoji: true }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📅 Period:*\n${periodLabel}` },
          { type: "mrkdwn", text: `*🔬 Projects:*\n${projects.length}` },
          { type: "mrkdwn", text: `*📝 Updates:*\n${updates.length}` },
          { type: "mrkdwn", text: `*👥 Contributors:*\n${grantees.length}` }
        ]
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*📦 Active Repos:*\n${activeRepos.length}` },
          { type: "mrkdwn", text: `*🚀 Commits:*\n${totalCommits}` },
          { type: "mrkdwn", text: `*🧬 Hypotheses:*\n${hypotheses.length}` },
          { type: "mrkdwn", text: `*🔗 Linked:*\n${linkedHypotheses.size}` }
        ]
      }
    ];

    // Repository Activity Section
    if (activeRepos.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*📦 Repository Activity:*" }
      });
      
      const repoLines = activeRepos.slice(0, 8).map(r => 
        `• *${r.repoName}* — ${r.commits} commit${r.commits !== 1 ? "s" : ""}`
      ).join("\n");
      
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: repoLines }
      });
    }

    // Research Updates Section
    if (updates.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "*🔬 Research Updates:*" }
      });

      // Add updates grouped by project
      for (const project of projects) {
        const projectUpdates = projectUpdateMap.get(project.id) || [];
        if (projectUpdates.length > 0) {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${project.name}* — ${projectUpdates.length} update${projectUpdates.length !== 1 ? "s" : ""}`
            }
          });
          
          // Show latest updates (max 2)
          for (const update of projectUpdates.slice(0, 2)) {
            blocks.push({
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `📌 ${new Date(update.date).toLocaleDateString()} ${update.grantee ? `(${update.grantee})` : ""}: ${update.description?.substring(0, 120)}${(update.description?.length || 0) > 120 ? "..." : ""}`
                }
              ]
            });
          }
        }
      }
    } else if (activeRepos.length === 0) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "_No activity recorded for this period._" }
      });
    }

    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Generated ${new Date().toLocaleString()} | Use \`/research projects\` to see all projects` }
      ]
    });

    return {
      response_type: "in_channel",
      blocks
    };
  }

  async sendBotMessage(channel: string, text: string, blocks?: any[]): Promise<boolean> {
    await this.initialize();
    
    if (!this.botToken) {
      console.warn("Slack bot token not configured - checking env:", !!process.env.SLACK_BOT_TOKEN);
      return false;
    }

    console.log("Sending bot message to channel:", channel);
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
                 `• \`/opstatus\` - System status\n` +
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
    botPRs?: number;
    activeRepos: number;
    topContributor: string;
    repoActivity: Array<{ repo: string; commits: number; prs?: number; prAuthors?: string[]; longestMessage?: string | null }>;
  }) {
    const repoLines = summary.repoActivity.map(r => {
      let line = `  • *${r.repo}*: ${r.commits} commits`;
      if (r.prs && r.prs > 0) {
        line += `, ${r.prs} PRs`;
        if (r.prAuthors && r.prAuthors.length > 0) {
          line += ` (by ${r.prAuthors.join(", ")})`;
        }
      }
      if (r.longestMessage) {
        const msg = r.longestMessage.length > 150 
          ? r.longestMessage.substring(0, 147) + "..." 
          : r.longestMessage;
        line += `\n      _"${msg}"_`;
      }
      return line;
    }).join("\n");

    let text = `:bar_chart: *Daily GitHub Activity Summary*\n\n` +
               `• Total Commits: ${summary.totalCommits}\n` +
               `• Pull Requests: ${summary.totalPRs}` +
               (summary.botPRs && summary.botPRs > 0 ? ` (+ ${summary.botPRs} from bots)` : "") + `\n` +
               `• Active Repositories: ${summary.activeRepos}\n` +
               `• Top Contributor: ${summary.topContributor}\n\n` +
               `*Repository Activity:*\n` +
               repoLines;

    return await this.sendMessage(text);
  }

  async sendWeeklySummary(summary: {
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    activeRepos: number;
    contributors: string[];
    repoActivity: Array<{ repo: string; commits: number; prs: number; prAuthors?: string[] }>;
    weekStart: string;
    weekEnd: string;
  }) {
    const repoLines = summary.repoActivity.map(r => {
      let line = `  • *${r.repo}*: ${r.commits} commits`;
      if (r.prs > 0) {
        line += `, ${r.prs} PRs`;
        if (r.prAuthors && r.prAuthors.length > 0) {
          line += ` (by ${r.prAuthors.join(", ")})`;
        }
      }
      return line;
    }).join("\n");

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
                 repoLines;

    return await this.sendMessage(text);
  }

  async sendCombinedWeeklySummary(summary: {
    periodLabel: string;
    totalCommits: number;
    totalPRs: number;
    activeRepos: number;
    repoActivity: Array<{ repo: string; commits: number; prs: number; prAuthors?: string[] }>;
    totalResearchUpdates: number;
    projectsWithUpdates: number;
    projectUpdates: Array<{ name: string; updateCount: number }>;
    totalPapers: number;
    papersByStage: { before: number; mid: number; after: number };
    contributors: string[];
    researchContributors: string[];
  }) {
    let text = `:calendar: *Weekly Research Ops Summary*\n_${summary.periodLabel}_\n\n`;

    // Code Activity Section
    text += `:computer: *Code Activity*\n`;
    text += `• ${summary.totalCommits} commits across ${summary.activeRepos} repos\n`;
    if (summary.totalPRs > 0) {
      text += `• ${summary.totalPRs} pull requests\n`;
    }
    
    if (summary.repoActivity.length > 0) {
      text += `\n*Active Repositories:*\n`;
      for (const repo of summary.repoActivity.slice(0, 6)) {
        text += `  • *${repo.repo}*: ${repo.commits} commit${repo.commits !== 1 ? "s" : ""}`;
        if (repo.prs > 0) {
          text += `, ${repo.prs} PR${repo.prs !== 1 ? "s" : ""}`;
          if (repo.prAuthors && repo.prAuthors.length > 0) {
            text += ` (by ${repo.prAuthors.join(", ")})`;
          }
        }
        text += `\n`;
      }
      if (summary.repoActivity.length > 6) {
        text += `  _...and ${summary.repoActivity.length - 6} more_\n`;
      }
    }

    // Research Activity Section
    text += `\n:microscope: *Research Activity*\n`;
    text += `• ${summary.totalResearchUpdates} updates across ${summary.projectsWithUpdates} projects\n`;
    
    if (summary.projectUpdates.length > 0) {
      text += `\n*Active Projects:*\n`;
      for (const project of summary.projectUpdates) {
        text += `  • *${project.name}*: ${project.updateCount} update${project.updateCount !== 1 ? "s" : ""}\n`;
      }
    }

    // Papers Pipeline Section
    if (summary.totalPapers > 0) {
      text += `\n:page_facing_up: *Papers Pipeline*\n`;
      text += `• ${summary.totalPapers} total papers\n`;
      text += `  :pencil: Draft: ${summary.papersByStage.before}`;
      text += ` | :arrows_counterclockwise: Review: ${summary.papersByStage.mid}`;
      text += ` | :white_check_mark: Published: ${summary.papersByStage.after}\n`;
    }

    // Contributors Section
    if (summary.contributors.length > 0 || summary.researchContributors.length > 0) {
      text += `\n:busts_in_silhouette: *Contributors*\n`;
      if (summary.contributors.length > 0) {
        text += `  Code: ${summary.contributors.join(", ")}\n`;
      }
      if (summary.researchContributors.length > 0) {
        text += `  Research: ${summary.researchContributors.join(", ")}\n`;
      }
    }

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
    repoActivity: Array<{ repo: string; commits: number; prs: number; prAuthors?: string[] }>;
  }) {
    const timeframeEmoji = {
      daily: ":sunrise:",
      weekly: ":calendar:",
      monthly: ":date:",
      quarterly: ":chart_with_upwards_trend:",
    }[summary.timeframe] || ":bar_chart:";

    const repoLines = summary.repoActivity.length > 0
      ? summary.repoActivity.map(r => {
          let line = `  • *${r.repo}*: ${r.commits} commits`;
          if (r.prs > 0) {
            line += `, ${r.prs} PRs`;
            if (r.prAuthors && r.prAuthors.length > 0) {
              line += ` (by ${r.prAuthors.join(", ")})`;
            }
          }
          return line;
        }).join("\n")
      : "  No activity";

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
                 repoLines;

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
