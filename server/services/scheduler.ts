import { storage } from "../storage";
import { slackService } from "./slack";
import { subDays, format } from "date-fns";

export class SchedulerService {
  private dailySummaryInterval: NodeJS.Timeout | null = null;

  async start() {
    console.log("Starting scheduler service...");
    
    // Check every hour if we should send the daily summary
    this.dailySummaryInterval = setInterval(async () => {
      await this.checkDailySummary();
    }, 60 * 60 * 1000); // Every hour

    // Also check immediately on start
    await this.checkDailySummary();
  }

  stop() {
    if (this.dailySummaryInterval) {
      clearInterval(this.dailySummaryInterval);
      this.dailySummaryInterval = null;
    }
  }

  private async checkDailySummary() {
    const settings = await storage.getIntegrationSettings();
    
    if (!settings?.enableDailySummary) {
      return;
    }

    const now = new Date();
    const currentTime = format(now, "HH:mm");
    const targetTime = settings.dailySummaryTime;

    // Check if current time matches the scheduled time (within the same hour)
    if (currentTime.split(":")[0] === targetTime.split(":")[0]) {
      // Prevent sending multiple summaries in the same hour
      const lastCheck = await this.getLastSummaryTime();
      const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastCheck < 1) {
        return; // Already sent in this hour
      }

      await this.sendDailySummary();
      await this.setLastSummaryTime(now);
    }
  }

  private async sendDailySummary() {
    console.log("Generating daily summary...");

    const yesterday = subDays(new Date(), 1);
    const activities = await storage.getRecentActivity(1);

    // Calculate stats
    const commits = activities.filter(a => a.eventType === "push");
    const prs = activities.filter(a => a.eventType === "pull_request" || a.eventType === "pull_request_merged");
    
    const authorCounts = new Map<string, number>();
    activities.forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });

    const topContributor = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "No activity";

    // Get repo activity
    const repos = await storage.getActiveRepositories();
    const repoActivity = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepository(repo.id, 1);
        return {
          repo: repo.name,
          commits: stats.length,
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
  }

  private lastSummaryTimeKey = "last_daily_summary_time";

  private async getLastSummaryTime(): Promise<Date> {
    // In a real app, store this in the database
    // For now, use a simple in-memory approach
    return new Date(0);
  }

  private async setLastSummaryTime(time: Date): Promise<void> {
    // Store in database in production
  }
}

export const schedulerService = new SchedulerService();
