import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertIntegrationSettingsSchema, 
  insertRepositorySchema,
  insertSlackMessageSchema,
  insertMilestoneSchema,
  insertMilestoneSubmissionSchema,
  insertTeamLeadSchema,
  insertAdminEmailSchema,
  insertMicrograntApplicationSchema,
} from "@shared/schema";
import { splitGranteeNames } from "./utils";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { emailService } from "./services/email";
import { githubService } from "./services/github";
import { slackService } from "./services/slack";
import { schedulerService } from "./services/scheduler";
import { openAlexService } from "./services/openalex";
import { notionService } from "./services/notion";
import { gdriveService } from "./services/gdrive";
import { parseTranscript, type ParsedUpdate } from "./services/transcript-parser";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

async function autoSyncOnStartup() {
  console.log("Running auto-sync on startup...");
  try {
    const settings = await storage.getIntegrationSettings();
    
    // Use githubOrganization (singular) from database, support comma-separated orgs
    const githubOrgs = settings?.githubOrganization 
      ? settings.githubOrganization.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    
    if (githubOrgs.length > 0) {
      console.log(`Auto-syncing ${githubOrgs.length} GitHub organization(s)...`);
      for (const org of githubOrgs) {
        try {
          await githubService.syncOrganization(org);
          console.log(`Auto-synced org: ${org}`);
        } catch (error) {
          console.error(`Failed to auto-sync org ${org}:`, error);
        }
      }
      
      // Also sync hypotheses from default repo
      try {
        const result = await githubService.syncHypotheses("cimcai", "hypotheses", "");
        console.log(`Auto-synced hypotheses: ${result.synced} synced, ${result.updated} updated`);
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
    } else {
      console.log("No GitHub organizations configured for auto-sync");
    }
  } catch (error) {
    console.error("Auto-sync failed:", error);
  }
}

function parseJsonArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [val];
  } catch {
    return val ? [val] : [];
  }
}

function normalizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestProjectMatch(parsedName: string, existingProjects: { id: string; name: string }[]): { id: string; name: string } | null {
  if (existingProjects.length === 0) return null;

  const normalizedParsed = normalizeProjectName(parsedName);
  const parsedWords = normalizedParsed.split(' ').filter(w => w.length > 2);
  
  let bestMatch: { id: string; name: string } | null = null;
  let bestScore = 0;

  for (const proj of existingProjects) {
    const normalizedExisting = normalizeProjectName(proj.name);
    
    if (normalizedExisting === normalizedParsed) return proj;
    
    if (normalizedExisting.includes(normalizedParsed) || normalizedParsed.includes(normalizedExisting)) {
      const score = Math.min(normalizedParsed.length, normalizedExisting.length) / Math.max(normalizedParsed.length, normalizedExisting.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = proj;
      }
      continue;
    }

    const existingWords = normalizedExisting.split(' ').filter(w => w.length > 2);
    const commonWords = parsedWords.filter(w => existingWords.some(ew => ew.includes(w) || w.includes(ew)));
    const wordOverlap = commonWords.length / Math.max(parsedWords.length, existingWords.length);
    
    if (wordOverlap > bestScore) {
      bestScore = wordOverlap;
      bestMatch = proj;
    }
  }

  if (bestScore >= 0.5) return bestMatch;
  return null;
}

async function importParsedUpdates(parsed: ParsedUpdate[]): Promise<{ updatesAdded: number; projectCount: number }> {
  const projectColors = [
    "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", 
    "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
  ];
  let colorIndex = 0;
  const projectMap = new Map<string, string>();
  let updatesAdded = 0;

  const allProjects = await storage.getResearchProjects();
  const projectList = allProjects.map(p => ({ id: p.id, name: p.name }));

  for (const note of parsed) {
    let projectId = projectMap.get(note.project);
    if (!projectId) {
      let project = await storage.getResearchProjectByName(note.project);
      
      if (!project) {
        const fuzzyMatch = findBestProjectMatch(note.project, projectList);
        if (fuzzyMatch) {
          project = allProjects.find(p => p.id === fuzzyMatch.id) || await storage.getResearchProject(fuzzyMatch.id);
          if (project) {
            console.log(`Fuzzy matched "${note.project}" -> "${fuzzyMatch.name}"`);
          }
        }
      }
      
      if (!project) {
        project = await storage.createResearchProject({
          name: note.project,
          description: `Research project: ${note.project}`,
          color: projectColors[colorIndex % projectColors.length],
        });
        projectList.push({ id: project.id, name: project.name });
        allProjects.push(project);
        colorIndex++;
      }
      projectId = project.id;
      projectMap.set(note.project, projectId);
    }

    const granteeMatch = note.description.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
    const grantee = note.grantee || (granteeMatch ? granteeMatch[1] : undefined);

    await storage.createResearchUpdate({
      projectId,
      date: new Date(note.date),
      description: note.description,
      grantee,
    });
    updatesAdded++;
  }

  return { updatesAdded, projectCount: projectMap.size };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up Replit Auth BEFORE other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
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

  // Summary endpoint: Research vs Code activity by week
  app.get("/api/activity/summary", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 90;
      
      // Helper to get week key (start of week - Sunday)
      const getWeekKey = (date: Date): string => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const weekStart = new Date(d.setDate(diff));
        return weekStart.toISOString().split('T')[0];
      };
      
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - days);
      
      // Initialize weekly buckets with detailed tracking
      const weeklyData: Record<string, { 
        research: number; 
        code: number;
        repos: Set<string>;
        papers: number;
        updates: number;
      }> = {};
      for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 7)) {
        const key = getWeekKey(d);
        weeklyData[key] = { research: 0, code: 0, repos: new Set(), papers: 0, updates: 0 };
      }
      
      // Get all repos for name lookup
      const allRepos = await storage.getRepositories();
      const repoMap = new Map(allRepos.map(r => [r.id, r.name]));
      
      // 1. Get GitHub activity (commits, pushes) - paper-pipeline goes to research, others to code
      const activities = await storage.getActivitySince(startDate);
      for (const event of activities) {
        if (event.eventType === 'commit' || event.eventType === 'push') {
          const eventDate = event.activityDate || event.createdAt;
          const weekKey = getWeekKey(new Date(eventDate));
          if (weeklyData[weekKey]) {
            const repoName = repoMap.get(event.repositoryId);
            // paper-pipeline commits count as research
            if (repoName && repoName.toLowerCase().includes('paper-pipeline')) {
              weeklyData[weekKey].research++;
              weeklyData[weekKey].papers++; // Count as paper activity
            } else {
              weeklyData[weekKey].code++;
              if (repoName) weeklyData[weekKey].repos.add(repoName);
            }
          }
        }
      }
      
      // 2. RESEARCH: Get research updates
      const allUpdates = await storage.getResearchUpdates();
      for (const update of allUpdates) {
        if (update.date >= startDate) {
          const weekKey = getWeekKey(new Date(update.date));
          if (weeklyData[weekKey]) {
            weeklyData[weekKey].research++;
            weeklyData[weekKey].updates++;
          }
        }
      }
      
      // 3. RESEARCH: Get papers (count by lastUpdated or syncedAt)
      const allPapers = await storage.getPapers();
      for (const paper of allPapers) {
        const paperDate = paper.lastUpdated || paper.syncedAt;
        if (paperDate && new Date(paperDate) >= startDate) {
          const weekKey = getWeekKey(new Date(paperDate));
          if (weeklyData[weekKey]) {
            weeklyData[weekKey].research++;
            weeklyData[weekKey].papers++;
          }
        }
      }
      
      // Convert to array format for the chart
      const sortedWeeks = Object.keys(weeklyData).sort();
      const result = sortedWeeks.map(week => ({
        week,
        label: 'Week of ' + new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        research: weeklyData[week].research,
        code: weeklyData[week].code,
        repos: Array.from(weeklyData[week].repos),
        papers: weeklyData[week].papers,
        updates: weeklyData[week].updates
      }));
      
      // Calculate totals
      const totals = result.reduce((acc, w) => ({
        research: acc.research + w.research,
        code: acc.code + w.code
      }), { research: 0, code: 0 });
      
      res.json({ weeks: result, totals });
    } catch (error) {
      console.error("Error fetching activity summary:", error);
      res.status(500).json({ error: "Failed to fetch activity summary" });
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

  // === Google Drive Integration Routes ===
  
  app.get("/api/gdrive/folders", async (req, res) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const search = req.query.search as string | undefined;
      if (search) {
        const folders = await gdriveService.searchFolders(search);
        return res.json(folders);
      }
      const folders = await gdriveService.listFolders(parentId);
      res.json(folders);
    } catch (error: any) {
      console.error("Error listing Drive folders:", error);
      res.status(500).json({ error: error.message || "Failed to list folders" });
    }
  });

  app.get("/api/gdrive/files", async (req, res) => {
    try {
      const folderId = req.query.folderId as string;
      if (!folderId) return res.status(400).json({ error: "folderId required" });
      const files = await gdriveService.listFiles(folderId);
      const importedIds = await storage.getGdriveImportedFileIds();
      const withStatus = files.map(f => ({
        ...f,
        imported: importedIds.includes(f.id),
      }));
      res.json(withStatus);
    } catch (error: any) {
      console.error("Error listing Drive files:", error);
      res.status(500).json({ error: error.message || "Failed to list files" });
    }
  });

  app.post("/api/gdrive/import", async (req, res) => {
    try {
      const { fileIds, folderIds } = req.body as { fileIds?: string[]; folderIds?: string[] };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      const settings = await storage.getIntegrationSettings();
      const targetFolderIds = folderIds || parseJsonArray(settings?.gdriveFolderId);

      if (targetFolderIds.length === 0) {
        sendEvent({ type: "done", success: true, message: "No folders configured", imported: 0, updatesCreated: 0 });
        res.end();
        return;
      }

      sendEvent({ type: "status", message: "Scanning folders for files..." });

      let filesToProcess: { id: string; name: string; mimeType: string }[] = [];
      const importedIds = await storage.getGdriveImportedFileIds();

      for (const fid of targetFolderIds) {
        const allFiles = await gdriveService.listFiles(fid);
        if (fileIds && fileIds.length > 0) {
          filesToProcess.push(...allFiles.filter(f => fileIds.includes(f.id)));
        } else {
          filesToProcess.push(...allFiles.filter(f => !importedIds.includes(f.id)));
        }
      }

      if (filesToProcess.length === 0) {
        sendEvent({ type: "done", success: true, message: "No new files to import", imported: 0, updatesCreated: 0 });
        res.end();
        return;
      }

      sendEvent({ type: "status", message: `Found ${filesToProcess.length} files to process`, total: filesToProcess.length });

      const projects = await storage.getResearchProjects();
      const existingProjectNames = projects.map(p => p.name);
      let totalUpdates = 0;
      let filesImported = 0;

      const keepAlive = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch (_) {}
      }, 15000);

      try {
        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          try {
            sendEvent({ type: "progress", current: i + 1, total: filesToProcess.length, fileName: file.name, message: `Processing ${i + 1}/${filesToProcess.length}: ${file.name}` });

            const text = await gdriveService.getFileAsText(file.id, file.mimeType);
            if (!text || text.trim().length < 50) {
              sendEvent({ type: "file_done", fileName: file.name, updates: 0, skipped: true });
              continue;
            }

            const parsed = await parseTranscript(text, file.name, existingProjectNames);
            
            if (parsed.length > 0) {
              const importRes = await importParsedUpdates(parsed);
              await storage.markGdriveFileImported(file.id, file.name, parsed.length);
              totalUpdates += importRes.updatesAdded;
              filesImported++;
              for (const p of parsed) {
                if (!existingProjectNames.includes(p.project)) {
                  existingProjectNames.push(p.project);
                }
              }
              sendEvent({ type: "file_done", fileName: file.name, updates: importRes.updatesAdded });
            } else {
              sendEvent({ type: "file_done", fileName: file.name, updates: 0 });
              filesImported++;
            }
          } catch (fileError: any) {
            console.error(`Error processing file ${file.name}:`, fileError);
            sendEvent({ type: "file_error", fileName: file.name, error: fileError.message || "Unknown error" });
          }
        }
      } finally {
        clearInterval(keepAlive);
      }

      await storage.updateGdriveSettings({ lastGdriveSyncAt: new Date() });

      sendEvent({ type: "done", success: true, message: `Imported ${totalUpdates} updates from ${filesImported} files`, imported: filesImported, updatesCreated: totalUpdates });
      res.end();
    } catch (error: any) {
      console.error("Error importing from Drive:", error);
      try {
        res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Failed to import" })}\n\n`);
        res.end();
      } catch (_) {
        // response already ended
      }
    }
  });

  app.post("/api/gdrive/settings", async (req, res) => {
    try {
      const { folders, autoSync } = req.body as { folders?: { id: string; name: string }[]; autoSync?: boolean };
      const updates: any = {};
      if (folders !== undefined) {
        updates.gdriveFolderId = JSON.stringify(folders.map(f => f.id));
        updates.gdriveFolderName = JSON.stringify(folders.map(f => f.name));
      }
      if (autoSync !== undefined) {
        updates.gdriveAutoSync = autoSync;
      }
      await storage.updateGdriveSettings(updates);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving Drive settings:", error);
      res.status(500).json({ error: error.message || "Failed to save settings" });
    }
  });

  app.get("/api/gdrive/settings", async (req, res) => {
    try {
      const settings = await storage.getIntegrationSettings();
      const folderIds = parseJsonArray(settings?.gdriveFolderId);
      const folderNames = parseJsonArray(settings?.gdriveFolderName);
      const folders = folderIds.map((id, i) => ({ id, name: folderNames[i] || id }));
      res.json({
        folders,
        autoSync: settings?.gdriveAutoSync || false,
        lastSyncAt: settings?.lastGdriveSyncAt || null,
      });
    } catch (error: any) {
      console.error("Error getting Drive settings:", error);
      res.status(500).json({ error: error.message || "Failed to get settings" });
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

  app.patch("/api/research/projects/:id", async (req, res) => {
    try {
      const { status, hIndex, name } = req.body;
      const updates: { status?: string; hIndex?: number; name?: string } = {};
      if (status !== undefined) updates.status = status;
      if (hIndex !== undefined) updates.hIndex = hIndex;
      if (name !== undefined) updates.name = name;
      
      const updated = await storage.updateResearchProject(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating research project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.post("/api/research/projects/merge", async (req, res) => {
    try {
      const { keepId, mergeIds } = req.body as { keepId: string; mergeIds: string[] };
      if (!keepId || !mergeIds || mergeIds.length === 0) {
        return res.status(400).json({ error: "keepId and mergeIds are required" });
      }
      const filteredMergeIds = mergeIds.filter(id => id !== keepId);
      if (filteredMergeIds.length === 0) {
        return res.status(400).json({ error: "Cannot merge a project with itself" });
      }
      const movedCount = await storage.mergeResearchProjects(keepId, filteredMergeIds);
      res.json({ success: true, updatesReassigned: movedCount });
    } catch (error) {
      console.error("Error merging projects:", error);
      res.status(500).json({ error: "Failed to merge projects" });
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
      max-width: 900px;
      margin: 0 auto;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 300px;
      color: #94a3b8;
    }
    .error { color: #ef4444; text-align: center; padding: 2rem; }
    .stats {
      display: flex;
      gap: 2rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      color: #94a3b8;
      flex-wrap: wrap;
    }
    .stat-value { font-weight: bold; color: #e2e8f0; }
    canvas { max-height: 400px; }
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
        
        // Fetch summary data (research vs code by week)
        const response = await fetch(apiUrl + '/api/activity/summary?days=90');
        const data = await response.json();
        
        if (!data || !data.weeks) {
          throw new Error('Unable to load activity data');
        }
        
        const { weeks, totals } = data;
        
        // Store weekly details for tooltip access
        window.weeklyDetails = weeks;
        
        const labels = weeks.map(w => w.label);
        const research = weeks.map(w => w.research);
        const code = weeks.map(w => w.code);
        
        // Show stats
        document.getElementById('stats').innerHTML = 
          '<div>Research Activity: <span class="stat-value">' + totals.research + '</span> (papers, updates, hypotheses)</div>' +
          '<div>Code Activity: <span class="stat-value">' + totals.code + '</span> (commits)</div>' +
          '<div>Total: <span class="stat-value">' + (totals.research + totals.code) + '</span></div>';
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        
        const ctx = document.getElementById('chart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Research (Papers, Updates, Hypotheses)',
                data: research,
                backgroundColor: '#3b82f6',
                borderRadius: 4
              },
              {
                label: 'Code (GitHub Commits)',
                data: code,
                backgroundColor: '#10b981',
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
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
                text: 'Research vs Code Activity - Last 3 Months',
                color: '#e2e8f0',
                font: { size: 14, weight: 'bold' }
              },
              tooltip: {
                callbacks: {
                  title: function(context) {
                    return context[0].label;
                  },
                  afterBody: function(context) {
                    const idx = context[0].dataIndex;
                    const weekData = window.weeklyDetails[idx];
                    if (!weekData) return '';
                    const lines = [];
                    if (weekData.repos && weekData.repos.length > 0) {
                      lines.push('Repos: ' + weekData.repos.join(', '));
                    }
                    if (weekData.papers > 0 || weekData.updates > 0) {
                      lines.push('Papers: ' + weekData.papers + ', Updates: ' + weekData.updates);
                    }
                    return lines.join('\\n');
                  }
                }
              }
            },
            scales: {
              x: { 
                ticks: { 
                  color: '#94a3b8', 
                  font: { size: 10 },
                  maxRotation: 45
                },
                grid: { display: false }
              },
              y: { 
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
      const months = Math.min(12, Math.max(1, parseInt(req.query.months as string) || 1));
      const { reportService } = await import("./services/report");
      const pdf = await reportService.generateMonthlyPDF(months);
      const label = months === 1 ? "monthly" : `${months}-month`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${label}-report.pdf`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF report:", error);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });

  // ============ Milestones ============
  app.get("/api/milestones", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const milestones = await storage.getMilestones(projectId);
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching milestones:", error);
      res.status(500).json({ error: "Failed to fetch milestones" });
    }
  });

  app.get("/api/milestones/:id", async (req, res) => {
    try {
      const milestone = await storage.getMilestone(req.params.id);
      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }
      res.json(milestone);
    } catch (error) {
      console.error("Error fetching milestone:", error);
      res.status(500).json({ error: "Failed to fetch milestone" });
    }
  });

  app.post("/api/milestones", async (req, res) => {
    try {
      const parsed = insertMilestoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const existing = await storage.getMilestoneByProjectAndMonth(parsed.data.projectId, parsed.data.month);
      if (existing) {
        return res.status(400).json({ error: "A milestone already exists for this project and month" });
      }
      const milestone = await storage.createMilestone(parsed.data);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      res.status(500).json({ error: "Failed to create milestone" });
    }
  });

  app.put("/api/milestones/:id", async (req, res) => {
    try {
      const parsed = insertMilestoneSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const milestone = await storage.updateMilestone(req.params.id, parsed.data);
      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }
      res.json(milestone);
    } catch (error) {
      console.error("Error updating milestone:", error);
      res.status(500).json({ error: "Failed to update milestone" });
    }
  });

  app.delete("/api/milestones/:id", async (req, res) => {
    try {
      await storage.deleteMilestone(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting milestone:", error);
      res.status(500).json({ error: "Failed to delete milestone" });
    }
  });

  // ============ Milestone Submissions ============
  app.get("/api/milestone-submissions", async (req, res) => {
    try {
      const milestoneId = req.query.milestoneId as string | undefined;
      const submissions = await storage.getMilestoneSubmissions(milestoneId);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.post("/api/milestone-submissions", async (req, res) => {
    try {
      const parsed = insertMilestoneSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const submission = await storage.createMilestoneSubmission(parsed.data);
      
      // Send notification to admins
      const adminEmails = await storage.getActiveAdminEmails();
      if (adminEmails.length > 0) {
        const milestone = await storage.getMilestone(parsed.data.milestoneId);
        const project = milestone ? await storage.getResearchProject(milestone.projectId) : null;
        const projectName = project?.name || "Unknown Project";
        const milestoneMonth = milestone?.month || "Unknown";
        
        await emailService.sendMilestoneSubmissionNotification(
          adminEmails,
          projectName,
          parsed.data.teamLeadName,
          milestoneMonth,
          parsed.data.progressSummary
        );
      }
      
      res.json(submission);
    } catch (error) {
      console.error("Error creating submission:", error);
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  // ============ Team Leads ============
  app.get("/api/team-leads", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const leads = await storage.getTeamLeads(projectId);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching team leads:", error);
      res.status(500).json({ error: "Failed to fetch team leads" });
    }
  });

  app.post("/api/team-leads", async (req, res) => {
    try {
      const parsed = insertTeamLeadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const lead = await storage.createTeamLead(parsed.data);
      res.json(lead);
    } catch (error) {
      console.error("Error creating team lead:", error);
      res.status(500).json({ error: "Failed to create team lead" });
    }
  });

  app.put("/api/team-leads/:id", async (req, res) => {
    try {
      const parsed = insertTeamLeadSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const lead = await storage.updateTeamLead(req.params.id, parsed.data);
      if (!lead) {
        return res.status(404).json({ error: "Team lead not found" });
      }
      res.json(lead);
    } catch (error) {
      console.error("Error updating team lead:", error);
      res.status(500).json({ error: "Failed to update team lead" });
    }
  });

  app.delete("/api/team-leads/:id", async (req, res) => {
    try {
      await storage.deleteTeamLead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team lead:", error);
      res.status(500).json({ error: "Failed to delete team lead" });
    }
  });

  // ============ Admin Emails ============
  app.get("/api/admin-emails", async (req, res) => {
    try {
      const emails = await storage.getAdminEmails();
      res.json(emails);
    } catch (error) {
      console.error("Error fetching admin emails:", error);
      res.status(500).json({ error: "Failed to fetch admin emails" });
    }
  });

  app.post("/api/admin-emails", async (req, res) => {
    try {
      const parsed = insertAdminEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const email = await storage.createAdminEmail(parsed.data);
      res.json(email);
    } catch (error) {
      console.error("Error creating admin email:", error);
      res.status(500).json({ error: "Failed to create admin email" });
    }
  });

  app.delete("/api/admin-emails/:id", async (req, res) => {
    try {
      await storage.deleteAdminEmail(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting admin email:", error);
      res.status(500).json({ error: "Failed to delete admin email" });
    }
  });

  // ============ Public Milestone Submission Page ============
  app.get("/api/submit-milestone/:milestoneId", async (req, res) => {
    try {
      const milestone = await storage.getMilestone(req.params.milestoneId);
      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }
      const project = await storage.getResearchProject(milestone.projectId);
      const settings = await storage.getIntegrationSettings();
      const globalQuestions = (settings?.milestoneQuestions as { label: string; required: boolean }[] | null) || [];
      const allMilestones = await storage.getMilestones();
      const projectMilestones = allMilestones
        .filter(m => m.projectId === milestone.projectId)
        .sort((a, b) => a.month.localeCompare(b.month));
      
      let teamLead = null;
      const leadId = req.query.leadId as string | undefined;
      if (leadId) {
        const leads = await storage.getTeamLeads(milestone.projectId);
        teamLead = leads.find(l => l.id === leadId) || null;
      }
      
      res.json({ milestone, project, globalQuestions, projectMilestones, teamLead });
    } catch (error) {
      console.error("Error fetching milestone for submission:", error);
      res.status(500).json({ error: "Failed to fetch milestone" });
    }
  });

  // ============ Manual Trigger for Milestone Reminders (Testing) ============
  app.post("/api/milestones/send-reminders", async (req, res) => {
    try {
      const testOnly = req.query.testOnly === "true" || req.body?.testOnly === true;
      await schedulerService.triggerMilestoneReminders({ testOnly });
      res.json({ success: true, message: testOnly ? "Test reminder sent to jdietz@gmail.com only" : "Milestone reminders sent" });
    } catch (error) {
      console.error("Error sending milestone reminders:", error);
      res.status(500).json({ error: "Failed to send milestone reminders" });
    }
  });

  // ============ Admin Action Logs ============
  app.get("/api/admin-actions", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const actions = await storage.getAdminActions(limit);
      res.json(actions);
    } catch (error) {
      console.error("Error fetching admin actions:", error);
      res.status(500).json({ error: "Failed to fetch admin actions" });
    }
  });

  // Helper to log admin action (used by other routes)
  const logAction = async (req: any, action: string, entityType?: string, entityId?: string, metadata?: any) => {
    try {
      const userId = req.user?.claims?.sub || "anonymous";
      const email = req.user?.claims?.email || null;
      await storage.logAdminAction({
        actorUserId: userId,
        actorEmail: email,
        action,
        entityType,
        entityId,
        metadata,
      });
    } catch (error) {
      console.error("Failed to log admin action:", error);
    }
  };

  // Attach logAction helper to app for use in other routes
  (app as any).logAction = logAction;

  // ============ Object Storage Routes ============
  registerObjectStorageRoutes(app);

  // ============ Microgrant Applications (Public) ============
  // Public endpoint - no auth required for submitting applications
  app.post("/api/microgrants/apply", async (req, res) => {
    try {
      const validatedData = insertMicrograntApplicationSchema.parse(req.body);
      const application = await storage.createMicrograntApplication(validatedData);
      
      // Send notification to admin emails
      try {
        const adminEmails = await storage.getActiveAdminEmails();
        if (adminEmails.length > 0) {
          await emailService.sendMicrograntNotification(application, adminEmails);
        }
      } catch (emailError) {
        console.error("Failed to send microgrant notification email:", emailError);
      }
      
      res.json({ success: true, id: application.id });
    } catch (error) {
      console.error("Error submitting microgrant application:", error);
      res.status(400).json({ error: "Invalid application data" });
    }
  });

  // Authenticated endpoints for viewing/managing applications
  app.get("/api/microgrants", isAuthenticated, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const applications = await storage.getMicrograntApplications(status);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching microgrant applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  app.get("/api/microgrants/:id", isAuthenticated, async (req, res) => {
    try {
      const application = await storage.getMicrograntApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      res.json(application);
    } catch (error) {
      console.error("Error fetching microgrant application:", error);
      res.status(500).json({ error: "Failed to fetch application" });
    }
  });

  app.patch("/api/microgrants/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updates = req.body;
      if (updates.status) {
        updates.reviewedAt = new Date();
      }
      const application = await storage.updateMicrograntApplication(req.params.id, updates);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      await logAction(req, "update_microgrant", "microgrant", req.params.id, updates);
      res.json(application);
    } catch (error) {
      console.error("Error updating microgrant application:", error);
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  // ============ Grant Comments ============
  app.get("/api/microgrants/:id/comments", isAuthenticated, async (req, res) => {
    try {
      const comments = await storage.getGrantComments(req.params.id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching grant comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/microgrants/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { comment, authorName } = req.body;
      if (!comment || !authorName) {
        return res.status(400).json({ error: "Comment and author name are required" });
      }
      const newComment = await storage.createGrantComment({
        applicationId: req.params.id,
        authorName,
        authorEmail: req.session?.email || null,
        comment,
      });
      res.json(newComment);
    } catch (error) {
      console.error("Error creating grant comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // ============ Visualization Data Endpoints (Public) ============

  // Viz 1: GitHub Activity - commits, PRs, issues per repo over time
  app.get("/api/viz/github", async (req, res) => {
    try {
      const activityLog = await storage.getRecentActivity(365);
      const repos = await storage.getActiveRepositories();
      const repoMap: Record<string, string> = {};
      for (const r of repos) repoMap[r.id] = r.name;

      const freq: Record<string, { count: number; category: string }> = {};
      for (const a of activityLog) {
        const repoName = a.repositoryId ? (repoMap[a.repositoryId] || "") : "";
        if (repoName) {
          if (!freq[repoName]) freq[repoName] = { count: 0, category: "repo" };
          freq[repoName].count++;
        }
        const author = a.author || "";
        if (author && author.length > 1) {
          if (!freq[author]) freq[author] = { count: 0, category: "author" };
          freq[author].count++;
        }
        const eventLabel = a.eventType === "push" ? "commit" : a.eventType === "pull_request" ? "PR" : a.eventType === "issues" ? "issue" : "";
        if (eventLabel) {
          if (!freq[eventLabel]) freq[eventLabel] = { count: 0, category: "event" };
          freq[eventLabel].count++;
        }
      }
      const tags = Object.entries(freq)
        .map(([word, { count, category }]) => ({ word, count, category }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 60);
      res.json({ title: "GITHUB ACTIVITY", subtitle: `${activityLog.length} events tracked`, tags });
    } catch (error) {
      console.error("Error generating GitHub viz data:", error);
      res.status(500).json({ error: "Failed to generate data" });
    }
  });

  // Viz 2: Research Activity - meeting updates, milestones, submissions over time
  app.get("/api/viz/research", async (req, res) => {
    try {
      const updates = await storage.getResearchUpdates();
      const milestones = await storage.getMilestones();
      const submissions = await storage.getMilestoneSubmissions();
      const projects = await storage.getResearchProjects();
      const repos = await storage.getRepositories();

      const projectMap: Record<string, string> = {};
      for (const p of projects) projectMap[p.id] = p.name;

      interface TagEntry {
        count: number;
        category: string;
        dates: number[];
        description?: string;
      }
      const freq: Record<string, TagEntry> = {};

      const addDate = (key: string, ts: number | undefined) => {
        if (ts && freq[key]) freq[key].dates.push(ts);
      };

      for (const p of projects) {
        if (!freq[p.name]) freq[p.name] = { count: 0, category: "project", dates: [] };
        freq[p.name].count += 3;
        addDate(p.name, new Date(p.createdAt).getTime());
      }

      for (const u of updates) {
        const raw = u.grantee || "";
        const names = splitGranteeNames(raw);
        const ts = u.date ? new Date(u.date).getTime() : undefined;
        for (const name of names) {
          if (!freq[name]) freq[name] = { count: 0, category: "person", dates: [] };
          freq[name].count++;
          if (ts) freq[name].dates.push(ts);
        }
      }

      for (const ml of milestones) {
        if (ml.description?.startsWith("[TEST]")) continue;
        const desc = ml.description || "";
        const ts = ml.month ? new Date(ml.month + "-15").getTime() : undefined;
        if (desc.length > 2) {
          const short = desc.substring(0, 30).trim();
          if (!freq[short]) freq[short] = { count: 0, category: "milestone", dates: [] };
          freq[short].count++;
          if (ts) freq[short].dates.push(ts);
        }
        const projName = ml.projectId ? (projectMap[ml.projectId] || "") : "";
        if (projName) {
          if (!freq[projName]) freq[projName] = { count: 0, category: "project", dates: [] };
          freq[projName].count++;
          if (ts) freq[projName].dates.push(ts);
        }
      }

      for (const s of submissions) {
        const name = s.teamLeadName || "";
        if (name && name.length > 1) {
          if (!freq[name]) freq[name] = { count: 0, category: "lead", dates: [] };
          freq[name].count++;
          const ts = s.submittedAt ? new Date(s.submittedAt).getTime() : undefined;
          if (ts) freq[name].dates.push(ts);
        }
      }

      const repoLangMap: Record<string, string> = {};
      const langDates: Record<string, number[]> = {};
      const langCounts: Record<string, number> = {};
      for (const repo of repos) {
        if (!repo.isActive) continue;
        const lang = repo.language || "Unknown";
        if (lang === "Unknown") continue;
        repoLangMap[repo.id] = lang;
        langCounts[lang] = (langCounts[lang] || 0) + 1;
        if (!langDates[lang]) langDates[lang] = [];
      }

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const allActivity = await storage.getActivitySince(since);
      for (const act of allActivity) {
        if (act.eventType !== "push" && act.eventType !== "commit") continue;
        const lang = repoLangMap[act.repositoryId];
        if (lang) {
          langCounts[lang] = (langCounts[lang] || 0) + 1;
          const ts = act.activityDate ? new Date(act.activityDate).getTime() : new Date(act.createdAt).getTime();
          langDates[lang].push(ts);
        }
      }

      for (const [lang, rawCount] of Object.entries(langCounts)) {
        const scaled = Math.min(Math.floor(rawCount / 5) + 2, 25);
        freq[lang] = { count: scaled, category: "language", dates: langDates[lang] || [] };
      }

      const repoActivityCounts: Record<string, number> = {};
      for (const act of allActivity) {
        if (act.eventType === "push" || act.eventType === "commit") {
          repoActivityCounts[act.repositoryId] = (repoActivityCounts[act.repositoryId] || 0) + 1;
        }
      }
      const maxRepoActivity = Math.max(1, ...Object.values(repoActivityCounts));
      for (const repo of repos) {
        if (!repo.isActive) continue;
        const label = repo.name;
        const activityCount = repoActivityCounts[repo.id] || 0;
        const normalized = activityCount / maxRepoActivity;
        const scaled = Math.max(1, Math.round(normalized * 30));
        const dates: number[] = [];
        const createdTs = new Date(repo.createdAt).getTime();
        dates.push(createdTs);
        if (repo.updatedAt) dates.push(new Date(repo.updatedAt).getTime());
        freq[label] = {
          count: scaled,
          category: "repo",
          dates,
          description: repo.description || undefined,
        };
      }

      const stopWords = new Set([
        "the", "and", "for", "from", "with", "this", "that", "into", "not",
        "are", "was", "were", "been", "have", "has", "had", "but", "all",
        "can", "will", "just", "more", "some", "than", "them", "then",
        "also", "only", "each", "when", "what", "which", "their", "about",
        "would", "make", "like", "been", "could", "after", "before", "should",
        "merge", "pull", "request", "commit", "update", "fix", "add", "feat",
        "chore", "docs", "style", "refactor", "test", "build", "bump",
        "version", "release", "readme", "updated", "added", "fixed", "removed",
        "changes", "change", "minor", "main", "branch", "master", "wip",
        "initial", "first", "new", "file", "files", "code", "use", "using",
        "now", "set", "get", "done", "todo", "moved", "check", "still",
        "noreply", "anthropic", "authored", "co-authored-by", "claude",
        "opus", "sonnet", "replit", "create", "remove", "delete", "move",
        "rename", "implement", "improve", "handle", "ensure", "allow",
        "support", "enable", "include", "display", "show", "hide", "clean",
        "issue", "issues", "link", "site", "page", "data", "type", "types",
        "error", "errors", "work", "working", "updates", "commits", "contributor",
        "config", "path", "based", "added", "default", "properly", "correctly",
        "better", "small", "large", "start", "stop", "run", "running"
      ]);
      const commitKeywords: Record<string, { count: number; dates: number[] }> = {};
      const pushEvents = allActivity.filter(a => a.eventType === "push" || a.eventType === "commit");
      const seenMessages = new Set<string>();
      for (const act of pushEvents) {
        const firstLine = act.message.split("\n")[0].trim();
        if (seenMessages.has(firstLine)) continue;
        seenMessages.add(firstLine);
        if (firstLine.startsWith("Merge pull request") || firstLine.startsWith("Merge branch")) continue;
        const ts = act.activityDate ? new Date(act.activityDate).getTime() : new Date(act.createdAt).getTime();
        const words = firstLine
          .replace(/[^a-zA-Z0-9_-]/g, " ")
          .split(/\s+/)
          .filter(w => w.length >= 4 && w.length <= 30)
          .map(w => w.toLowerCase());
        for (const w of words) {
          if (stopWords.has(w) || /^\d+$/.test(w)) continue;
          if (!commitKeywords[w]) commitKeywords[w] = { count: 0, dates: [] };
          commitKeywords[w].count++;
          commitKeywords[w].dates.push(ts);
        }
      }

      const topKeywords = Object.entries(commitKeywords)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20);
      for (const [word, kw] of topKeywords) {
        if (kw.count >= 2 && !freq[word]) {
          freq[word] = { count: Math.min(kw.count, 20), category: "commit_keyword", dates: kw.dates };
        }
      }

      const total = updates.length + milestones.length + submissions.length;
      const tags = Object.entries(freq)
        .map(([word, entry]) => {
          const sorted = entry.dates.sort((a, b) => a - b);
          const minDate = sorted.length > 0 ? sorted[0] : null;
          const maxDate = sorted.length > 0 ? sorted[sorted.length - 1] : null;
          const meanDate = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
          return { word, count: entry.count, category: entry.category, minDate, maxDate, meanDate, description: entry.description || null };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);

      const allDates = tags.filter(t => t.meanDate).map(t => t.meanDate!);
      const globalMinDate = allDates.length > 0 ? Math.min(...allDates) : Date.now() - 90 * 86400000;
      const globalMaxDate = allDates.length > 0 ? Math.max(...allDates) : Date.now();

      res.json({
        title: "RESEARCH ACTIVITY",
        subtitle: `${total} research events · ${repos.filter(r => r.isActive).length} repos · ${pushEvents.length} commits`,
        tags,
        dateRange: { min: globalMinDate, max: globalMaxDate },
      });
    } catch (error) {
      console.error("Error generating research viz data:", error);
      res.status(500).json({ error: "Failed to generate data" });
    }
  });

  // Viz 3: Communications - Slack messages, bot vs human, channels over time
  app.get("/api/viz/comms", async (req, res) => {
    try {
      const messages = await storage.getRecentSlackMessages(1000);

      const freq: Record<string, { count: number; category: string }> = {};
      for (const m of messages) {
        const user = m.user || "";
        if (user && user.length > 1) {
          if (!freq[user]) freq[user] = { count: 0, category: m.isBot ? "bot" : "human" };
          freq[user].count++;
        }
        const channel = m.channel || "";
        if (channel && channel.length > 1) {
          if (!freq[channel]) freq[channel] = { count: 0, category: "channel" };
          freq[channel].count++;
        }
        const words = m.message.replace(/[:*_~`\[\](){}]/g, " ").split(/\s+/).filter(w => w.length > 4);
        for (const w of words.slice(0, 3)) {
          const lower = w.toLowerCase();
          if (!freq[lower]) freq[lower] = { count: 0, category: "keyword" };
          freq[lower].count++;
        }
      }
      const tags = Object.entries(freq)
        .map(([word, { count, category }]) => ({ word, count, category }))
        .filter(t => t.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 60);
      res.json({ title: "COMMUNICATIONS", subtitle: `${messages.length} messages analyzed`, tags });
    } catch (error) {
      console.error("Error generating comms viz data:", error);
      res.status(500).json({ error: "Failed to generate data" });
    }
  });

  // Notion integration routes
  app.get("/api/notion/databases", isAuthenticated, async (req, res) => {
    try {
      const databases = await notionService.listDatabases();
      res.json(databases);
    } catch (error: any) {
      console.error("Error listing Notion databases:", error);
      res.status(500).json({ error: error.message || "Failed to list databases" });
    }
  });

  app.get("/api/notion/databases/:databaseId", isAuthenticated, async (req, res) => {
    try {
      const entries = await notionService.queryDatabase(req.params.databaseId);
      res.json(entries);
    } catch (error: any) {
      console.error("Error querying Notion database:", error);
      res.status(500).json({ error: error.message || "Failed to query database" });
    }
  });

  app.get("/api/notion/pages/:pageId", isAuthenticated, async (req, res) => {
    try {
      const page = await notionService.getPageContent(req.params.pageId);
      res.json(page);
    } catch (error: any) {
      console.error("Error fetching Notion page:", error);
      res.status(500).json({ error: error.message || "Failed to fetch page" });
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
