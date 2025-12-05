import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertIntegrationSettingsSchema, 
  insertRepositorySchema,
  insertSlackMessageSchema,
} from "@shared/schema";
import { githubService } from "./services/github";
import { slackService } from "./services/slack";
import { schedulerService } from "./services/scheduler";

async function autoSyncOnStartup() {
  console.log("Running auto-sync on startup...");
  try {
    const settings = await storage.getIntegrationSettings();
    if (settings?.githubOrgs && settings.githubOrgs.length > 0) {
      console.log(`Auto-syncing ${settings.githubOrgs.length} GitHub organization(s)...`);
      for (const org of settings.githubOrgs) {
        try {
          await githubService.syncOrganization(org);
          console.log(`Auto-synced org: ${org}`);
        } catch (error) {
          console.error(`Failed to auto-sync org ${org}:`, error);
        }
      }
      
      // Also sync hypotheses if configured
      try {
        const result = await githubService.syncHypotheses();
        console.log(`Auto-synced hypotheses: ${result.synced} synced, ${result.skipped} skipped`);
      } catch (error) {
        console.error("Failed to auto-sync hypotheses:", error);
      }
    }
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Only start the scheduler in production to prevent duplicate sends from dev + production
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    console.log("Production environment detected - starting scheduler service...");
    schedulerService.start();
  } else {
    console.log("Development environment - scheduler disabled to prevent duplicate sends");
  }
  
  // Auto-sync repos and hypotheses on startup (run in background)
  setTimeout(() => autoSyncOnStartup(), 5000);

  // ============ Integration Settings ============
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      
      // Don't expose sensitive tokens in the response
      if (settings) {
        res.json({
          ...settings,
          slackWebhookUrl: settings.slackWebhookUrl ? "***configured***" : null,
          slackBotToken: settings.slackBotToken ? "***configured***" : null,
          githubToken: settings.githubToken ? "***configured***" : null,
        });
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validatedData = insertIntegrationSettingsSchema.parse(req.body);
      const settings = await storage.upsertIntegrationSettings(validatedData);
      
      res.json({
        ...settings,
        slackWebhookUrl: settings.slackWebhookUrl ? "***configured***" : null,
        slackBotToken: settings.slackBotToken ? "***configured***" : null,
        githubToken: settings.githubToken ? "***configured***" : null,
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  // ============ Activity Stats ============
  app.get("/api/activity/monthly", async (req, res) => {
    try {
      const monthlyStats = await storage.getMonthlyActivityStats();
      res.json(monthlyStats);
    } catch (error) {
      console.error("Error fetching monthly activity stats:", error);
      res.status(500).json({ error: "Failed to fetch monthly activity stats" });
    }
  });

  // ============ Repositories ============
  app.get("/api/repositories", async (req, res) => {
    try {
      const repos = await storage.getActiveRepositories();
      
      // Get activity stats for each repo
      const reposWithActivity = await Promise.all(
        repos.map(async (repo) => {
          const activity = await storage.getActivityStats(repo.id, 60);
          const totalActivity = activity.reduce((sum, day) => sum + day.count, 0);
          return { ...repo, activity, totalActivity };
        })
      );
      
      // Sort by 60-day activity (most active first)
      reposWithActivity.sort((a, b) => b.totalActivity - a.totalActivity);
      
      res.json(reposWithActivity);
    } catch (error) {
      console.error("Error fetching repositories:", error);
      res.status(500).json({ error: "Failed to fetch repositories" });
    }
  });

  app.post("/api/repositories", async (req, res) => {
    try {
      const validatedData = insertRepositorySchema.parse(req.body);
      const repo = await storage.createRepository(validatedData);
      
      // Try to sync with GitHub
      try {
        await githubService.syncRepository(repo.fullName);
      } catch (syncError) {
        console.warn("Could not sync with GitHub:", syncError);
      }
      
      res.json(repo);
    } catch (error) {
      console.error("Error creating repository:", error);
      res.status(400).json({ error: "Invalid repository data" });
    }
  });

  // Add a repository by full name (owner/repo) - fetches from GitHub
  app.post("/api/repositories/add/:fullName", async (req, res) => {
    try {
      const fullName = decodeURIComponent(req.params.fullName);
      const [owner, name] = fullName.split("/");
      
      if (!owner || !name) {
        return res.status(400).json({ error: "Invalid repository name. Use format: owner/repo" });
      }

      // Check if repo already exists
      const existing = await storage.getRepositoryByFullName(fullName);
      if (existing) {
        // Just sync activity and return
        await githubService.fetchRepoActivity(existing.id, fullName);
        return res.json(existing);
      }

      // Fetch repo info from GitHub
      const repoData = await githubService.fetchRepository(owner, name);
      
      if (!repoData) {
        return res.status(404).json({ error: "Repository not found on GitHub" });
      }

      // Create the repository
      const repo = await storage.createRepository({
        owner: repoData.owner.login,
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description || "",
        language: repoData.language || "Unknown",
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        isActive: true,
      });

      // Fetch historical activity
      await githubService.fetchRepoActivity(repo.id, fullName);
      
      res.json(repo);
    } catch (error) {
      console.error("Error adding repository:", error);
      res.status(500).json({ error: "Failed to add repository" });
    }
  });

  app.post("/api/repositories/sync/:fullName", async (req, res) => {
    try {
      const fullName = decodeURIComponent(req.params.fullName);
      await githubService.syncRepository(fullName);
      
      const repo = await storage.getRepositoryByFullName(fullName);
      res.json(repo);
    } catch (error) {
      console.error("Error syncing repository:", error);
      res.status(500).json({ error: "Failed to sync repository" });
    }
  });

  app.delete("/api/repositories/:id", async (req, res) => {
    try {
      await storage.deleteRepository(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting repository:", error);
      res.status(500).json({ error: "Failed to delete repository" });
    }
  });

  // Sync all repos from an organization
  app.post("/api/repositories/sync-org/:org", async (req, res) => {
    try {
      const org = decodeURIComponent(req.params.org);
      console.log(`Syncing organization: ${org}`);
      
      const result = await githubService.syncOrganization(org);
      
      res.json({ 
        success: true, 
        message: `Synced ${result.added + result.updated} repositories`,
        added: result.added,
        updated: result.updated,
      });
    } catch (error) {
      console.error("Error syncing organization:", error);
      res.status(500).json({ error: "Failed to sync organization" });
    }
  });

  // ============ Activity Logs ============
  app.get("/api/activity", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const activities = await storage.getRecentActivity(days);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  app.get("/api/activity/repository/:id", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const activities = await storage.getActivityByRepository(req.params.id, days);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching repository activity:", error);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // ============ GitHub Webhooks ============
  app.post("/api/webhooks/github", async (req, res) => {
    try {
      const event = req.headers["x-github-event"] as string;
      const payload = req.body;

      console.log(`Received GitHub webhook: ${event}`);

      const activity = await githubService.processWebhookEvent(event, payload);
      
      if (activity) {
        const settings = await storage.getIntegrationSettings();
        
        if (settings?.enableRealtimeAlerts) {
          const repo = await storage.getRepository(activity.repositoryId);
          if (repo) {
            await slackService.sendGitHubUpdate(
              repo.name,
              activity.eventType,
              activity.author,
              activity.message,
              activity.url || undefined
            );
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing GitHub webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // ============ Slack Messages ============
  app.get("/api/slack/messages", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const messages = await storage.getRecentSlackMessages(limit);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching Slack messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/slack/messages", async (req, res) => {
    try {
      const validatedData = insertSlackMessageSchema.parse(req.body);
      const message = await storage.createSlackMessage(validatedData);
      
      // If it's a command from the user, process it and send to Slack
      if (!validatedData.isBot && validatedData.message.startsWith("/")) {
        // Process command here (e.g., /status, /deploy)
        const response = await processSlackCommand(validatedData.message);
        await slackService.sendMessage(response);
      }
      
      res.json(message);
    } catch (error) {
      console.error("Error creating Slack message:", error);
      res.status(400).json({ error: "Invalid message data" });
    }
  });

  // ============ Manual Actions ============
  app.post("/api/slack/send-daily-summary", async (req, res) => {
    try {
      await schedulerService.sendDailySummary();
      res.json({ success: true, message: "Daily summary sent to Slack" });
    } catch (error) {
      console.error("Error sending daily summary:", error);
      res.status(500).json({ error: "Failed to send summary" });
    }
  });

  app.post("/api/slack/send-weekly-summary", async (req, res) => {
    try {
      await schedulerService.sendWeeklySummary();
      res.json({ success: true, message: "Weekly summary sent to Slack" });
    } catch (error) {
      console.error("Error sending weekly summary:", error);
      res.status(500).json({ error: "Failed to send summary" });
    }
  });

  // Flexible summary endpoints
  app.post("/api/slack/send-repo-summary/:timeframe", async (req, res) => {
    try {
      const timeframe = req.params.timeframe as "daily" | "weekly" | "monthly" | "quarterly";
      if (!["daily", "weekly", "monthly", "quarterly"].includes(timeframe)) {
        return res.status(400).json({ error: "Invalid timeframe. Use: daily, weekly, monthly, or quarterly" });
      }
      await schedulerService.sendRepoSummary(timeframe);
      res.json({ success: true, message: `${timeframe} repo summary sent to Slack` });
    } catch (error) {
      console.error("Error sending repo summary:", error);
      res.status(500).json({ error: "Failed to send summary" });
    }
  });

  app.post("/api/slack/send-research-summary/:timeframe", async (req, res) => {
    try {
      const timeframe = req.params.timeframe as "daily" | "weekly" | "monthly" | "quarterly";
      if (!["daily", "weekly", "monthly", "quarterly"].includes(timeframe)) {
        return res.status(400).json({ error: "Invalid timeframe. Use: daily, weekly, monthly, or quarterly" });
      }
      await schedulerService.sendResearchSummary(timeframe);
      res.json({ success: true, message: `${timeframe} research summary sent to Slack` });
    } catch (error) {
      console.error("Error sending research summary:", error);
      res.status(500).json({ error: "Failed to send summary" });
    }
  });

  // ============ Slack Bot Events & Commands ============
  
  // Helper to verify Slack requests - skip in development for testing
  const verifySlackRequest = (req: any, res: any, rawBody: string): boolean => {
    const signature = req.headers["x-slack-signature"] as string;
    const timestamp = req.headers["x-slack-request-timestamp"] as string;
    
    // In development, allow requests without signature for testing
    if (process.env.NODE_ENV !== "production") {
      return true;
    }
    
    // In production, require valid signature
    if (!signature || !timestamp) {
      res.status(401).json({ error: "Missing Slack signature headers" });
      return false;
    }
    
    if (!slackService.verifySlackSignature(signature, timestamp, rawBody)) {
      res.status(401).json({ error: "Invalid signature" });
      return false;
    }
    
    return true;
  };
  
  // Slack Events API endpoint (for receiving events like mentions, messages)
  app.post("/api/slack/events", async (req, res) => {
    try {
      console.log("Received Slack event:", JSON.stringify(req.body).substring(0, 200));
      const rawBody = JSON.stringify(req.body);
      if (!verifySlackRequest(req, res, rawBody)) return;

      const result = await slackService.handleEvent(req.body);
      console.log("Slack event handled, result:", JSON.stringify(result));
      res.json(result);
    } catch (error) {
      console.error("Error handling Slack event:", error);
      res.status(500).json({ error: "Failed to handle event" });
    }
  });

  // Slack Slash Commands endpoint
  app.post("/api/slack/commands", async (req, res) => {
    try {
      const rawBody = new URLSearchParams(req.body).toString();
      if (!verifySlackRequest(req, res, rawBody)) return;

      const result = await slackService.handleCommand(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error handling Slack command:", error);
      res.json({ 
        response_type: "ephemeral", 
        text: "Sorry, something went wrong processing your command." 
      });
    }
  });

  // Slack Interactive Components (buttons, modals, etc.)
  app.post("/api/slack/interactive", async (req, res) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (!verifySlackRequest(req, res, rawBody)) return;
      
      const payload = JSON.parse(req.body.payload || "{}");
      console.log("Slack interactive payload:", payload.type);
      
      // Handle different interactive types (e.g., button clicks, modal submissions)
      res.json({ ok: true });
    } catch (error) {
      console.error("Error handling Slack interactive:", error);
      res.status(500).json({ error: "Failed to handle interaction" });
    }
  });

  // ============ Research Projects ============
  app.get("/api/research/projects", async (req, res) => {
    try {
      const projects = await storage.getResearchProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching research projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/research/updates", async (req, res) => {
    try {
      const updates = await storage.getResearchUpdates();
      res.json(updates);
    } catch (error) {
      console.error("Error fetching research updates:", error);
      res.status(500).json({ error: "Failed to fetch updates" });
    }
  });

  app.get("/api/research/timeline", async (req, res) => {
    try {
      const timeline = await storage.getResearchTimeline();
      res.json(timeline);
    } catch (error) {
      console.error("Error fetching research timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  app.post("/api/research/import", async (req, res) => {
    try {
      const notes = req.body as { project: string; date: string; description: string }[];
      
      if (!Array.isArray(notes)) {
        return res.status(400).json({ error: "Expected an array of meeting notes" });
      }

      // Project colors for visualization
      const projectColors = [
        "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", 
        "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
      ];
      let colorIndex = 0;

      const projectMap = new Map<string, string>(); // project name -> project id
      let updatesAdded = 0;

      for (const note of notes) {
        // Get or create the project
        let projectId = projectMap.get(note.project);
        
        if (!projectId) {
          let project = await storage.getResearchProjectByName(note.project);
          
          if (!project) {
            project = await storage.createResearchProject({
              name: note.project,
              description: `Research project: ${note.project}`,
              color: projectColors[colorIndex % projectColors.length],
            });
            colorIndex++;
          }
          
          projectId = project.id;
          projectMap.set(note.project, projectId);
        }

        // Extract grantee name from description (first name mentioned)
        const granteeMatch = note.description.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
        const grantee = granteeMatch ? granteeMatch[1] : undefined;

        // Create the update
        await storage.createResearchUpdate({
          projectId,
          date: new Date(note.date),
          description: note.description,
          grantee,
        });
        updatesAdded++;
      }

      res.json({ 
        success: true, 
        message: `Imported ${updatesAdded} updates across ${projectMap.size} projects` 
      });
    } catch (error) {
      console.error("Error importing research notes:", error);
      res.status(500).json({ error: "Failed to import notes" });
    }
  });

  app.delete("/api/research/projects/:id", async (req, res) => {
    try {
      await storage.deleteResearchProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting research project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // ============ Hypotheses ============
  app.get("/api/hypotheses", async (req, res) => {
    try {
      const hypotheses = await storage.getHypotheses();
      res.json(hypotheses);
    } catch (error) {
      console.error("Error fetching hypotheses:", error);
      res.status(500).json({ error: "Failed to fetch hypotheses" });
    }
  });

  app.get("/api/hypotheses/:id", async (req, res) => {
    try {
      const hypothesis = await storage.getHypothesis(req.params.id);
      if (!hypothesis) {
        return res.status(404).json({ error: "Hypothesis not found" });
      }
      res.json(hypothesis);
    } catch (error) {
      console.error("Error fetching hypothesis:", error);
      res.status(500).json({ error: "Failed to fetch hypothesis" });
    }
  });

  app.post("/api/hypotheses/sync", async (req, res) => {
    try {
      const { owner, repo, path } = req.body;
      
      if (!owner || !repo) {
        return res.status(400).json({ error: "Owner and repo are required" });
      }
      
      const result = await githubService.syncHypotheses(owner, repo, path || "");
      res.json(result);
    } catch (error) {
      console.error("Error syncing hypotheses:", error);
      res.status(500).json({ error: "Failed to sync hypotheses" });
    }
  });

  // Create hypothesis and push to GitHub
  app.post("/api/hypotheses", async (req, res) => {
    try {
      const { title, content, pushToGitHub } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
      }

      let filename = "";
      let sha = "";

      // Push to GitHub if requested
      if (pushToGitHub) {
        const pushResult = await githubService.pushHypothesis(
          "CIMC-ai",
          "hypotheses", 
          title,
          content
        );
        
        if (!pushResult.success) {
          return res.status(500).json({ 
            error: `Failed to push to GitHub: ${pushResult.error}` 
          });
        }
        
        filename = pushResult.filename;
        
        // Sync to get the SHA
        await githubService.syncHypotheses("CIMC-ai", "hypotheses", "");
        
        // Get the newly created hypothesis
        const hypothesis = await storage.getHypothesisByFilename(filename);
        return res.json(hypothesis);
      }

      // Just create locally without pushing
      const hypothesis = await storage.createHypothesis({
        filename: `local-${Date.now()}.md`,
        title,
        content,
        summary: content.substring(0, 300),
        sha: "",
        status: "active",
      });
      
      res.json(hypothesis);
    } catch (error) {
      console.error("Error creating hypothesis:", error);
      res.status(500).json({ error: "Failed to create hypothesis" });
    }
  });

  app.patch("/api/hypotheses/:id", async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateHypothesis(req.params.id, { status });
      res.json(updated);
    } catch (error) {
      console.error("Error updating hypothesis:", error);
      res.status(500).json({ error: "Failed to update hypothesis" });
    }
  });

  app.delete("/api/hypotheses/:id", async (req, res) => {
    try {
      await storage.deleteHypothesis(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting hypothesis:", error);
      res.status(500).json({ error: "Failed to delete hypothesis" });
    }
  });

  // Project-Hypothesis Links
  app.get("/api/research/projects/:projectId/hypotheses", async (req, res) => {
    try {
      const links = await storage.getProjectHypotheses(req.params.projectId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching project hypotheses:", error);
      res.status(500).json({ error: "Failed to fetch project hypotheses" });
    }
  });

  app.get("/api/hypotheses/:hypothesisId/projects", async (req, res) => {
    try {
      const links = await storage.getHypothesisProjects(req.params.hypothesisId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching hypothesis projects:", error);
      res.status(500).json({ error: "Failed to fetch hypothesis projects" });
    }
  });

  app.post("/api/research/projects/:projectId/hypotheses", async (req, res) => {
    try {
      const { hypothesisId, relationship } = req.body;
      const link = await storage.linkProjectHypothesis({
        projectId: req.params.projectId,
        hypothesisId,
        relationship: relationship || "tests",
      });
      res.json(link);
    } catch (error) {
      console.error("Error linking project to hypothesis:", error);
      res.status(500).json({ error: "Failed to link project to hypothesis" });
    }
  });

  app.delete("/api/research/projects/:projectId/hypotheses/:hypothesisId", async (req, res) => {
    try {
      await storage.unlinkProjectHypothesis(req.params.projectId, req.params.hypothesisId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unlinking project from hypothesis:", error);
      res.status(500).json({ error: "Failed to unlink project from hypothesis" });
    }
  });

  return httpServer;
}

async function processSlackCommand(command: string): Promise<string> {
  const parts = command.trim().split(" ");
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case "/status":
      const repos = await storage.getActiveRepositories();
      return `System Status: ${repos.length} repositories monitored. All systems operational.`;
    
    case "/repos":
      const allRepos = await storage.getActiveRepositories();
      return `Active Repositories:\n${allRepos.map(r => `• ${r.fullName} (${r.language})`).join("\n")}`;
    
    case "/help":
      return `Available commands:\n/status - System status\n/repos - List repositories\n/help - Show this help`;
    
    default:
      return `Command '${cmd}' received. Processing...`;
  }
}
