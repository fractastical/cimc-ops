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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Start the scheduler service
  schedulerService.start();

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

  // ============ Repositories ============
  app.get("/api/repositories", async (req, res) => {
    try {
      const repos = await storage.getActiveRepositories();
      
      // Get activity stats for each repo
      const reposWithActivity = await Promise.all(
        repos.map(async (repo) => {
          const activity = await storage.getActivityStats(repo.id, 60);
          return { ...repo, activity };
        })
      );
      
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
  app.post("/api/slack/send-summary", async (req, res) => {
    try {
      await schedulerService["sendDailySummary"]();
      res.json({ success: true, message: "Summary sent to Slack" });
    } catch (error) {
      console.error("Error sending summary:", error);
      res.status(500).json({ error: "Failed to send summary" });
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
