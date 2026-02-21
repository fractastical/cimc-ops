import { storage } from "../storage";
import { slackService } from "./slack";
import { githubService } from "./github";
import { emailService } from "./email";
import { gdriveService } from "./gdrive";
import { parseTranscript } from "./transcript-parser";
import { subDays, subMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay, getDate, lastDayOfMonth, setDay, isBefore, addDays } from "date-fns";

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot$/i,
  /^renovate$/i,
  /^github-actions$/i,
  /^replit/i,
  /^snyk-bot$/i,
  /^greenkeeper$/i,
  /^codecov$/i,
];

function isBot(author: string): boolean {
  return BOT_PATTERNS.some(pattern => pattern.test(author));
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
          commits: commitActivities.length,
          prs: repoPrs.length,
          prAuthors,
          longestMessage: longestMessage || null,
        };
      })
    );

    const summary = {
      totalCommits: commits.length,
      totalPRs: humanPrs.length,
      botPRs: botPrs.length,
      activeRepos: repoActivity.filter(r => r.commits > 0 || r.prs > 0).length,
      topContributor,
      repoActivity: repoActivity.filter(r => r.commits > 0 || r.prs > 0).slice(0, 5),
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
        const prAuthors = Array.from(new Set(repoPrs.map(p => p.author)));
        return {
          repo: repo.name,
          commits: periodStats.filter(s => s.eventType === "push").length,
          prs: repoPrs.length,
          prAuthors,
        };
      })
    );
    const activeRepos = allRepoStats.filter(r => r.commits > 0 || r.prs > 0);

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
      if (u.grantee) grantees.add(u.grantee);
    }));

    const summary = {
      periodLabel,
      // Repo stats
      totalCommits: commits.length,
      totalPRs: humanPrs.length,
      activeRepos: activeRepos.length,
      repoActivity: activeRepos.sort((a, b) => b.commits - a.commits).slice(0, 8),
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
        const prAuthors = Array.from(new Set(repoPrs.map(p => p.author)));
        return {
          repo: repo.name,
          commits: stats.filter(s => s.eventType === "push").length,
          prs: repoPrs.length,
          prAuthors,
        };
      })
    );

    const summary = {
      timeframe,
      periodLabel,
      totalCommits: commits.length,
      totalPRs: humanPrs.length,
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

  async sendMonthlyMilestoneReminders() {
    const now = new Date();
    const currentMonth = format(now, "yyyy-MM");
    const monthLabel = format(now, "MMMM yyyy");
    
    console.log(`Sending monthly milestone reminders for ${currentMonth}...`);
    
    try {
      const allMilestones = await storage.getMilestones();
      const currentMilestones = allMilestones.filter(m => m.month === currentMonth);
      
      if (currentMilestones.length === 0) {
        console.log("No milestones for current month");
        return;
      }
      
      const teamLeads = await storage.getTeamLeads();
      const activeTeamLeads = teamLeads.filter(l => l.isActive);
      
      const projects = await storage.getResearchProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";
      
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
      
      console.log(`Milestone reminders sent: ${emailsSent} emails to ${leadMilestones.size} team leads, ${emailsFailed} failed`);
      
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
  async triggerMilestoneReminders() {
    await this.sendMonthlyMilestoneReminders();
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
