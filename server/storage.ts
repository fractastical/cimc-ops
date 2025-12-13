import { 
  type User, 
  type InsertUser,
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
  users,
  integrationSettings,
  repositories,
  activityLog,
  slackMessages,
  researchProjects,
  researchUpdates,
  hypotheses,
  projectHypotheses,
  papers,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { subDays, format } from "date-fns";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Integration Settings
  getIntegrationSettings(): Promise<IntegrationSettings | undefined>;
  upsertIntegrationSettings(settings: InsertIntegrationSettings): Promise<IntegrationSettings>;
  updateSchedulerTimestamp(type: "daily" | "weekly", timestamp: Date): Promise<void>;

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
  deleteResearchProject(id: string): Promise<void>;

  // Research Updates
  getResearchUpdates(projectId?: string): Promise<ResearchUpdate[]>;
  createResearchUpdate(update: InsertResearchUpdate): Promise<ResearchUpdate>;
  getResearchTimeline(): Promise<{ project: ResearchProject; updates: ResearchUpdate[] }[]>;

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
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
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

  async updateSchedulerTimestamp(type: "daily" | "weekly", timestamp: Date): Promise<void> {
    const existing = await this.getIntegrationSettings();
    if (!existing) return;

    if (type === "daily") {
      await db
        .update(integrationSettings)
        .set({ lastDailySentAt: timestamp })
        .where(eq(integrationSettings.id, existing.id));
    } else {
      await db
        .update(integrationSettings)
        .set({ lastWeeklySentAt: timestamp })
        .where(eq(integrationSettings.id, existing.id));
    }
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

  async deleteResearchProject(id: string): Promise<void> {
    await db.delete(researchProjects).where(eq(researchProjects.id, id));
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
}

export const storage = new DatabaseStorage();
