import { storage } from "../storage";
import { slackService } from "./slack";
import { subDays, format, startOfWeek, endOfWeek, getDay } from "date-fns";

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export class SchedulerService {
  private checkInterval: NodeJS.Timeout | null = null;
  private lastDailySent: Date | null = null;
  private lastWeeklySent: Date | null = null;

  async start() {
    console.log("Starting scheduler service...");
    
    // Check every hour if we should send summaries
    this.checkInterval = setInterval(async () => {
      await this.checkSummaries();
    }, 60 * 60 * 1000); // Every hour

    // Also check on start
    await this.checkSummaries();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkSummaries() {
    const settings = await storage.getIntegrationSettings();
    if (!settings) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = DAYS_OF_WEEK[getDay(now)];

    // Check daily summary
    if (settings.enableDailySummary) {
      const targetHour = parseInt(settings.dailySummaryTime.split(":")[0], 10);
      
      if (currentHour === targetHour) {
        const today = format(now, "yyyy-MM-dd");
        const lastSentDay = this.lastDailySent ? format(this.lastDailySent, "yyyy-MM-dd") : null;
        
        if (lastSentDay !== today) {
          console.log("Sending daily summary...");
          await this.sendDailySummary();
          this.lastDailySent = now;
        }
      }
    }

    // Check weekly summary
    if (settings.enableWeeklySummary) {
      const targetDay = settings.weeklySummaryDay.toLowerCase();
      const targetHour = parseInt(settings.weeklySummaryTime.split(":")[0], 10);
      
      if (currentDay === targetDay && currentHour === targetHour) {
        const thisWeek = format(startOfWeek(now), "yyyy-MM-dd");
        const lastSentWeek = this.lastWeeklySent ? format(startOfWeek(this.lastWeeklySent), "yyyy-MM-dd") : null;
        
        if (lastSentWeek !== thisWeek) {
          console.log("Sending weekly summary...");
          await this.sendWeeklySummary();
          this.lastWeeklySent = now;
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
        return {
          repo: repo.name,
          commits: stats.filter(s => s.eventType === "push").length,
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
    const now = new Date();
    const weekStart = startOfWeek(subDays(now, 7));
    const weekEnd = endOfWeek(subDays(now, 7));
    
    const activities = await storage.getRecentActivity(7);

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
        const stats = await storage.getActivityByRepository(repo.id, 7);
        return {
          repo: repo.name,
          commits: stats.filter(s => s.eventType === "push").length,
          prs: stats.filter(s => s.eventType === "pull_request" || s.eventType === "pull_request_merged").length,
        };
      })
    );

    const summary = {
      totalCommits: commits.length,
      totalPRs: prs.length,
      totalIssues: issues.length,
      activeRepos: repoActivity.filter(r => r.commits > 0 || r.prs > 0).length,
      contributors,
      repoActivity: repoActivity.filter(r => r.commits > 0 || r.prs > 0),
      weekStart: format(weekStart, "MMM d"),
      weekEnd: format(weekEnd, "MMM d, yyyy"),
    };

    await slackService.sendWeeklySummary(summary);
    
    // Log to database
    await storage.createSlackMessage({
      user: "Ops Bot",
      message: `Weekly summary sent: ${summary.totalCommits} commits, ${summary.totalPRs} PRs, ${summary.contributors.length} contributors`,
      isBot: true,
      channel: "#ops",
    });
  }
}

export const schedulerService = new SchedulerService();
