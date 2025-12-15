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
import { openAlexService } from "./services/openalex";

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

      // Also sync papers from paper-pipeline repo
      try {
        const papersResult = await githubService.syncPapers();
        console.log(`Auto-synced papers: ${papersResult.synced} new, ${papersResult.updated} updated`);
      } catch (error) {
        console.error("Failed to auto-sync papers:", error);
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
  // Check multiple indicators for production environment
  const isDevelopment = process.env.NODE_ENV === "development";
  const isProduction = process.env.NODE_ENV === "production" || !isDevelopment;
  
  if (isProduction) {
    console.log(`Production environment detected (NODE_ENV=${process.env.NODE_ENV}) - starting scheduler service...`);
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

  // Hypothesis Activity - must be before :id route
  app.get("/api/hypotheses/activity", async (req, res) => {
    try {
      const activity = await storage.getHypothesisActivity();
      res.json(activity);
    } catch (error) {
      console.error("Error fetching hypothesis activity:", error);
      res.status(500).json({ error: "Failed to fetch hypothesis activity" });
    }
  });

  app.get("/api/hypotheses/activity/timeline", async (req, res) => {
    try {
      const timeline = await storage.getHypothesisActivityTimeline();
      res.json(timeline);
    } catch (error) {
      console.error("Error fetching hypothesis activity timeline:", error);
      res.status(500).json({ error: "Failed to fetch hypothesis activity timeline" });
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
          "cimcai",
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
        await githubService.syncHypotheses("cimcai", "hypotheses", "");
        
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

  // ============ Papers Pipeline ============
  app.get("/api/papers", async (req, res) => {
    try {
      const papers = await storage.getPapers();
      res.json(papers);
    } catch (error) {
      console.error("Error fetching papers:", error);
      res.status(500).json({ error: "Failed to fetch papers" });
    }
  });

  app.post("/api/papers/sync", async (req, res) => {
    try {
      const result = await githubService.syncPapers("cimcai", "paper-pipeline");
      res.json(result);
    } catch (error) {
      console.error("Error syncing papers:", error);
      res.status(500).json({ error: "Failed to sync papers" });
    }
  });

  // Get papers with collaborators for ranking
  app.get("/api/papers/with-collaborators", async (req, res) => {
    try {
      const papers = await storage.getPapersWithCollaborators();
      const sortBy = req.query.sortBy as string;
      
      if (sortBy === "h-index") {
        papers.sort((a, b) => (b.maxHIndex || 0) - (a.maxHIndex || 0));
      }
      
      res.json(papers);
    } catch (error) {
      console.error("Error fetching papers with collaborators:", error);
      res.status(500).json({ error: "Failed to fetch papers" });
    }
  });

  // ============ Collaborators ============
  app.get("/api/collaborators", async (req, res) => {
    try {
      const collaborators = await storage.getCollaborators();
      res.json(collaborators);
    } catch (error) {
      console.error("Error fetching collaborators:", error);
      res.status(500).json({ error: "Failed to fetch collaborators" });
    }
  });

  app.post("/api/collaborators/search", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }
      
      const result = await openAlexService.lookupAndCreateCollaborator(name);
      res.json(result);
    } catch (error) {
      console.error("Error searching collaborator:", error);
      res.status(500).json({ error: "Failed to search collaborator" });
    }
  });

  app.post("/api/collaborators", async (req, res) => {
    try {
      const { name, openalexId, hIndex, citationCount, worksCount, institution, orcid } = req.body;
      
      const existing = await storage.getCollaboratorByName(name);
      if (existing) {
        return res.json(existing);
      }
      
      const collaborator = await storage.createCollaborator({
        name,
        openalexId: openalexId || null,
        hIndex: hIndex || null,
        citationCount: citationCount || null,
        worksCount: worksCount || null,
        institution: institution || null,
        orcid: orcid || null,
        lastSyncedAt: openalexId ? new Date() : null,
      });
      res.json(collaborator);
    } catch (error) {
      console.error("Error creating collaborator:", error);
      res.status(500).json({ error: "Failed to create collaborator" });
    }
  });

  app.post("/api/collaborators/:id/refresh", async (req, res) => {
    try {
      const collaborator = await storage.getCollaborator(req.params.id);
      if (!collaborator || !collaborator.openalexId) {
        return res.status(404).json({ error: "Collaborator not found or no OpenAlex ID" });
      }
      
      const updates = await openAlexService.refreshCollaboratorMetrics(collaborator.openalexId);
      if (!updates) {
        return res.status(500).json({ error: "Failed to refresh metrics" });
      }
      
      const updated = await storage.updateCollaborator(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error refreshing collaborator:", error);
      res.status(500).json({ error: "Failed to refresh collaborator" });
    }
  });

  app.delete("/api/collaborators/:id", async (req, res) => {
    try {
      await storage.deleteCollaborator(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting collaborator:", error);
      res.status(500).json({ error: "Failed to delete collaborator" });
    }
  });

  // Paper-Collaborator Links
  app.get("/api/papers/:paperId/collaborators", async (req, res) => {
    try {
      const links = await storage.getPaperCollaborators(req.params.paperId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching paper collaborators:", error);
      res.status(500).json({ error: "Failed to fetch paper collaborators" });
    }
  });

  app.post("/api/papers/:paperId/collaborators", async (req, res) => {
    try {
      const { collaboratorId, role } = req.body;
      const link = await storage.linkPaperCollaborator({
        paperId: req.params.paperId,
        collaboratorId,
        role: role || "author",
      });
      res.json(link);
    } catch (error) {
      console.error("Error linking paper to collaborator:", error);
      res.status(500).json({ error: "Failed to link paper to collaborator" });
    }
  });

  app.delete("/api/papers/:paperId/collaborators/:collaboratorId", async (req, res) => {
    try {
      await storage.unlinkPaperCollaborator(req.params.paperId, req.params.collaboratorId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unlinking paper from collaborator:", error);
      res.status(500).json({ error: "Failed to unlink paper from collaborator" });
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

  // ============ Embed Routes (Public, for iframing into external sites) ============
  
  // Get base URL for API calls within embeds
  const getBaseUrl = (req: any) => `${req.protocol}://${req.get('host')}`;

  // Index page listing all available embed endpoints
  app.get("/embed/charts", async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CIMC.AI - Embeddable Charts</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { 
      font-size: 1.75rem; 
      margin-bottom: 0.5rem;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .card {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .card p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem; }
    .endpoint {
      background: #0f172a;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      color: #10b981;
      word-break: break-all;
    }
    .preview-link {
      display: inline-block;
      margin-top: 0.75rem;
      color: #60a5fa;
      text-decoration: none;
      font-size: 0.85rem;
    }
    .preview-link:hover { text-decoration: underline; }
    .embed-code {
      margin-top: 1rem;
      background: #0f172a;
      padding: 1rem;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #94a3b8;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 CIMC.AI Embeddable Charts</h1>
    <p class="subtitle">Use these endpoints to embed live research charts into any website</p>
    
    <div class="card">
      <h2>Hypothesis Activity Timeline</h2>
      <p>Cumulative research updates over time for each hypothesis, displayed as a line chart</p>
      <div class="endpoint">${baseUrl}/embed/charts/hypotheses</div>
      <a href="/embed/charts/hypotheses" target="_blank" class="preview-link">→ Preview chart</a>
      <div class="embed-code">
        &lt;iframe src="${baseUrl}/embed/charts/hypotheses" width="100%" height="400" frameborder="0"&gt;&lt;/iframe&gt;
      </div>
    </div>
    
    <div class="card">
      <h2>Monthly Activity Chart</h2>
      <p>GitHub commits and research updates aggregated by month as a bar chart</p>
      <div class="endpoint">${baseUrl}/embed/charts/activity</div>
      <a href="/embed/charts/activity" target="_blank" class="preview-link">→ Preview chart</a>
      <div class="embed-code">
        &lt;iframe src="${baseUrl}/embed/charts/activity" width="100%" height="400" frameborder="0"&gt;&lt;/iframe&gt;
      </div>
    </div>
    
    <div class="card">
      <h2>Research Project Activity</h2>
      <p>Number of research updates per project, sorted by most active</p>
      <div class="endpoint">${baseUrl}/embed/charts/projects</div>
      <a href="/embed/charts/projects" target="_blank" class="preview-link">→ Preview chart</a>
      <div class="embed-code">
        &lt;iframe src="${baseUrl}/embed/charts/projects" width="100%" height="400" frameborder="0"&gt;&lt;/iframe&gt;
      </div>
    </div>
    
    <div class="card">
      <h2>All Activity Timeline (3 months)</h2>
      <p>Combined view of GitHub commits and research updates over the last 3 months, shown as a unified daily timeline</p>
      <div class="endpoint">${baseUrl}/embed/charts/all-activity</div>
      <a href="/embed/charts/all-activity" target="_blank" class="preview-link">→ Preview chart</a>
      <div class="embed-code">
        &lt;iframe src="${baseUrl}/embed/charts/all-activity" width="100%" height="500" frameborder="0"&gt;&lt;/iframe&gt;
      </div>
    </div>
  </div>
</body>
</html>`;
    res.type('html').send(html);
  });

  // Hypothesis Activity Timeline Embed
  app.get("/embed/charts/hypotheses", async (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hypothesis Activity - CIMC.AI</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      padding: 1rem;
    }
    .chart-container { 
      position: relative; 
      width: 100%; 
      height: calc(100vh - 2rem);
      min-height: 300px;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
    }
    .error { color: #ef4444; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <div class="chart-container">
    <div class="loading" id="loading">Loading chart data...</div>
    <canvas id="chart" style="display: none;"></canvas>
    <div class="error" id="error" style="display: none;"></div>
  </div>
  <script>
    const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
    
    async function loadChart() {
      try {
        // Use absolute URL based on current page origin
        const apiUrl = window.location.origin + '/api/hypotheses/activity/timeline';
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!data || data.length === 0) {
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          document.getElementById('error').textContent = 'No hypothesis data available';
          return;
        }
        
        // Get labels from first hypothesis timeline
        const labels = data[0].data.map(d => d.week);
        
        // Build cumulative datasets
        const datasets = data.map((h, idx) => {
          let cumulative = 0;
          const cumulativeData = h.data.map(d => {
            cumulative += d.count;
            return cumulative;
          });
          return {
            label: h.hypothesisTitle,
            data: cumulativeData,
            borderColor: COLORS[idx % COLORS.length],
            backgroundColor: COLORS[idx % COLORS.length] + '20',
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5
          };
        });
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('chart').style.display = 'block';
        
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'bottom',
                labels: { color: '#94a3b8', font: { size: 11 } }
              },
              title: {
                display: true,
                text: 'Hypothesis Activity Over Time',
                color: '#e2e8f0',
                font: { size: 14, weight: 'bold' }
              }
            },
            scales: {
              x: { 
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              },
              y: { 
                beginAtZero: true,
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              }
            }
          }
        });
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Failed to load chart: ' + err.message;
      }
    }
    loadChart();
  </script>
</body>
</html>`;
    res.type('html').send(html);
  });

  // Monthly Activity Bar Chart Embed
  app.get("/embed/charts/activity", async (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monthly Activity - CIMC.AI</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      padding: 1rem;
    }
    .chart-container { 
      position: relative; 
      width: 100%; 
      height: calc(100vh - 2rem);
      min-height: 300px;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
    }
    .error { color: #ef4444; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <div class="chart-container">
    <div class="loading" id="loading">Loading chart data...</div>
    <canvas id="chart" style="display: none;"></canvas>
    <div class="error" id="error" style="display: none;"></div>
  </div>
  <script>
    async function loadChart() {
      try {
        const apiUrl = window.location.origin + '/api/activity/monthly';
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!data || data.length === 0) {
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          document.getElementById('error').textContent = 'No activity data available';
          return;
        }
        
        const labels = data.map(d => d.month);
        const commits = data.map(d => d.commits);
        const updates = data.map(d => d.researchUpdates);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('chart').style.display = 'block';
        
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'GitHub Commits',
                data: commits,
                backgroundColor: '#10b981',
                borderRadius: 4
              },
              {
                label: 'Research Updates',
                data: updates,
                backgroundColor: '#3b82f6',
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'bottom',
                labels: { color: '#94a3b8', font: { size: 11 } }
              },
              title: {
                display: true,
                text: 'Monthly Activity',
                color: '#e2e8f0',
                font: { size: 14, weight: 'bold' }
              }
            },
            scales: {
              x: { 
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              },
              y: { 
                beginAtZero: true,
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              }
            }
          }
        });
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Failed to load chart: ' + err.message;
      }
    }
    loadChart();
  </script>
</body>
</html>`;
    res.type('html').send(html);
  });

  // Research Projects Activity Bar Chart Embed
  app.get("/embed/charts/projects", async (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Research Projects - CIMC.AI</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      padding: 1rem;
    }
    .chart-container { 
      position: relative; 
      width: 100%; 
      height: calc(100vh - 2rem);
      min-height: 300px;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
    }
    .error { color: #ef4444; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <div class="chart-container">
    <div class="loading" id="loading">Loading chart data...</div>
    <canvas id="chart" style="display: none;"></canvas>
    <div class="error" id="error" style="display: none;"></div>
  </div>
  <script>
    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
    
    async function loadChart() {
      try {
        const apiUrl = window.location.origin + '/api/research/timeline';
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!data || !Array.isArray(data) || data.length === 0) {
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
          document.getElementById('error').textContent = 'No project data available';
          return;
        }
        
        // Sort by number of updates descending
        const sorted = data
          .map(p => ({ name: p.project?.name || 'Unknown', updates: p.updates?.length || 0 }))
          .sort((a, b) => b.updates - a.updates);
        
        const labels = sorted.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name);
        const values = sorted.map(p => p.updates);
        const colors = sorted.map((_, i) => COLORS[i % COLORS.length]);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('chart').style.display = 'block';
        
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Research Updates',
              data: values,
              backgroundColor: colors,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: {
                display: true,
                text: 'Research Project Activity',
                color: '#e2e8f0',
                font: { size: 14, weight: 'bold' }
              }
            },
            scales: {
              x: { 
                beginAtZero: true,
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              },
              y: { 
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { display: false }
              }
            }
          }
        });
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Failed to load chart: ' + err.message;
      }
    }
    loadChart();
  </script>
</body>
</html>`;
    res.type('html').send(html);
  });

  // Combined All Activity Timeline Embed (3 months)
  app.get("/embed/charts/all-activity", async (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Activity Timeline - CIMC.AI</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/date-fns@3.6.0/cdn.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      padding: 1rem;
    }
    .chart-container { 
      position: relative; 
      width: 100%; 
      height: calc(100vh - 2rem);
      min-height: 400px;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
    }
    .error { color: #ef4444; text-align: center; padding: 2rem; }
    .stats {
      display: flex;
      gap: 2rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .stat-value { font-weight: bold; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="chart-container">
    <div class="loading" id="loading">Loading activity data...</div>
    <div id="content" style="display: none;">
      <div class="stats" id="stats"></div>
      <canvas id="chart"></canvas>
    </div>
    <div class="error" id="error" style="display: none;"></div>
  </div>
  <script>
    async function loadChart() {
      try {
        const apiUrl = window.location.origin;
        
        // Fetch both activity and research timeline (include credentials for auth)
        const [activityRes, timelineRes] = await Promise.all([
          fetch(apiUrl + '/api/activity?days=90', { credentials: 'include' }),
          fetch(apiUrl + '/api/research/timeline', { credentials: 'include' })
        ]);
        
        const activity = await activityRes.json();
        const timeline = await timelineRes.json();
        
        // Handle error responses
        if (!Array.isArray(activity)) {
          throw new Error('Unable to load activity data');
        }
        if (!Array.isArray(timeline)) {
          throw new Error('Unable to load research timeline');
        }
        
        // Build daily counts for last 90 days
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 90);
        
        const dailyData = {};
        
        // Initialize all days
        for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().split('T')[0];
          dailyData[key] = { commits: 0, research: 0 };
        }
        
        // Count GitHub activity (commits, pushes)
        let totalCommits = 0;
        for (const event of activity) {
          if (event.eventType === 'commit' || event.eventType === 'push') {
            // Use activityDate if available, otherwise fall back to createdAt
            const eventDate = event.activityDate || event.createdAt;
            if (!eventDate) continue;
            const date = new Date(eventDate).toISOString().split('T')[0];
            if (dailyData[date]) {
              dailyData[date].commits++;
              totalCommits++;
            }
          }
        }
        
        // Count research updates
        let totalResearch = 0;
        for (const project of timeline) {
          for (const update of project.updates) {
            const date = new Date(update.date).toISOString().split('T')[0];
            if (dailyData[date]) {
              dailyData[date].research++;
              totalResearch++;
            }
          }
        }
        
        // Convert to arrays for Chart.js
        const sortedDates = Object.keys(dailyData).sort();
        const labels = sortedDates.map(d => {
          const date = new Date(d);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        const commits = sortedDates.map(d => dailyData[d].commits);
        const research = sortedDates.map(d => dailyData[d].research);
        
        // Show stats
        document.getElementById('stats').innerHTML = 
          '<div>GitHub Commits: <span class="stat-value">' + totalCommits + '</span></div>' +
          '<div>Research Updates: <span class="stat-value">' + totalResearch + '</span></div>' +
          '<div>Total Activity: <span class="stat-value">' + (totalCommits + totalResearch) + '</span></div>';
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'GitHub Commits',
                data: commits,
                backgroundColor: '#10b981',
                borderRadius: 2,
                barPercentage: 0.9,
                categoryPercentage: 1.0
              },
              {
                label: 'Research Updates',
                data: research,
                backgroundColor: '#3b82f6',
                borderRadius: 2,
                barPercentage: 0.9,
                categoryPercentage: 1.0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              intersect: false,
              mode: 'index'
            },
            plugins: {
              legend: { 
                position: 'bottom',
                labels: { color: '#94a3b8', font: { size: 11 } }
              },
              title: {
                display: true,
                text: 'All Activity - Last 3 Months',
                color: '#e2e8f0',
                font: { size: 14, weight: 'bold' }
              },
              tooltip: {
                callbacks: {
                  title: function(context) {
                    return context[0].label;
                  }
                }
              }
            },
            scales: {
              x: { 
                stacked: true,
                ticks: { 
                  color: '#94a3b8', 
                  font: { size: 9 },
                  maxRotation: 45,
                  autoSkip: true,
                  maxTicksLimit: 15
                },
                grid: { display: false }
              },
              y: { 
                stacked: true,
                beginAtZero: true,
                ticks: { 
                  color: '#94a3b8', 
                  font: { size: 10 },
                  stepSize: 1
                },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
              }
            }
          }
        });
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Failed to load chart: ' + err.message;
      }
    }
    loadChart();
  </script>
</body>
</html>`;
    res.type('html').send(html);
  });

  // ============ Monthly PDF Report ============
  app.get("/api/reports/monthly-pdf", async (req, res) => {
    try {
      const { reportService } = await import("./services/report");
      const pdf = await reportService.generateMonthlyPDF();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=monthly-report.pdf");
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF report:", error);
      res.status(500).json({ error: "Failed to generate PDF report" });
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
