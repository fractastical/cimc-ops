import { storage } from "../storage";
import { slackService } from "./slack";
import { githubService } from "./github";
import { subDays, subMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay } from "date-fns";

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type SummaryType = "repo" | "research" | "both";
export type TimeFrame = "daily" | "weekly" | "monthly" | "quarterly";

export class SchedulerService {
  private checkInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;

  async start() {
    console.log("Starting scheduler service...");
    
    // Check every hour if we should send summaries
    this.checkInterval = setInterval(async () => {
      await this.checkSummaries();
    }, 60 * 60 * 1000); // Every hour

    // Sync GitHub every 6 hours
    this.syncInterval = setInterval(async () => {
      await this.syncGitHub();
    }, 6 * 60 * 60 * 1000); // Every 6 hours

    // Also check on start (with a delay to avoid startup race conditions)
    setTimeout(() => this.checkSummaries(), 10000);
    
    // Do an initial GitHub sync shortly after startup
    setTimeout(() => this.syncGitHub(), 30000);
  }
  
  private async syncGitHub() {
    try {
      console.log("Running scheduled GitHub sync...");
      const settings = await storage.getIntegrationSettings();
      if (settings?.githubOrgs && settings.githubOrgs.length > 0) {
        for (const org of settings.githubOrgs) {
          try {
            await githubService.syncOrganization(org);
            console.log(`Synced org: ${org}`);
          } catch (error) {
            console.error(`Failed to sync org ${org}:`, error);
          }
        }
      }
      this.lastSyncTime = new Date();
      console.log("GitHub sync completed at", this.lastSyncTime.toISOString());
    } catch (error) {
      console.error("GitHub sync failed:", error);
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async checkSummaries() {
    const settings = await storage.getIntegrationSettings();
    if (!settings) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = DAYS_OF_WEEK[getDay(now)];

    // Check daily summary - using database-persisted timestamp
    if (settings.enableDailySummary) {
      const targetHour = parseInt(settings.dailySummaryTime.split(":")[0], 10);
      
      if (currentHour === targetHour) {
        const today = format(now, "yyyy-MM-dd");
        const lastSentDay = settings.lastDailySentAt ? format(new Date(settings.lastDailySentAt), "yyyy-MM-dd") : null;
        
        if (lastSentDay !== today) {
          console.log("Sending daily summary...");
          await this.sendDailySummary();
          // Persist the timestamp to database to prevent duplicates across restarts
          await storage.updateSchedulerTimestamp("daily", now);
        }
      }
    }

    // Check weekly summary - using database-persisted timestamp
    if (settings.enableWeeklySummary) {
      const targetDay = settings.weeklySummaryDay.toLowerCase();
      const targetHour = parseInt(settings.weeklySummaryTime.split(":")[0], 10);
      
      if (currentDay === targetDay && currentHour === targetHour) {
        const thisWeek = format(startOfWeek(now), "yyyy-MM-dd");
        const lastSentWeek = settings.lastWeeklySentAt ? format(startOfWeek(new Date(settings.lastWeeklySentAt)), "yyyy-MM-dd") : null;
        
        if (lastSentWeek !== thisWeek) {
          console.log("Sending weekly summary...");
          await this.sendWeeklySummary();
          // Persist the timestamp to database to prevent duplicates across restarts
          await storage.updateSchedulerTimestamp("weekly", now);
        }
      }
    }
  }

  async sendDailySummary() {
    const activities = await storage.getRecentActivity(1);

    const commits = activities.filter(a => a.eventType === "push");
    const prs = activities.filter(a => a.eventType === "pull_request" || a.eventType === "pull_request_merged");
    
    const authorCounts = new Map<string, number>();
    activities.forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });

    const topContributor = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "No activity";

    const repos = await storage.getActiveRepositories();
    const repoActivity = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepository(repo.id, 1);
        const commitActivities = stats.filter(s => s.eventType === "push");
        
        // Find the longest commit message from this repo
        let longestMessage = "";
        commitActivities.forEach(activity => {
          if (activity.message && activity.message.length > longestMessage.length) {
            longestMessage = activity.message;
          }
        });
        
        return {
          repo: repo.name,
          commits: commitActivities.length,
          longestMessage: longestMessage || null,
        };
      })
    );

    const summary = {
      totalCommits: commits.length,
      totalPRs: prs.length,
      activeRepos: repoActivity.filter(r => r.commits > 0).length,
      topContributor,
      repoActivity: repoActivity.filter(r => r.commits > 0).slice(0, 5),
    };

    await slackService.sendDailySummary(summary);
    
    // Log to database
    await storage.createSlackMessage({
      user: "Ops Bot",
      message: `Daily summary sent: ${summary.totalCommits} commits, ${summary.totalPRs} PRs`,
      isBot: true,
      channel: "#ops",
    });
  }

  async sendWeeklySummary() {
    await this.sendRepoSummary("weekly");
  }

  // Flexible summary methods
  async sendRepoSummary(timeframe: TimeFrame) {
    const now = new Date();
    let days: number;
    let periodStart: Date;
    let periodEnd: Date;
    let periodLabel: string;

    switch (timeframe) {
      case "daily":
        days = 1;
        periodStart = subDays(now, 1);
        periodEnd = now;
        periodLabel = format(subDays(now, 1), "MMM d, yyyy");
        break;
      case "weekly":
        days = 7;
        periodStart = startOfWeek(subDays(now, 7));
        periodEnd = endOfWeek(subDays(now, 7));
        periodLabel = `${format(periodStart, "MMM d")} - ${format(periodEnd, "MMM d, yyyy")}`;
        break;
      case "monthly":
        days = 30;
        periodStart = startOfMonth(subMonths(now, 1));
        periodEnd = endOfMonth(subMonths(now, 1));
        periodLabel = format(periodStart, "MMMM yyyy");
        break;
      case "quarterly":
        days = 90;
        periodStart = subDays(now, 90);
        periodEnd = now;
        periodLabel = `${format(periodStart, "MMM d")} - ${format(periodEnd, "MMM d, yyyy")}`;
        break;
    }
    
    const activities = await storage.getRecentActivity(days);

    const commits = activities.filter(a => a.eventType === "push");
    const prs = activities.filter(a => a.eventType === "pull_request" || a.eventType === "pull_request_merged");
    const issues = activities.filter(a => a.eventType === "issues");
    
    const authorCounts = new Map<string, number>();
    activities.forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });

    const contributors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([author]) => author);

    const repos = await storage.getActiveRepositories();
    const repoActivity = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepository(repo.id, days);
        return {
          repo: repo.name,
          commits: stats.filter(s => s.eventType === "push").length,
          prs: stats.filter(s => s.eventType === "pull_request" || s.eventType === "pull_request_merged").length,
        };
      })
    );

    const summary = {
      timeframe,
      periodLabel,
      totalCommits: commits.length,
      totalPRs: prs.length,
      totalIssues: issues.length,
      activeRepos: repoActivity.filter(r => r.commits > 0 || r.prs > 0).length,
      contributors,
      repoActivity: repoActivity.filter(r => r.commits > 0 || r.prs > 0),
    };

    await slackService.sendRepoSummary(summary);
    
    // Log to database
    await storage.createSlackMessage({
      user: "Ops Bot",
      message: `${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} repo summary sent: ${summary.totalCommits} commits, ${summary.totalPRs} PRs`,
      isBot: true,
      channel: "#ops",
    });
  }

  async sendResearchSummary(timeframe: TimeFrame) {
    const now = new Date();
    let days: number;
    let periodLabel: string;

    switch (timeframe) {
      case "daily":
        days = 1;
        periodLabel = format(subDays(now, 1), "MMM d, yyyy");
        break;
      case "weekly":
        days = 7;
        periodLabel = `${format(subDays(now, 7), "MMM d")} - ${format(now, "MMM d, yyyy")}`;
        break;
      case "monthly":
        days = 30;
        periodLabel = format(subMonths(now, 1), "MMMM yyyy");
        break;
      case "quarterly":
        days = 90;
        periodLabel = `${format(subDays(now, 90), "MMM d")} - ${format(now, "MMM d, yyyy")}`;
        break;
    }

    const cutoffDate = subDays(now, days);
    const timeline = await storage.getResearchTimeline();
    
    // Filter updates to only those within the timeframe
    const projectUpdates = timeline.map(t => ({
      project: t.project,
      updates: t.updates.filter(u => new Date(u.date) >= cutoffDate)
    })).filter(t => t.updates.length > 0);

    // Get unique grantees
    const grantees = new Set<string>();
    projectUpdates.forEach(p => p.updates.forEach(u => {
      if (u.grantee) grantees.add(u.grantee);
    }));

    const summary = {
      timeframe,
      periodLabel,
      totalProjects: projectUpdates.length,
      totalUpdates: projectUpdates.reduce((sum, p) => sum + p.updates.length, 0),
      grantees: Array.from(grantees),
      projectUpdates: projectUpdates.map(p => ({
        name: p.project.name,
        updateCount: p.updates.length,
        latestUpdate: p.updates[0]?.description.slice(0, 150) + (p.updates[0]?.description.length > 150 ? "..." : ""),
        grantee: p.updates[0]?.grantee,
      })),
    };

    await slackService.sendResearchSummary(summary);
    
    // Log to database
    await storage.createSlackMessage({
      user: "Ops Bot",
      message: `${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} research summary sent: ${summary.totalProjects} projects, ${summary.totalUpdates} updates`,
      isBot: true,
      channel: "#ops",
    });
  }
}

export const schedulerService = new SchedulerService();
