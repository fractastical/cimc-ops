import { 
  type LocalUser,
  type InsertLocalUser,
  type IntegrationSettings,
  type InsertIntegrationSettings,
  type Repository,
  type InsertRepository,
  type ActivityLog,
  type InsertActivityLog,
  type SlackMessage,
  type InsertSlackMessage,
  type ResearchProject,
  type InsertResearchProject,
  type ResearchUpdate,
  type InsertResearchUpdate,
  type Hypothesis,
  type InsertHypothesis,
  type ProjectHypothesis,
  type InsertProjectHypothesis,
  type Paper,
  type InsertPaper,
  type Collaborator,
  type InsertCollaborator,
  type PaperCollaborator,
  type InsertPaperCollaborator,
  type Milestone,
  type InsertMilestone,
  type MilestoneSubmission,
  type InsertMilestoneSubmission,
  type TeamLead,
  type InsertTeamLead,
  type AdminEmail,
  type InsertAdminEmail,
  type AdminActionLog,
  type InsertAdminActionLog,
  type MicrograntApplication,
  type InsertMicrograntApplication,
  type GrantComment,
  type InsertGrantComment,
  type ExternalApp,
  type InsertExternalApp,
  type ExternalAppStats,
  type InsertExternalAppStats,
  type Thing,
  type InsertThing,
  localUsers,
  integrationSettings,
  repositories,
  activityLog,
  slackMessages,
  researchProjects,
  researchUpdates,
  hypotheses,
  projectHypotheses,
  papers,
  collaborators,
  paperCollaborators,
  milestones,
  milestoneSubmissions,
  teamLeads,
  adminEmails,
  adminActionsLog,
  micrograntApplications,
  grantComments,
  gdriveImportedFiles,
  externalApps,
  externalAppStats,
  things,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { subDays, format } from "date-fns";

export interface IStorage {
  // Local Users (legacy password auth)
  getLocalUser(id: string): Promise<LocalUser | undefined>;
  getLocalUserByUsername(username: string): Promise<LocalUser | undefined>;
  createLocalUser(user: InsertLocalUser): Promise<LocalUser>;

  // Admin Action Log
  getAdminActions(limit?: number): Promise<AdminActionLog[]>;
  logAdminAction(action: InsertAdminActionLog): Promise<AdminActionLog>;

  // Integration Settings
  getIntegrationSettings(): Promise<IntegrationSettings | undefined>;
  upsertIntegrationSettings(settings: InsertIntegrationSettings): Promise<IntegrationSettings>;
  updateSchedulerTimestamp(type: "daily" | "weekly" | "monthly", timestamp: Date): Promise<void>;
  updateGithubSyncTimestamp(timestamp: Date): Promise<void>;

  // Repositories
  getRepositories(): Promise<Repository[]>;
  getActiveRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository | undefined>;
  getRepositoryByFullName(fullName: string): Promise<Repository | undefined>;
  createRepository(repo: InsertRepository): Promise<Repository>;
  updateRepository(id: string, updates: Partial<InsertRepository>): Promise<Repository | undefined>;
  deleteRepository(id: string): Promise<void>;

  // Activity Logs
  getRecentActivity(days?: number): Promise<ActivityLog[]>;
  getActivitySince(since: Date): Promise<ActivityLog[]>;
  getActivityByRepository(repositoryId: string, days?: number): Promise<ActivityLog[]>;
  getActivityByRepositorySince(repositoryId: string, since: Date): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  findPushActivityByDate(repositoryId: string, date: string): Promise<ActivityLog | undefined>;
  updateActivityLog(id: string, updates: Partial<InsertActivityLog>): Promise<void>;
  activityExistsByKey(repositoryId: string, eventType: string, url: string | null | undefined, activityDate: Date): Promise<boolean>;
  getActivityStats(repositoryId: string, days?: number): Promise<{ date: string; count: number }[]>;
  getMonthlyActivityStats(): Promise<{ month: string; commits: number; researchUpdates: number }[]>;

  // Slack Messages
  getRecentSlackMessages(limit?: number): Promise<SlackMessage[]>;
  createSlackMessage(message: InsertSlackMessage): Promise<SlackMessage>;

  // Research Projects
  getResearchProjects(): Promise<ResearchProject[]>;
  getResearchProject(id: string): Promise<ResearchProject | undefined>;
  getResearchProjectByName(name: string): Promise<ResearchProject | undefined>;
  createResearchProject(project: InsertResearchProject): Promise<ResearchProject>;
  updateResearchProject(id: string, updates: Partial<InsertResearchProject>): Promise<ResearchProject | undefined>;
  deleteResearchProject(id: string): Promise<void>;
  mergeResearchProjects(keepId: string, mergeIds: string[]): Promise<number>;

  // Research Updates
  getResearchUpdates(projectId?: string): Promise<ResearchUpdate[]>;
  createResearchUpdate(update: InsertResearchUpdate): Promise<ResearchUpdate>;
  getResearchTimeline(): Promise<{ project: ResearchProject; updates: ResearchUpdate[] }[]>;

  // Google Drive Import Tracking
  getGdriveImportedFileIds(): Promise<string[]>;
  markGdriveFileImported(fileId: string, fileName: string, updatesCreated: number): Promise<void>;
  updateGdriveSettings(updates: { gdriveFolderId?: string | null; gdriveFolderName?: string | null; gdriveAutoSync?: boolean; lastGdriveSyncAt?: Date }): Promise<void>;

  // Project-Hypothesis Links
  getProjectHypotheses(projectId: string): Promise<Array<{ projectId: string; hypothesisId: string; relationship: string | null; hypothesis: Hypothesis }>>;
  getAllProjectHypothesisLinks(): Promise<Array<{ id: string; projectId: string; hypothesisId: string; relationship: string | null }>>;
  linkProjectHypothesis(link: InsertProjectHypothesis): Promise<{ id: string; projectId: string; hypothesisId: string; relationship: string | null }>;
  unlinkProjectHypothesis(projectId: string, hypothesisId: string): Promise<void>;

  // Hypotheses
  getHypotheses(): Promise<Hypothesis[]>;
  getHypothesis(id: string): Promise<Hypothesis | undefined>;
  getHypothesisByFilename(filename: string): Promise<Hypothesis | undefined>;
  createHypothesis(hypothesis: InsertHypothesis): Promise<Hypothesis>;
  updateHypothesis(id: string, updates: Partial<InsertHypothesis>): Promise<Hypothesis | undefined>;
  deleteHypothesis(id: string): Promise<void>;

  // Project-Hypothesis Links
  getProjectHypotheses(projectId: string): Promise<(ProjectHypothesis & { hypothesis: Hypothesis })[]>;
  getHypothesisProjects(hypothesisId: string): Promise<(ProjectHypothesis & { project: ResearchProject })[]>;
  getAllProjectHypothesisLinks(): Promise<ProjectHypothesis[]>;
  linkProjectHypothesis(link: InsertProjectHypothesis): Promise<ProjectHypothesis>;
  unlinkProjectHypothesis(projectId: string, hypothesisId: string): Promise<void>;
  
  // Hypothesis Activity
  getHypothesisActivity(): Promise<Array<{
    hypothesis: Hypothesis;
    totalUpdates: number;
    lastActivityDate: string | null;
    linkedProjects: Array<{ id: string; name: string; color: string | null; updateCount: number }>;
  }>>;
  
  getHypothesisActivityTimeline(): Promise<Array<{
    hypothesisId: string;
    hypothesisTitle: string;
    data: Array<{ week: string; count: number }>;
  }>>;

  // Papers
  getPapers(): Promise<Paper[]>;
  getPaperByPaperId(paperId: string): Promise<Paper | undefined>;
  upsertPaper(paper: InsertPaper): Promise<Paper>;

  // Collaborators
  getCollaborators(): Promise<Collaborator[]>;
  getCollaborator(id: string): Promise<Collaborator | undefined>;
  getCollaboratorByName(name: string): Promise<Collaborator | undefined>;
  getCollaboratorByOpenAlexId(openalexId: string): Promise<Collaborator | undefined>;
  createCollaborator(collaborator: InsertCollaborator): Promise<Collaborator>;
  updateCollaborator(id: string, updates: Partial<InsertCollaborator>): Promise<Collaborator | undefined>;
  deleteCollaborator(id: string): Promise<void>;

  // Paper-Collaborator Links
  getPaperCollaborators(paperId: string): Promise<Array<PaperCollaborator & { collaborator: Collaborator }>>;
  getCollaboratorPapers(collaboratorId: string): Promise<Array<PaperCollaborator & { paper: Paper }>>;
  linkPaperCollaborator(link: InsertPaperCollaborator): Promise<PaperCollaborator>;
  unlinkPaperCollaborator(paperId: string, collaboratorId: string): Promise<void>;
  getPapersWithCollaborators(): Promise<Array<Paper & { collaborators: Collaborator[]; maxHIndex: number | null }>>;

  // Milestones
  getMilestones(projectId?: string): Promise<Milestone[]>;
  getMilestone(id: string): Promise<Milestone | undefined>;
  getMilestoneByProjectAndMonth(projectId: string, month: string): Promise<Milestone | undefined>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: string, updates: Partial<InsertMilestone>): Promise<Milestone | undefined>;
  deleteMilestone(id: string): Promise<void>;

  // Milestone Submissions
  getMilestoneSubmissions(milestoneId?: string): Promise<MilestoneSubmission[]>;
  getMilestoneSubmission(id: string): Promise<MilestoneSubmission | undefined>;
  createMilestoneSubmission(submission: InsertMilestoneSubmission): Promise<MilestoneSubmission>;

  // Team Leads
  getTeamLeads(projectId?: string): Promise<TeamLead[]>;
  getTeamLead(id: string): Promise<TeamLead | undefined>;
  createTeamLead(teamLead: InsertTeamLead): Promise<TeamLead>;
  updateTeamLead(id: string, updates: Partial<InsertTeamLead>): Promise<TeamLead | undefined>;
  deleteTeamLead(id: string): Promise<void>;

  // Admin Emails
  getAdminEmails(): Promise<AdminEmail[]>;
  getActiveAdminEmails(): Promise<string[]>;
  createAdminEmail(adminEmail: InsertAdminEmail): Promise<AdminEmail>;
  deleteAdminEmail(id: string): Promise<void>;

  // Microgrant Applications
  getMicrograntApplications(status?: string): Promise<MicrograntApplication[]>;
  getMicrograntApplication(id: string): Promise<MicrograntApplication | undefined>;
  createMicrograntApplication(application: InsertMicrograntApplication): Promise<MicrograntApplication>;
  updateMicrograntApplication(id: string, updates: Partial<InsertMicrograntApplication>): Promise<MicrograntApplication | undefined>;

  // Grant Comments
  getGrantComments(applicationId: string): Promise<GrantComment[]>;
  createGrantComment(comment: InsertGrantComment): Promise<GrantComment>;

  // External Apps
  getExternalApps(): Promise<ExternalApp[]>;
  getExternalAppByKey(apiKey: string): Promise<ExternalApp | undefined>;
  createExternalApp(app: InsertExternalApp): Promise<ExternalApp>;
  deleteExternalApp(id: string): Promise<void>;

  // External App Stats
  createExternalAppStats(stats: InsertExternalAppStats): Promise<ExternalAppStats>;
  getExternalAppStats(appName?: string, limit?: number): Promise<ExternalAppStats[]>;

  // Things
  getThings(): Promise<Thing[]>;
  getThing(id: string): Promise<Thing | undefined>;
  createThing(thing: InsertThing): Promise<Thing>;
  updateThing(id: string, updates: Partial<InsertThing>): Promise<Thing | undefined>;
  deleteThing(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Local Users (legacy password auth)
  async getLocalUser(id: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.id, id));
    return user || undefined;
  }

  async getLocalUserByUsername(username: string): Promise<LocalUser | undefined> {
    const [user] = await db.select().from(localUsers).where(eq(localUsers.username, username));
    return user || undefined;
  }

  async createLocalUser(insertUser: InsertLocalUser): Promise<LocalUser> {
    const [user] = await db.insert(localUsers).values(insertUser).returning();
    return user;
  }

  // Admin Action Log
  async getAdminActions(limit: number = 50): Promise<AdminActionLog[]> {
    return db.select().from(adminActionsLog).orderBy(desc(adminActionsLog.createdAt)).limit(limit);
  }

  async logAdminAction(action: InsertAdminActionLog): Promise<AdminActionLog> {
    const [log] = await db.insert(adminActionsLog).values(action).returning();
    return log;
  }

  // Integration Settings
  async getIntegrationSettings(): Promise<IntegrationSettings | undefined> {
    const [settings] = await db.select().from(integrationSettings).limit(1);
    return settings || undefined;
  }

  async upsertIntegrationSettings(settings: InsertIntegrationSettings): Promise<IntegrationSettings> {
    const existing = await this.getIntegrationSettings();
    
    if (existing) {
      const [updated] = await db
        .update(integrationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(integrationSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(integrationSettings)
        .values(settings)
        .returning();
      return created;
    }
  }

  async updateSchedulerTimestamp(type: "daily" | "weekly" | "monthly", timestamp: Date): Promise<void> {
    const existing = await this.getIntegrationSettings();
    if (!existing) return;

    if (type === "daily") {
      await db
        .update(integrationSettings)
        .set({ lastDailySentAt: timestamp })
        .where(eq(integrationSettings.id, existing.id));
    } else if (type === "weekly") {
      await db
        .update(integrationSettings)
        .set({ lastWeeklySentAt: timestamp })
        .where(eq(integrationSettings.id, existing.id));
    } else {
      await db
        .update(integrationSettings)
        .set({ lastMonthlySentAt: timestamp })
        .where(eq(integrationSettings.id, existing.id));
    }
  }

  async updateGithubSyncTimestamp(timestamp: Date): Promise<void> {
    const existing = await this.getIntegrationSettings();
    if (!existing) return;
    await db
      .update(integrationSettings)
      .set({ lastGithubSyncAt: timestamp })
      .where(eq(integrationSettings.id, existing.id));
  }

  // Repositories
  async getRepositories(): Promise<Repository[]> {
    return await db.select().from(repositories).orderBy(desc(repositories.stars));
  }

  async getActiveRepositories(): Promise<Repository[]> {
    return await db
      .select()
      .from(repositories)
      .where(eq(repositories.isActive, true))
      .orderBy(desc(repositories.stars));
  }

  async getRepository(id: string): Promise<Repository | undefined> {
    const [repo] = await db.select().from(repositories).where(eq(repositories.id, id));
    return repo || undefined;
  }

  async getRepositoryByFullName(fullName: string): Promise<Repository | undefined> {
    const [repo] = await db.select().from(repositories).where(eq(repositories.fullName, fullName));
    return repo || undefined;
  }

  async createRepository(repo: InsertRepository): Promise<Repository> {
    const [created] = await db.insert(repositories).values(repo).returning();
    return created;
  }

  async updateRepository(id: string, updates: Partial<InsertRepository>): Promise<Repository | undefined> {
    const [updated] = await db
      .update(repositories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteRepository(id: string): Promise<void> {
    await db.delete(repositories).where(eq(repositories.id, id));
  }

  // Activity Logs
  async getRecentActivity(days: number = 30): Promise<ActivityLog[]> {
    const cutoff = subDays(new Date(), days);
    // Use activityDate (actual date of activity) if available, otherwise fall back to createdAt
    return await db
      .select()
      .from(activityLog)
      .where(gte(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`, cutoff))
      .orderBy(desc(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`))
      .limit(100);
  }

  async getActivitySince(since: Date): Promise<ActivityLog[]> {
    // Get all activity since a specific date
    return await db
      .select()
      .from(activityLog)
      .where(gte(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`, since))
      .orderBy(desc(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`));
  }

  async getActivityByRepository(repositoryId: string, days: number = 30): Promise<ActivityLog[]> {
    const cutoff = subDays(new Date(), days);
    // Use activityDate (actual date of activity) if available, otherwise fall back to createdAt
    return await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          gte(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`, cutoff)
        )
      )
      .orderBy(desc(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`));
  }

  async getActivityByRepositorySince(repositoryId: string, since: Date): Promise<ActivityLog[]> {
    // Get activity for a specific repo since a date
    return await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          gte(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`, since)
        )
      )
      .orderBy(desc(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLog).values(log).returning();
    return created;
  }

  async findPushActivityByDate(repositoryId: string, date: string): Promise<ActivityLog | undefined> {
    const rows = await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          eq(activityLog.eventType, "push"),
          sql`${activityLog.metadata}->>'date' = ${date}`,
        ),
      )
      .limit(1);
    return rows[0];
  }

  async updateActivityLog(id: string, updates: Partial<InsertActivityLog>): Promise<void> {
    await db.update(activityLog).set(updates).where(eq(activityLog.id, id));
  }

  async activityExistsByKey(
    repositoryId: string,
    eventType: string,
    url: string | null | undefined,
    activityDate: Date,
  ): Promise<boolean> {
    const conds = [
      eq(activityLog.repositoryId, repositoryId),
      eq(activityLog.eventType, eventType),
      eq(activityLog.activityDate, activityDate),
    ];
    if (url) conds.push(eq(activityLog.url, url));
    const rows = await db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(...conds))
      .limit(1);
    return rows.length > 0;
  }

  async getActivityStats(repositoryId: string, days: number = 60): Promise<{ date: string; count: number }[]> {
    const cutoff = subDays(new Date(), days);
    
    // Use activityDate if available, otherwise fall back to createdAt
    const stats = await db
      .select({
        date: sql<string>`DATE(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}))`.as('date'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          gte(sql`COALESCE(${activityLog.activityDate}, ${activityLog.createdAt})`, cutoff)
        )
      )
      .groupBy(sql`DATE(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}))`)
      .orderBy(sql`DATE(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}))`);

    // Fill in all dates with 0 counts for missing days
    const result: { date: string; count: number }[] = [];
    const statsMap = new Map(stats.map(s => [s.date, s.count]));
    
    for (let i = days; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      result.push({
        date,
        count: statsMap.get(date) || 0,
      });
    }

    return result;
  }

  async getMonthlyActivityStats(): Promise<{ month: string; commits: number; researchUpdates: number }[]> {
    // Get commit stats from activity log
    const commitStats = await db
      .select({
        month: sql<string>`TO_CHAR(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}), 'YYYY-MM')`.as('month'),
        commits: sql<number>`COUNT(*)::int`.as('commits'),
      })
      .from(activityLog)
      .groupBy(sql`TO_CHAR(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}), 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(COALESCE(${activityLog.activityDate}, ${activityLog.createdAt}), 'YYYY-MM')`);

    // Get research update stats
    const updateStats = await db
      .select({
        month: sql<string>`TO_CHAR(${researchUpdates.date}, 'YYYY-MM')`.as('month'),
        updates: sql<number>`COUNT(*)::int`.as('updates'),
      })
      .from(researchUpdates)
      .groupBy(sql`TO_CHAR(${researchUpdates.date}, 'YYYY-MM')`);

    // Merge the two datasets
    const updateMap = new Map(updateStats.map(u => [u.month, u.updates]));
    const allMonths = new Set([...commitStats.map(c => c.month), ...updateStats.map(u => u.month)]);
    const commitMap = new Map(commitStats.map(c => [c.month, c.commits]));

    return Array.from(allMonths)
      .sort()
      .map(month => ({
        month,
        commits: commitMap.get(month) || 0,
        researchUpdates: updateMap.get(month) || 0,
      }));
  }

  // Slack Messages
  async getRecentSlackMessages(limit: number = 50): Promise<SlackMessage[]> {
    return await db
      .select()
      .from(slackMessages)
      .orderBy(desc(slackMessages.timestamp))
      .limit(limit);
  }

  async createSlackMessage(message: InsertSlackMessage): Promise<SlackMessage> {
    const [created] = await db.insert(slackMessages).values(message).returning();
    return created;
  }

  // Research Projects
  async getResearchProjects(): Promise<ResearchProject[]> {
    return await db
      .select()
      .from(researchProjects)
      .orderBy(researchProjects.name);
  }

  async getResearchProject(id: string): Promise<ResearchProject | undefined> {
    const [project] = await db.select().from(researchProjects).where(eq(researchProjects.id, id));
    return project || undefined;
  }

  async getResearchProjectByName(name: string): Promise<ResearchProject | undefined> {
    const [project] = await db.select().from(researchProjects).where(eq(researchProjects.name, name));
    return project || undefined;
  }

  async createResearchProject(project: InsertResearchProject): Promise<ResearchProject> {
    const [created] = await db.insert(researchProjects).values(project).returning();
    return created;
  }

  async updateResearchProject(id: string, updates: Partial<InsertResearchProject>): Promise<ResearchProject | undefined> {
    const [updated] = await db
      .update(researchProjects)
      .set(updates)
      .where(eq(researchProjects.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteResearchProject(id: string): Promise<void> {
    await db.delete(researchProjects).where(eq(researchProjects.id, id));
  }

  async mergeResearchProjects(keepId: string, mergeIds: string[]): Promise<number> {
    if (mergeIds.length === 0) return 0;
    let movedCount = 0;
    for (const mergeId of mergeIds) {
      const result = await db.update(researchUpdates)
        .set({ projectId: keepId })
        .where(eq(researchUpdates.projectId, mergeId));
      movedCount += (result as any).rowCount || 0;
      await db.delete(researchProjects).where(eq(researchProjects.id, mergeId));
    }
    return movedCount;
  }

  // Research Updates
  async getResearchUpdates(projectId?: string): Promise<ResearchUpdate[]> {
    if (projectId) {
      return await db
        .select()
        .from(researchUpdates)
        .where(eq(researchUpdates.projectId, projectId))
        .orderBy(desc(researchUpdates.date));
    }
    return await db
      .select()
      .from(researchUpdates)
      .orderBy(desc(researchUpdates.date));
  }

  async createResearchUpdate(update: InsertResearchUpdate): Promise<ResearchUpdate> {
    const [created] = await db.insert(researchUpdates).values(update).returning();
    return created;
  }

  async getResearchTimeline(): Promise<{ project: ResearchProject; updates: ResearchUpdate[] }[]> {
    const projects = await this.getResearchProjects();
    const result = await Promise.all(
      projects.map(async (project) => {
        const updates = await this.getResearchUpdates(project.id);
        return { project, updates };
      })
    );
    return result;
  }

  // Google Drive Import Tracking
  async getGdriveImportedFileIds(): Promise<string[]> {
    const rows = await db.select({ fileId: gdriveImportedFiles.fileId }).from(gdriveImportedFiles);
    return rows.map(r => r.fileId);
  }

  async markGdriveFileImported(fileId: string, fileName: string, updatesCreated: number): Promise<void> {
    await db.insert(gdriveImportedFiles).values({ fileId, fileName, updatesCreated });
  }

  async updateGdriveSettings(updates: { gdriveFolderId?: string | null; gdriveFolderName?: string | null; gdriveAutoSync?: boolean; lastGdriveSyncAt?: Date }): Promise<void> {
    const existing = await this.getIntegrationSettings();
    if (!existing) return;
    await db.update(integrationSettings).set({ ...updates, updatedAt: new Date() }).where(eq(integrationSettings.id, existing.id));
  }

  // Hypotheses
  async getHypotheses(): Promise<Hypothesis[]> {
    return await db.select().from(hypotheses).orderBy(hypotheses.title);
  }

  async getHypothesis(id: string): Promise<Hypothesis | undefined> {
    const [hypothesis] = await db.select().from(hypotheses).where(eq(hypotheses.id, id));
    return hypothesis || undefined;
  }

  async getHypothesisByFilename(filename: string): Promise<Hypothesis | undefined> {
    const [hypothesis] = await db.select().from(hypotheses).where(eq(hypotheses.filename, filename));
    return hypothesis || undefined;
  }

  async createHypothesis(hypothesis: InsertHypothesis): Promise<Hypothesis> {
    const [created] = await db.insert(hypotheses).values(hypothesis).returning();
    return created;
  }

  async updateHypothesis(id: string, updates: Partial<InsertHypothesis>): Promise<Hypothesis | undefined> {
    const [updated] = await db
      .update(hypotheses)
      .set({ ...updates, syncedAt: new Date() })
      .where(eq(hypotheses.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteHypothesis(id: string): Promise<void> {
    await db.delete(hypotheses).where(eq(hypotheses.id, id));
  }

  // Project-Hypothesis Links
  async getProjectHypotheses(projectId: string): Promise<(ProjectHypothesis & { hypothesis: Hypothesis })[]> {
    const links = await db
      .select()
      .from(projectHypotheses)
      .where(eq(projectHypotheses.projectId, projectId));
    
    const result = await Promise.all(
      links.map(async (link) => {
        const hypothesis = await this.getHypothesis(link.hypothesisId);
        return { ...link, hypothesis: hypothesis! };
      })
    );
    return result.filter(r => r.hypothesis);
  }

  async getHypothesisProjects(hypothesisId: string): Promise<(ProjectHypothesis & { project: ResearchProject })[]> {
    const links = await db
      .select()
      .from(projectHypotheses)
      .where(eq(projectHypotheses.hypothesisId, hypothesisId));
    
    const result = await Promise.all(
      links.map(async (link) => {
        const project = await this.getResearchProject(link.projectId);
        return { ...link, project: project! };
      })
    );
    return result.filter(r => r.project);
  }

  async getAllProjectHypothesisLinks(): Promise<ProjectHypothesis[]> {
    return await db.select().from(projectHypotheses);
  }

  async linkProjectHypothesis(link: InsertProjectHypothesis): Promise<ProjectHypothesis> {
    const [created] = await db.insert(projectHypotheses).values(link).returning();
    return created;
  }

  async unlinkProjectHypothesis(projectId: string, hypothesisId: string): Promise<void> {
    await db
      .delete(projectHypotheses)
      .where(
        and(
          eq(projectHypotheses.projectId, projectId),
          eq(projectHypotheses.hypothesisId, hypothesisId)
        )
      );
  }

  async getHypothesisActivity(): Promise<Array<{
    hypothesis: Hypothesis;
    totalUpdates: number;
    lastActivityDate: string | null;
    linkedProjects: Array<{ id: string; name: string; color: string | null; updateCount: number }>;
  }>> {
    const allHypotheses = await this.getHypotheses();
    
    return await Promise.all(
      allHypotheses.map(async (hypothesis) => {
        const linkedProjectsData = await this.getHypothesisProjects(hypothesis.id);
        
        let totalUpdates = 0;
        let lastActivityDate: string | null = null;
        
        const linkedProjects = await Promise.all(
          linkedProjectsData.map(async (link) => {
            const updates = await db
              .select()
              .from(researchUpdates)
              .where(eq(researchUpdates.projectId, link.projectId))
              .orderBy(desc(researchUpdates.date));
            
            totalUpdates += updates.length;
            
            if (updates.length > 0) {
              const projectLastUpdate = updates[0].date.toISOString();
              if (!lastActivityDate || projectLastUpdate > lastActivityDate) {
                lastActivityDate = projectLastUpdate;
              }
            }
            
            return {
              id: link.project.id,
              name: link.project.name,
              color: link.project.color,
              updateCount: updates.length,
            };
          })
        );
        
        return {
          hypothesis,
          totalUpdates,
          lastActivityDate,
          linkedProjects,
        };
      })
    );
  }

  async getHypothesisActivityTimeline(): Promise<Array<{
    hypothesisId: string;
    hypothesisTitle: string;
    data: Array<{ week: string; count: number }>;
  }>> {
    const allHypotheses = await this.getHypotheses();
    
    // Get last 12 weeks of data
    const weeks: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const weekDate = new Date(now);
      weekDate.setDate(weekDate.getDate() - (i * 7));
      const weekStr = format(weekDate, 'yyyy-MM-dd');
      weeks.push(weekStr);
    }
    
    return await Promise.all(
      allHypotheses.map(async (hypothesis) => {
        const linkedProjectsData = await this.getHypothesisProjects(hypothesis.id);
        
        // Get all updates from linked projects
        const allUpdates: Date[] = [];
        await Promise.all(
          linkedProjectsData.map(async (link) => {
            const updates = await db
              .select({ date: researchUpdates.date })
              .from(researchUpdates)
              .where(eq(researchUpdates.projectId, link.projectId));
            
            updates.forEach(u => allUpdates.push(u.date));
          })
        );
        
        // Aggregate by week
        const weekCounts = new Map<string, number>();
        weeks.forEach(w => weekCounts.set(w, 0));
        
        allUpdates.forEach(updateDate => {
          // Find which week this update belongs to
          const updateTime = updateDate.getTime();
          for (let i = 0; i < weeks.length; i++) {
            const weekStart = new Date(weeks[i]).getTime();
            // Each week spans 7 days
            const weekEnd = weekStart + (7 * 24 * 60 * 60 * 1000);
            
            if (updateTime >= weekStart && updateTime < weekEnd) {
              weekCounts.set(weeks[i], (weekCounts.get(weeks[i]) || 0) + 1);
              break;
            }
          }
        });
        
        return {
          hypothesisId: hypothesis.id,
          hypothesisTitle: hypothesis.title,
          data: weeks.map(week => ({
            week: format(new Date(week), 'MMM d'),
            count: weekCounts.get(week) || 0,
          })),
        };
      })
    );
  }

  // Papers
  async getPapers(): Promise<Paper[]> {
    return await db.select().from(papers).orderBy(papers.title);
  }

  async getPaperByPaperId(paperId: string): Promise<Paper | undefined> {
    const [paper] = await db.select().from(papers).where(eq(papers.paperId, paperId));
    return paper || undefined;
  }

  async upsertPaper(paper: InsertPaper): Promise<Paper> {
    const existing = await this.getPaperByPaperId(paper.paperId);
    
    if (existing) {
      const [updated] = await db
        .update(papers)
        .set({ ...paper, syncedAt: new Date() })
        .where(eq(papers.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(papers).values(paper).returning();
      return created;
    }
  }

  // Collaborators
  async getCollaborators(): Promise<Collaborator[]> {
    return await db.select().from(collaborators).orderBy(desc(collaborators.hIndex));
  }

  async getCollaborator(id: string): Promise<Collaborator | undefined> {
    const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.id, id));
    return collaborator || undefined;
  }

  async getCollaboratorByName(name: string): Promise<Collaborator | undefined> {
    const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.name, name));
    return collaborator || undefined;
  }

  async getCollaboratorByOpenAlexId(openalexId: string): Promise<Collaborator | undefined> {
    const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.openalexId, openalexId));
    return collaborator || undefined;
  }

  async createCollaborator(collaborator: InsertCollaborator): Promise<Collaborator> {
    const [created] = await db.insert(collaborators).values(collaborator).returning();
    return created;
  }

  async updateCollaborator(id: string, updates: Partial<InsertCollaborator>): Promise<Collaborator | undefined> {
    const [updated] = await db
      .update(collaborators)
      .set(updates)
      .where(eq(collaborators.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCollaborator(id: string): Promise<void> {
    await db.delete(collaborators).where(eq(collaborators.id, id));
  }

  // Paper-Collaborator Links
  async getPaperCollaborators(paperId: string): Promise<Array<PaperCollaborator & { collaborator: Collaborator }>> {
    const links = await db
      .select()
      .from(paperCollaborators)
      .innerJoin(collaborators, eq(paperCollaborators.collaboratorId, collaborators.id))
      .where(eq(paperCollaborators.paperId, paperId));
    
    return links.map(l => ({
      ...l.paper_collaborators,
      collaborator: l.collaborators,
    }));
  }

  async getCollaboratorPapers(collaboratorId: string): Promise<Array<PaperCollaborator & { paper: Paper }>> {
    const links = await db
      .select()
      .from(paperCollaborators)
      .innerJoin(papers, eq(paperCollaborators.paperId, papers.id))
      .where(eq(paperCollaborators.collaboratorId, collaboratorId));
    
    return links.map(l => ({
      ...l.paper_collaborators,
      paper: l.papers,
    }));
  }

  async linkPaperCollaborator(link: InsertPaperCollaborator): Promise<PaperCollaborator> {
    const existing = await db
      .select()
      .from(paperCollaborators)
      .where(and(
        eq(paperCollaborators.paperId, link.paperId),
        eq(paperCollaborators.collaboratorId, link.collaboratorId)
      ));
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    const [created] = await db.insert(paperCollaborators).values(link).returning();
    return created;
  }

  async unlinkPaperCollaborator(paperId: string, collaboratorId: string): Promise<void> {
    await db
      .delete(paperCollaborators)
      .where(and(
        eq(paperCollaborators.paperId, paperId),
        eq(paperCollaborators.collaboratorId, collaboratorId)
      ));
  }

  async getPapersWithCollaborators(): Promise<Array<Paper & { collaborators: Collaborator[]; maxHIndex: number | null }>> {
    const allPapers = await db.select().from(papers).orderBy(papers.title);
    
    const result = await Promise.all(
      allPapers.map(async (paper) => {
        const links = await this.getPaperCollaborators(paper.id);
        const paperCollabs = links.map(l => l.collaborator);
        const maxHIndex = paperCollabs.length > 0 
          ? Math.max(...paperCollabs.map(c => c.hIndex || 0))
          : null;
        
        return {
          ...paper,
          collaborators: paperCollabs,
          maxHIndex,
        };
      })
    );
    
    return result;
  }

  // Milestones
  async getMilestones(projectId?: string): Promise<Milestone[]> {
    if (projectId) {
      return db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(desc(milestones.month));
    }
    return db.select().from(milestones).orderBy(desc(milestones.month));
  }

  async getMilestone(id: string): Promise<Milestone | undefined> {
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, id));
    return milestone || undefined;
  }

  async getMilestoneByProjectAndMonth(projectId: string, month: string): Promise<Milestone | undefined> {
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(and(eq(milestones.projectId, projectId), eq(milestones.month, month)));
    return milestone || undefined;
  }

  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [created] = await db.insert(milestones).values({
      ...milestone,
      customQuestions: (milestone.customQuestions || []) as { label: string; required: boolean }[],
    }).returning();
    return created;
  }

  async updateMilestone(id: string, updates: Partial<InsertMilestone>): Promise<Milestone | undefined> {
    const setData: any = { ...updates, updatedAt: new Date() };
    if (updates.customQuestions !== undefined) {
      setData.customQuestions = updates.customQuestions as { label: string; required: boolean }[];
    }
    const [updated] = await db
      .update(milestones)
      .set(setData)
      .where(eq(milestones.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteMilestone(id: string): Promise<void> {
    await db.delete(milestones).where(eq(milestones.id, id));
  }

  // Milestone Submissions
  async getMilestoneSubmissions(milestoneId?: string): Promise<MilestoneSubmission[]> {
    if (milestoneId) {
      return db.select().from(milestoneSubmissions).where(eq(milestoneSubmissions.milestoneId, milestoneId)).orderBy(desc(milestoneSubmissions.submittedAt));
    }
    return db.select().from(milestoneSubmissions).orderBy(desc(milestoneSubmissions.submittedAt));
  }

  async getRecentMilestoneSubmissions(startDate: Date, endDate: Date): Promise<Array<MilestoneSubmission & { milestone: Milestone; project: ResearchProject }>> {
    const submissions = await db
      .select()
      .from(milestoneSubmissions)
      .innerJoin(milestones, eq(milestoneSubmissions.milestoneId, milestones.id))
      .innerJoin(researchProjects, eq(milestones.projectId, researchProjects.id))
      .where(
        and(
          gte(milestoneSubmissions.submittedAt, startDate),
          sql`${milestoneSubmissions.submittedAt} <= ${endDate}`
        )
      )
      .orderBy(desc(milestoneSubmissions.submittedAt));
    
    return submissions.map(s => ({
      ...s.milestone_submissions,
      milestone: s.milestones,
      project: s.research_projects,
    }));
  }

  async getMilestoneSubmission(id: string): Promise<MilestoneSubmission | undefined> {
    const [submission] = await db.select().from(milestoneSubmissions).where(eq(milestoneSubmissions.id, id));
    return submission || undefined;
  }

  async createMilestoneSubmission(submission: InsertMilestoneSubmission): Promise<MilestoneSubmission> {
    const [created] = await db.insert(milestoneSubmissions).values(submission).returning();
    return created;
  }

  // Team Leads
  async getTeamLeads(projectId?: string): Promise<TeamLead[]> {
    if (projectId) {
      return db.select().from(teamLeads).where(eq(teamLeads.projectId, projectId));
    }
    return db.select().from(teamLeads);
  }

  async getTeamLead(id: string): Promise<TeamLead | undefined> {
    const [lead] = await db.select().from(teamLeads).where(eq(teamLeads.id, id));
    return lead || undefined;
  }

  async createTeamLead(teamLead: InsertTeamLead): Promise<TeamLead> {
    const [created] = await db.insert(teamLeads).values(teamLead).returning();
    return created;
  }

  async updateTeamLead(id: string, updates: Partial<InsertTeamLead>): Promise<TeamLead | undefined> {
    const [updated] = await db
      .update(teamLeads)
      .set(updates)
      .where(eq(teamLeads.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTeamLead(id: string): Promise<void> {
    await db.delete(teamLeads).where(eq(teamLeads.id, id));
  }

  // Admin Emails
  async getAdminEmails(): Promise<AdminEmail[]> {
    return db.select().from(adminEmails);
  }

  async getActiveAdminEmails(): Promise<string[]> {
    const emails = await db
      .select({ email: adminEmails.email })
      .from(adminEmails)
      .where(eq(adminEmails.isActive, true));
    return emails.map(e => e.email);
  }

  async createAdminEmail(adminEmail: InsertAdminEmail): Promise<AdminEmail> {
    const [created] = await db.insert(adminEmails).values(adminEmail).returning();
    return created;
  }

  async deleteAdminEmail(id: string): Promise<void> {
    await db.delete(adminEmails).where(eq(adminEmails.id, id));
  }

  // Microgrant Applications
  async getMicrograntApplications(status?: string): Promise<MicrograntApplication[]> {
    if (status) {
      return db.select().from(micrograntApplications)
        .where(eq(micrograntApplications.status, status))
        .orderBy(desc(micrograntApplications.submittedAt));
    }
    return db.select().from(micrograntApplications).orderBy(desc(micrograntApplications.submittedAt));
  }

  async getMicrograntApplication(id: string): Promise<MicrograntApplication | undefined> {
    const [application] = await db.select().from(micrograntApplications).where(eq(micrograntApplications.id, id));
    return application || undefined;
  }

  async createMicrograntApplication(application: InsertMicrograntApplication): Promise<MicrograntApplication> {
    const [created] = await db.insert(micrograntApplications).values(application).returning();
    return created;
  }

  async updateMicrograntApplication(id: string, updates: Partial<InsertMicrograntApplication>): Promise<MicrograntApplication | undefined> {
    const [updated] = await db
      .update(micrograntApplications)
      .set(updates)
      .where(eq(micrograntApplications.id, id))
      .returning();
    return updated || undefined;
  }

  // Grant Comments
  async getGrantComments(applicationId: string): Promise<GrantComment[]> {
    return db.select().from(grantComments)
      .where(eq(grantComments.applicationId, applicationId))
      .orderBy(desc(grantComments.createdAt));
  }

  async createGrantComment(comment: InsertGrantComment): Promise<GrantComment> {
    const [created] = await db.insert(grantComments).values(comment).returning();
    return created;
  }

  // External Apps
  async getExternalApps(): Promise<ExternalApp[]> {
    return db.select().from(externalApps).orderBy(desc(externalApps.createdAt));
  }

  async getExternalAppByKey(apiKey: string): Promise<ExternalApp | undefined> {
    const [app] = await db.select().from(externalApps).where(eq(externalApps.apiKey, apiKey));
    return app || undefined;
  }

  async createExternalApp(app: InsertExternalApp): Promise<ExternalApp> {
    const [created] = await db.insert(externalApps).values(app).returning();
    return created;
  }

  async deleteExternalApp(id: string): Promise<void> {
    await db.delete(externalApps).where(eq(externalApps.id, id));
  }

  // External App Stats
  async createExternalAppStats(stats: InsertExternalAppStats): Promise<ExternalAppStats> {
    const [created] = await db.insert(externalAppStats).values(stats).returning();
    return created;
  }

  async getExternalAppStats(appName?: string, limit = 100): Promise<ExternalAppStats[]> {
    const query = db.select().from(externalAppStats);
    if (appName) {
      return query.where(eq(externalAppStats.appName, appName)).orderBy(desc(externalAppStats.receivedAt)).limit(limit);
    }
    return query.orderBy(desc(externalAppStats.receivedAt)).limit(limit);
  }

  // Things
  async getThings(): Promise<Thing[]> {
    return db.select().from(things).orderBy(desc(things.updatedAt));
  }

  async getThing(id: string): Promise<Thing | undefined> {
    const [thing] = await db.select().from(things).where(eq(things.id, id));
    return thing || undefined;
  }

  async createThing(thing: InsertThing): Promise<Thing> {
    const [created] = await db.insert(things).values(thing).returning();
    return created;
  }

  async updateThing(id: string, updates: Partial<InsertThing>): Promise<Thing | undefined> {
    const [updated] = await db
      .update(things)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(things.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteThing(id: string): Promise<void> {
    await db.delete(things).where(eq(things.id, id));
  }
}

export const storage = new DatabaseStorage();
