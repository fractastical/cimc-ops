import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Integration settings for Slack and GitHub
export const integrationSettings = pgTable("integration_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slackWebhookUrl: text("slack_webhook_url"),
  slackBotToken: text("slack_bot_token"),
  slackChannel: text("slack_channel").default("#ops"),
  githubToken: text("github_token"),
  githubOrganization: text("github_organization"), // Organization to monitor
  enableRealtimeAlerts: boolean("enable_realtime_alerts").default(false).notNull(),
  enableDailySummary: boolean("enable_daily_summary").default(true).notNull(),
  dailySummaryTime: text("daily_summary_time").default("09:00").notNull(), // HH:mm format
  enableWeeklySummary: boolean("enable_weekly_summary").default(true).notNull(),
  weeklySummaryDay: text("weekly_summary_day").default("monday").notNull(), // Day of week
  weeklySummaryTime: text("weekly_summary_time").default("09:00").notNull(), // HH:mm format
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntegrationSettingsSchema = createInsertSchema(integrationSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertIntegrationSettings = z.infer<typeof insertIntegrationSettingsSchema>;
export type IntegrationSettings = typeof integrationSettings.$inferSelect;

// GitHub repositories to monitor
export const repositories = pgTable("repositories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(), // e.g., "owner/repo"
  description: text("description"),
  language: text("language"),
  stars: integer("stars").default(0).notNull(),
  forks: integer("forks").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  webhookId: text("webhook_id"), // GitHub webhook ID for cleanup
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRepositorySchema = createInsertSchema(repositories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type Repository = typeof repositories.$inferSelect;

// Activity log for GitHub events
export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repositoryId: varchar("repository_id").notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(), // push, pull_request, issues, release, etc.
  author: text("author").notNull(),
  message: text("message").notNull(),
  url: text("url"),
  metadata: jsonb("metadata"), // Store additional event data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  activityDate: timestamp("activity_date"), // The actual date of the activity (for historical data)
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

// Research projects and updates
export const researchProjects = pgTable("research_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").default("#10b981"), // For visualization
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertResearchProjectSchema = createInsertSchema(researchProjects).omit({
  id: true,
  createdAt: true,
});

export type InsertResearchProject = z.infer<typeof insertResearchProjectSchema>;
export type ResearchProject = typeof researchProjects.$inferSelect;

export const researchUpdates = pgTable("research_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  grantee: text("grantee"), // Person who gave the update
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertResearchUpdateSchema = createInsertSchema(researchUpdates).omit({
  id: true,
  createdAt: true,
});

export type InsertResearchUpdate = z.infer<typeof insertResearchUpdateSchema>;
export type ResearchUpdate = typeof researchUpdates.$inferSelect;

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

// Slack message history (for display in the UI)
export const slackMessages = pgTable("slack_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  user: text("user").notNull(),
  message: text("message").notNull(),
  isBot: boolean("is_bot").default(false).notNull(),
  channel: text("channel").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertSlackMessageSchema = createInsertSchema(slackMessages).omit({
  id: true,
  timestamp: true,
});

export type InsertSlackMessage = z.infer<typeof insertSlackMessageSchema>;
export type SlackMessage = typeof slackMessages.$inferSelect;

// Hypotheses from GitHub repository
export const hypotheses = pgTable("hypotheses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull().unique(), // e.g., "hypothesis-1.md"
  title: text("title").notNull(),
  content: text("content").notNull(), // Full markdown content
  summary: text("summary"), // Short summary extracted from content
  status: text("status").default("active"), // active, validated, invalidated, archived
  sha: text("sha"), // Git SHA for detecting updates
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHypothesisSchema = createInsertSchema(hypotheses).omit({
  id: true,
  createdAt: true,
  syncedAt: true,
});

export type InsertHypothesis = z.infer<typeof insertHypothesisSchema>;
export type Hypothesis = typeof hypotheses.$inferSelect;

// Link between research projects and hypotheses (many-to-many)
export const projectHypotheses = pgTable("project_hypotheses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  hypothesisId: varchar("hypothesis_id").notNull().references(() => hypotheses.id, { onDelete: 'cascade' }),
  relationship: text("relationship").default("tests"), // tests, supports, extends, challenges
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectHypothesisSchema = createInsertSchema(projectHypotheses).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectHypothesis = z.infer<typeof insertProjectHypothesisSchema>;
export type ProjectHypothesis = typeof projectHypotheses.$inferSelect;
