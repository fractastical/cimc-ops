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
  users,
  integrationSettings,
  repositories,
  activityLog,
  slackMessages,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { subDays } from "date-fns";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Integration Settings
  getIntegrationSettings(): Promise<IntegrationSettings | undefined>;
  upsertIntegrationSettings(settings: InsertIntegrationSettings): Promise<IntegrationSettings>;

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
  getActivityByRepository(repositoryId: string, days?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityStats(repositoryId: string, days?: number): Promise<{ date: string; count: number }[]>;

  // Slack Messages
  getRecentSlackMessages(limit?: number): Promise<SlackMessage[]>;
  createSlackMessage(message: InsertSlackMessage): Promise<SlackMessage>;
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
    return await db
      .select()
      .from(activityLog)
      .where(gte(activityLog.createdAt, cutoff))
      .orderBy(desc(activityLog.createdAt))
      .limit(100);
  }

  async getActivityByRepository(repositoryId: string, days: number = 30): Promise<ActivityLog[]> {
    const cutoff = subDays(new Date(), days);
    return await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          gte(activityLog.createdAt, cutoff)
        )
      )
      .orderBy(desc(activityLog.createdAt));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLog).values(log).returning();
    return created;
  }

  async getActivityStats(repositoryId: string, days: number = 60): Promise<{ date: string; count: number }[]> {
    const cutoff = subDays(new Date(), days);
    
    const stats = await db
      .select({
        date: sql<string>`DATE(${activityLog.createdAt})`.as('date'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.repositoryId, repositoryId),
          gte(activityLog.createdAt, cutoff)
        )
      )
      .groupBy(sql`DATE(${activityLog.createdAt})`)
      .orderBy(sql`DATE(${activityLog.createdAt})`);

    return stats;
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
}

export const storage = new DatabaseStorage();
