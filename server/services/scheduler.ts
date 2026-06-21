import { storage } from "../storage";
import { slackService } from "./slack";
import { githubService } from "./github";
import { emailService, WeeklyAnalyticsData } from "./email";
import { gdriveService } from "./gdrive";
import { parseTranscript } from "./transcript-parser";
import { splitGranteeNames, isBot } from "../utils";
import { subDays, subMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay, getDate, lastDayOfMonth, setDay, isBefore, addDays } from "date-fns";

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Count distinct pull requests, not PR lifecycle events. A single PR emits a
// separate activity row for each action (opened/assigned/closed/merged); counting
// rows over-reports PRs. Dedupe by (repo, PR number), falling back to url/id.
function distinctPrCount(prEvents: any[]): number {
  const keys = new Set<string>();
  for (const p of prEvents) {
    const num = p?.metadata?.number;
    const key = num != null
      ? `${p.repositoryId ?? ""}#${num}`
      : (p?.url || p?.id || JSON.stringify(p));
    keys.add(key);
  }
  return keys.size;
}

// Issues, like PRs, emit a row per lifecycle action (opened/closed/reopened).
// Count distinct issues touched, not raw rows, to avoid over-reporting.
function distinctIssueCount(issueEvents: any[]): number {
  return distinctPrCount(issueEvents);
}

// Repo leaderboard sort: stars first, then issue activity, then comments, then
// commits as a final tiebreaker. Commits/PRs are shown as info, not primary rank.
function rankRepos<T extends { stars: number; issues: number; comments: number; commits: number }>(a: T, b: T): number {
  return (b.stars - a.stars) || (b.issues - a.issues) || (b.comments - a.comments) || (b.commits - a.commits);
}

function prettifyStatKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}

function formatStatValue(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

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

    // Sync Google Drive every 2 hours
    setInterval(async () => {
      await this.syncGoogleDrive();
    }, 2 * 60 * 60 * 1000);

    // Also check on start (with a delay to avoid startup race conditions)
    setTimeout(() => this.checkSummaries(), 10000);
    
    // Do an initial GitHub sync shortly after startup
    setTimeout(() => this.syncGitHub(), 30000);
  }
  
  private async syncGitHub() {
    try {
      console.log("Running scheduled GitHub sync...");
      const settings = await storage.getIntegrationSettings();
      
      // Use githubOrganization (singular) from database, support comma-separated orgs
      const githubOrgs = settings?.githubOrganization 
        ? settings.githubOrganization.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      
      if (githubOrgs.length > 0) {
        for (const org of githubOrgs) {
          try {
            await githubService.syncOrganization(org);
            console.log(`Synced org: ${org}`);
          } catch (error) {
            console.error(`Failed to sync org ${org}:`, error);
          }
        }
      }
      this.lastSyncTime = new Date();
      await storage.updateGithubSyncTimestamp(this.lastSyncTime);
      console.log("GitHub sync completed at", this.lastSyncTime.toISOString());
    } catch (error) {
      console.error("GitHub sync failed:", error);
    }
  }

  // Ensure fresh data before sending summaries - syncs repos, hypotheses, and papers
  private async ensureFreshData() {
    console.log("Ensuring fresh data before sending summary...");
    try {
      // Sync GitHub repos and activity
      await this.syncGitHub();
      
      // Sync hypotheses from default repo
      try {
        const result = await githubService.syncHypotheses("cimcai", "hypotheses", "");
        console.log(`Pre-summary hypotheses sync: ${result.synced} synced, ${result.updated} updated`);
      } catch (error) {
        console.error("Failed to sync hypotheses before summary:", error);
      }
      
      // Sync papers
      try {
        const papersResult = await githubService.syncPapers();
        console.log(`Pre-summary papers sync: ${papersResult.synced} new, ${papersResult.updated} updated`);
      } catch (error) {
        console.error("Failed to sync papers before summary:", error);
      }
      
      console.log("Fresh data sync completed");
    } catch (error) {
      console.error("Failed to ensure fresh data:", error);
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

  private isLastThursday(date: Date): boolean {
    if (getDay(date) !== 4) return false; // Not Thursday
    const last = lastDayOfMonth(date);
    const nextThursday = addDays(date, 7);
    return nextThursday.getMonth() !== date.getMonth();
  }

  private async checkSummaries() {
    const settings = await storage.getIntegrationSettings();
    if (!settings) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = DAYS_OF_WEEK[getDay(now)];
    const currentDayOfMonth = getDate(now);

    if (settings.enableMonthlyReminder) {
      const monthlyTargetHour = parseInt((settings.monthlyReminderTime || "09:00").split(":")[0], 10);
      if (this.isLastThursday(now) && currentHour === monthlyTargetHour) {
        const thisMonth = format(now, "yyyy-MM");
        const lastMonthlySent = settings.lastMonthlySentAt
          ? format(new Date(settings.lastMonthlySentAt), "yyyy-MM")
          : null;
        if (lastMonthlySent !== thisMonth) {
          await this.sendMonthlyMilestoneReminders();
          await storage.updateSchedulerTimestamp("monthly", now);
        }
      }
    }

    // Check daily summary - using database-persisted timestamp
    if (settings.enableDailySummary) {
      const targetHour = parseInt(settings.dailySummaryTime.split(":")[0], 10);
      
      if (currentHour === targetHour) {
        const today = format(now, "yyyy-MM-dd");
        const lastSentDay = settings.lastDailySentAt ? format(new Date(settings.lastDailySentAt), "yyyy-MM-dd") : null;
        
        if (lastSentDay !== today) {
          console.log("Sending daily summary...");
          // Sync fresh data before sending
          await this.ensureFreshData();
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
          // Sync fresh data before sending
          await this.ensureFreshData();
          await this.sendWeeklySummary();
          // Persist the timestamp to database to prevent duplicates across restarts
          await storage.updateSchedulerTimestamp("weekly", now);
        }
      }
    }
  }

  async sendDailySummary() {
    // Get the last time daily summary was sent to calculate activity since then
    const settings = await storage.getIntegrationSettings();
    const lastSentAt = settings?.lastDailySentAt 
      ? new Date(settings.lastDailySentAt)
      : subDays(new Date(), 1); // Default to 1 day ago if never sent

    // Get all activity since the last summary
    const activities = await storage.getActivitySince(lastSentAt);

    const commits = activities.filter(a => a.eventType === "push");
    const humanPrs = activities.filter(a => 
      (a.eventType === "pull_request" || a.eventType === "pull_request_merged") && !isBot(a.author)
    );
    const botPrs = activities.filter(a => 
      (a.eventType === "pull_request" || a.eventType === "pull_request_merged") && isBot(a.author)
    );
    const issues = activities.filter(a => a.eventType === "issues" && !isBot(a.author));
    const comments = activities.filter(a => a.eventType === "issue_comment" && !isBot(a.author));
    
    // Skip posting if zero activity
    if (activities.length === 0) {
      console.log("No activity since last daily summary - skipping Slack post");
      return;
    }

    const authorCounts = new Map<string, number>();
    activities.filter(a => !isBot(a.author)).forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });

    const topContributor = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "No activity";

    const repos = await storage.getActiveRepositories();
    const repoActivity = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepositorySince(repo.id, lastSentAt);
        const commitActivities = stats.filter(s => s.eventType === "push");
        const repoPrs = stats.filter(s => 
          (s.eventType === "pull_request" || s.eventType === "pull_request_merged") && !isBot(s.author)
        );
        const repoIssues = stats.filter(s => s.eventType === "issues" && !isBot(s.author));
        const repoComments = stats.filter(s => s.eventType === "issue_comment" && !isBot(s.author));
        
        // Find the longest commit message from this repo
        let longestMessage = "";
        commitActivities.forEach(activity => {
          if (activity.message && activity.message.length > longestMessage.length) {
            longestMessage = activity.message;
          }
        });

        // Collect unique PR authors
        const prAuthors = Array.from(new Set(repoPrs.map(p => p.author)));
        
        return {
          repo: repo.name,
          stars: repo.stars ?? 0,
          commits: commitActivities.length,
          prs: distinctPrCount(repoPrs),
          issues: distinctIssueCount(repoIssues),
          comments: repoComments.length,
          prAuthors,
          longestMessage: longestMessage || null,
        };
      })
    );

    const hasActivity = (r: { commits: number; prs: number; issues: number; comments: number }) =>
      r.commits > 0 || r.prs > 0 || r.issues > 0 || r.comments > 0;

    const summary = {
      totalCommits: commits.length,
      totalPRs: distinctPrCount(humanPrs),
      botPRs: distinctPrCount(botPrs),
      totalIssues: distinctIssueCount(issues),
      totalComments: comments.length,
      activeRepos: repoActivity.filter(hasActivity).length,
      topContributor,
      repoActivity: repoActivity.filter(hasActivity).sort(rankRepos).slice(0, 5),
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
    const periodStart = startOfWeek(subDays(now, 7));
    const periodEnd = endOfWeek(subDays(now, 7));
    const periodLabel = `${format(periodStart, "MMM d")} - ${format(periodEnd, "MMM d, yyyy")}`;

    // Gather repo activity - filter to exact period range
    const allActivities = await storage.getRecentActivity(14); // Get more to filter properly
    const activities = allActivities.filter(a => {
      const activityDate = a.activityDate ? new Date(a.activityDate) : new Date(a.createdAt);
      return activityDate >= periodStart && activityDate <= periodEnd;
    });
    const commits = activities.filter(a => a.eventType === "push");
    const humanPrs = activities.filter(a => 
      (a.eventType === "pull_request" || a.eventType === "pull_request_merged") && !isBot(a.author)
    );
    const issues = activities.filter(a => a.eventType === "issues" && !isBot(a.author));
    const comments = activities.filter(a => a.eventType === "issue_comment" && !isBot(a.author));

    // Get repo activity for the specific period
    const repos = await storage.getActiveRepositories();
    const allRepoStats = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepository(repo.id, 14);
        const periodStats = stats.filter(s => {
          const date = s.activityDate ? new Date(s.activityDate) : new Date(s.createdAt);
          return date >= periodStart && date <= periodEnd;
        });
        const repoPrs = periodStats.filter(s => 
          (s.eventType === "pull_request" || s.eventType === "pull_request_merged") && !isBot(s.author)
        );
        const repoIssues = periodStats.filter(s => s.eventType === "issues" && !isBot(s.author));
        const repoComments = periodStats.filter(s => s.eventType === "issue_comment" && !isBot(s.author));
        const prAuthors = Array.from(new Set(repoPrs.map(p => p.author)));
        return {
          repo: repo.name,
          stars: repo.stars ?? 0,
          commits: periodStats.filter(s => s.eventType === "push").length,
          prs: distinctPrCount(repoPrs),
          issues: distinctIssueCount(repoIssues),
          comments: repoComments.length,
          prAuthors,
        };
      })
    );
    const activeRepos = allRepoStats.filter(r => r.commits > 0 || r.prs > 0 || r.issues > 0 || r.comments > 0);

    // Gather research activity - filter to exact period range
    const timeline = await storage.getResearchTimeline();
    const projectUpdates = timeline.map(t => ({
      project: t.project,
      updates: t.updates.filter(u => {
        const updateDate = new Date(u.date);
        return updateDate >= periodStart && updateDate <= periodEnd;
      })
    })).filter(t => t.updates.length > 0);

    const totalResearchUpdates = projectUpdates.reduce((sum, p) => sum + p.updates.length, 0);

    // Gather papers data
    const papers = await storage.getPapers();
    const papersByStage = {
      before: papers.filter(p => p.currentStage === "before").length,
      mid: papers.filter(p => p.currentStage === "mid").length,
      after: papers.filter(p => p.currentStage === "after").length,
    };

    // Get unique contributors (from commits and research), excluding bots
    const authorCounts = new Map<string, number>();
    activities.filter(a => !isBot(a.author)).forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });
    const grantees = new Set<string>();
    projectUpdates.forEach(p => p.updates.forEach(u => {
      if (u.grantee) {
        for (const name of splitGranteeNames(u.grantee)) grantees.add(name);
      }
    }));

    const summary = {
      periodLabel,
      // Repo stats
      totalCommits: commits.length,
      totalPRs: distinctPrCount(humanPrs),
      totalIssues: distinctIssueCount(issues),
      totalComments: comments.length,
      activeRepos: activeRepos.length,
      repoActivity: activeRepos.sort(rankRepos).slice(0, 8),
      // Research stats
      totalResearchUpdates,
      projectsWithUpdates: projectUpdates.length,
      projectUpdates: projectUpdates.slice(0, 5).map(p => ({
        name: p.project.name,
        updateCount: p.updates.length,
      })),
      // Papers stats
      totalPapers: papers.length,
      papersByStage,
      // Contributors
      contributors: Array.from(authorCounts.keys()).slice(0, 5),
      researchContributors: Array.from(grantees).slice(0, 5),
    };

    await slackService.sendCombinedWeeklySummary(summary);

    // Also send weekly analytics email, optionally enriched with Neurocompute data
    try {
      let neurocompute: WeeklyAnalyticsData["neurocompute"] | undefined;
      try {
        const ncRes = await fetch("https://neurocompute.me/api/admin/analytics?secret=EIAC0-HELLONAVI&days=7");
        if (ncRes.ok) {
          const ncData = await ncRes.json() as any;
          neurocompute = {
            totalNodes: ncData.live?.totalNodes ?? 0,
            activeNodes24h: ncData.live?.activeNodes24h ?? 0,
            onlineNow: ncData.live?.onlineNow ?? 0,
            totalTokens: ncData.live?.totalTokens ?? 0,
            totalPixelsPlaced: ncData.live?.totalPixelsPlaced ?? 0,
            computeSeconds: ncData.live?.computeSeconds ?? 0,
            newContributors: ncData.period?.newContributors ?? 0,
            periodLabel: ncData.period?.label ?? "",
          };
          console.log("Neurocompute analytics fetched:", neurocompute.totalNodes, "nodes");
        }
      } catch (ncError) {
        console.warn("Could not fetch Neurocompute analytics:", ncError);
      }

      // App Usage — stats pushed by registered external apps (excludes Neurocompute,
      // which already has its own dedicated section above).
      let appUsage: WeeklyAnalyticsData["appUsage"];
      try {
        const apps = await storage.getExternalApps();
        const statRows = await storage.getExternalAppStats(undefined, 300);
        const recentCutoff = subDays(new Date(), 9).getTime();
        const usage: NonNullable<WeeklyAnalyticsData["appUsage"]> = [];
        for (const app of apps) {
          if (!app.active || /neurocompute/i.test(app.name)) continue;
          const rows = statRows.filter(r => r.appName === app.name);
          if (rows.length === 0) continue;
          // statRows are ordered most-recent-first; prefer the latest weekly row
          // within the recency window, else fall back to the latest daily row.
          const inWindow = rows.filter(r => new Date(r.receivedAt).getTime() >= recentCutoff);
          if (inWindow.length === 0) continue;
          const chosen = inWindow.find(r => r.periodType === "weekly") ?? inWindow[0];
          const stats = (chosen.stats || {}) as Record<string, unknown>;
          const metrics = Object.entries(stats)
            .filter(([k, v]) => k !== "period_label" && typeof v === "number" && !Number.isNaN(v))
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 8)
            .map(([k, v]) => ({ label: prettifyStatKey(k), value: formatStatValue(v as number) }));
          if (metrics.length === 0) continue;
          const label = (stats.period_label as string) || `${chosen.periodType} · ${chosen.periodDate}`;
          usage.push({ app: app.name, periodLabel: label, metrics });
        }
        if (usage.length > 0) appUsage = usage;
      } catch (appErr) {
        console.warn("Could not build app usage section:", appErr);
      }

      const emailData: WeeklyAnalyticsData = { ...(summary as WeeklyAnalyticsData), neurocompute, appUsage };
      const analyticsSettings = await storage.getIntegrationSettings();
      if (analyticsSettings?.enableWeeklyAnalyticsEmail !== false) {
        const analyticsRecipients = analyticsSettings?.weeklyAnalyticsEmails
          ? analyticsSettings.weeklyAnalyticsEmails.split(",").map(e => e.trim()).filter(Boolean)
          : [];
        await emailService.sendWeeklyAnalyticsEmail(emailData, analyticsRecipients);
        console.log(`Weekly analytics email sent to ${analyticsRecipients.length} recipients`);
      } else {
        console.log("Weekly analytics email disabled — skipping");
      }
    } catch (emailError) {
      console.error("Failed to send weekly analytics email:", emailError);
    }

    // Log to database with more detail
    const repoNames = activeRepos.slice(0, 3).map(r => r.repo).join(", ");
    const logMessage = `Weekly summary: ${summary.totalCommits} commits across ${summary.activeRepos} repos (${repoNames}${activeRepos.length > 3 ? "..." : ""}), ${summary.totalResearchUpdates} research updates, ${summary.totalPapers} papers`;
    
    await storage.createSlackMessage({
      user: "Ops Bot",
      message: logMessage,
      isBot: true,
      channel: "#ops",
    });
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
    const humanPrs = activities.filter(a => 
      (a.eventType === "pull_request" || a.eventType === "pull_request_merged") && !isBot(a.author)
    );
    const issues = activities.filter(a => a.eventType === "issues" && !isBot(a.author));
    const comments = activities.filter(a => a.eventType === "issue_comment" && !isBot(a.author));
    
    const authorCounts = new Map<string, number>();
    activities.filter(a => !isBot(a.author)).forEach(a => {
      authorCounts.set(a.author, (authorCounts.get(a.author) || 0) + 1);
    });

    const contributors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([author]) => author);

    const repos = await storage.getActiveRepositories();
    const repoActivity = await Promise.all(
      repos.map(async (repo) => {
        const stats = await storage.getActivityByRepository(repo.id, days);
        const repoPrs = stats.filter(s => 
          (s.eventType === "pull_request" || s.eventType === "pull_request_merged") && !isBot(s.author)
        );
        const repoIssues = stats.filter(s => s.eventType === "issues" && !isBot(s.author));
        const repoComments = stats.filter(s => s.eventType === "issue_comment" && !isBot(s.author));
        const prAuthors = Array.from(new Set(repoPrs.map(p => p.author)));
        return {
          repo: repo.name,
          stars: repo.stars ?? 0,
          commits: stats.filter(s => s.eventType === "push").length,
          prs: distinctPrCount(repoPrs),
          issues: distinctIssueCount(repoIssues),
          comments: repoComments.length,
          prAuthors,
        };
      })
    );

    const hasActivity = (r: { commits: number; prs: number; issues: number; comments: number }) =>
      r.commits > 0 || r.prs > 0 || r.issues > 0 || r.comments > 0;

    const summary = {
      timeframe,
      periodLabel,
      totalCommits: commits.length,
      totalPRs: distinctPrCount(humanPrs),
      totalIssues: distinctIssueCount(issues),
      totalComments: comments.length,
      activeRepos: repoActivity.filter(hasActivity).length,
      contributors,
      repoActivity: repoActivity.filter(hasActivity).sort(rankRepos),
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

    const grantees = new Set<string>();
    projectUpdates.forEach(p => p.updates.forEach(u => {
      if (u.grantee) {
        for (const name of splitGranteeNames(u.grantee)) grantees.add(name);
      }
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

  async sendMonthlyMilestoneReminders(options?: { testOnly?: boolean }) {
    const testOnly = options?.testOnly ?? false;
    const now = new Date();
    const currentMonth = format(now, "yyyy-MM");
    const monthLabel = format(now, "MMMM yyyy");
    
    console.log(`Sending monthly milestone reminders for ${currentMonth}${testOnly ? " (TEST ONLY - jdietz@gmail.com)" : ""}...`);
    
    try {
      const allMilestones = await storage.getMilestones();
      const currentMilestones = allMilestones.filter(m => m.month === currentMonth);
      
      const teamLeads = await storage.getTeamLeads();
      const activeTeamLeads = teamLeads.filter(l => l.isActive);
      
      const projects = await storage.getResearchProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      const baseUrl = "https://cimcops.org";
      console.log(`Milestone email links using base URL: ${baseUrl}`);
      
      const leadMilestones = new Map<string, { lead: typeof activeTeamLeads[0]; items: { projectName: string; description: string; submissionUrl: string }[] }>();
      
      for (const milestone of currentMilestones) {
        const project = projectMap.get(milestone.projectId);
        if (!project) continue;
        
        const projectLeads = activeTeamLeads.filter(l => l.projectId === milestone.projectId);
        
        for (const lead of projectLeads) {
          const key = lead.email.toLowerCase();
          if (!leadMilestones.has(key)) {
            leadMilestones.set(key, { lead, items: [] });
          }
          leadMilestones.get(key)!.items.push({
            projectName: project.name,
            description: milestone.description,
            submissionUrl: `${baseUrl}/submit-milestone/${milestone.id}/${lead.id}`,
          });
        }
      }
      
      let emailsSent = 0;
      let emailsFailed = 0;
      
      if (!testOnly) {
        for (const entry of Array.from(leadMilestones.values())) {
          const { lead, items } = entry;
          const result = await emailService.sendConsolidatedMilestoneReminderEmail(
            lead.email,
            lead.name,
            monthLabel,
            items
          );
          
          if (result.success) {
            emailsSent++;
            console.log(`Sent consolidated reminder to ${lead.email} (${items.length} milestone(s))`);
          } else {
            emailsFailed++;
            console.error(`Failed to send to ${lead.email}: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }

      const jdietzEntry = leadMilestones.get("jdietz@gmail.com");
      if (testOnly && jdietzEntry) {
        const result = await emailService.sendConsolidatedMilestoneReminderEmail(
          "jdietz@gmail.com",
          jdietzEntry.lead.name,
          monthLabel,
          jdietzEntry.items
        );
        if (result.success) {
          emailsSent++;
          console.log(`Sent test email to jdietz@gmail.com with ${jdietzEntry.items.length} real milestone(s)`);
        } else {
          console.error(`Failed to send test email to jdietz@gmail.com: ${result.error}`);
        }
      } else if (!testOnly) {
        const testMilestone = currentMilestones.find(m => {
          const proj = projectMap.get(m.projectId);
          return proj?.name?.toLowerCase().includes("test");
        }) || currentMilestones[0];
        const testProject = testMilestone ? projectMap.get(testMilestone.projectId) : null;
        const testLead = activeTeamLeads.find(l => l.email.toLowerCase() === "jdietz@gmail.com" && l.projectId === testMilestone?.projectId);
        const testSubmissionUrl = testMilestone
          ? `${baseUrl}/submit-milestone/${testMilestone.id}${testLead ? `/${testLead.id}` : ""}`
          : `${baseUrl}/milestones`;
        const testItems = [{
          projectName: testProject?.name || "Sample Project",
          description: `This is an automated test email sent alongside ${emailsSent} real milestone reminders. If you received this, the email system is working correctly.`,
          submissionUrl: testSubmissionUrl,
        }];
        const testResult = await emailService.sendConsolidatedMilestoneReminderEmail(
          "jdietz@gmail.com",
          "Joel",
          monthLabel,
          testItems
        );
        if (testResult.success) {
          emailsSent++;
          console.log(`Sent test verification email to jdietz@gmail.com`);
        } else {
          console.error(`Failed to send test email to jdietz@gmail.com: ${testResult.error}`);
        }
      }
      
      console.log(`Milestone reminders sent: ${emailsSent} emails${testOnly ? " (test only)" : ` to ${leadMilestones.size} team leads + 1 test`}, ${emailsFailed} failed`);
      
      if (emailsSent > 0) {
        await storage.createSlackMessage({
          user: "Ops Bot",
          message: `Monthly milestone reminders sent: ${emailsSent} emails to team leads`,
          isBot: true,
          channel: "#ops",
        });
      }
    } catch (error) {
      console.error("Failed to send monthly milestone reminders:", error);
    }
  }

  // Manual trigger for testing milestone reminders
  async triggerMilestoneReminders(options?: { testOnly?: boolean }) {
    await this.sendMonthlyMilestoneReminders(options);
  }

  async syncGoogleDrive() {
    try {
      const settings = await storage.getIntegrationSettings();
      if (!settings?.gdriveAutoSync || !settings?.gdriveFolderId) return;

      let folderIds: string[];
      try {
        const parsed = JSON.parse(settings.gdriveFolderId);
        folderIds = Array.isArray(parsed) ? parsed : [settings.gdriveFolderId];
      } catch {
        folderIds = [settings.gdriveFolderId];
      }

      console.log(`Running Google Drive auto-sync across ${folderIds.length} folder(s)...`);
      const importedIds = await storage.getGdriveImportedFileIds();
      let newFiles: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }> = [];
      for (const fid of folderIds) {
        const files = await gdriveService.listFiles(fid);
        newFiles.push(...files.filter(f => !importedIds.includes(f.id)));
      }

      if (newFiles.length === 0) {
        console.log("No new Google Drive files to import");
        return;
      }

      const projects = await storage.getResearchProjects();
      const existingProjectNames = projects.map(p => p.name);
      let totalUpdates = 0;

      const projectColors = [
        "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
        "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"
      ];

      for (const file of newFiles) {
        try {
          const text = await gdriveService.getFileAsText(file.id, file.mimeType);
          if (!text || text.trim().length < 50) {
            await storage.markGdriveFileImported(file.id, file.name, 0);
            continue;
          }

          const parsed = await parseTranscript(text, file.name, existingProjectNames);

          for (const note of parsed) {
            let project = await storage.getResearchProjectByName(note.project);
            if (!project) {
              project = await storage.createResearchProject({
                name: note.project,
                description: `Research project: ${note.project}`,
                color: projectColors[totalUpdates % projectColors.length],
              });
              existingProjectNames.push(note.project);
            }

            await storage.createResearchUpdate({
              projectId: project.id,
              date: new Date(note.date),
              description: note.description,
              grantee: note.grantee,
            });
            totalUpdates++;
          }

          await storage.markGdriveFileImported(file.id, file.name, parsed.length);
        } catch (fileError) {
          console.error(`Error processing Drive file ${file.name}:`, fileError);
        }
      }

      await storage.updateGdriveSettings({ lastGdriveSyncAt: new Date() });
      console.log(`Google Drive auto-sync complete: ${totalUpdates} updates from ${newFiles.length} files`);
    } catch (error) {
      console.error("Google Drive auto-sync failed:", error);
    }
  }
}

export const schedulerService = new SchedulerService();
