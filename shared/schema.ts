import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Legacy local user auth (renamed to avoid conflict with Replit Auth users table)
export const localUsers = pgTable("local_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertLocalUserSchema = createInsertSchema(localUsers).pick({
  username: true,
  password: true,
});

export type InsertLocalUser = z.infer<typeof insertLocalUserSchema>;
export type LocalUser = typeof localUsers.$inferSelect;

// Re-export Replit Auth users and sessions tables
export * from "./models/auth";

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
  lastDailySentAt: timestamp("last_daily_sent_at"), // Prevent duplicate sends
  lastWeeklySentAt: timestamp("last_weekly_sent_at"), // Prevent duplicate sends
  monthlyReminderTime: text("monthly_reminder_time").default("09:00").notNull(), // HH:mm format
  milestoneQuestions: jsonb("milestone_questions").$type<{ label: string; required: boolean }[]>().default([
    { label: "What milestone did you make progress on?", required: true },
    { label: "What was completed?", required: true },
    { label: "What is planned next?", required: true },
    { label: "Any block or delays?", required: false },
  ]),
  lastMonthlySentAt: timestamp("last_monthly_sent_at"), // Prevent duplicate sends
  gdriveFolderId: text("gdrive_folder_id"),
  gdriveFolderName: text("gdrive_folder_name"),
  gdriveAutoSync: boolean("gdrive_auto_sync").default(false).notNull(),
  lastGdriveSyncAt: timestamp("last_gdrive_sync_at"),
  lastGithubSyncAt: timestamp("last_github_sync_at"),
  weeklyAnalyticsEmails: text("weekly_analytics_emails").default("emily@cimc.ai,erik@cimc.ai,joel@cimc.ai").notNull(),
  enableMonthlyReminder: boolean("enable_monthly_reminder").default(false).notNull(),
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
  status: text("status").default("active"), // active, completed, on-hold, archived
  hIndex: integer("h_index").default(0), // Aggregate h-index from collaborators
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

export const gdriveImportedFiles = pgTable("gdrive_imported_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: text("file_id").notNull(),
  fileName: text("file_name").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  updatesCreated: integer("updates_created").default(0).notNull(),
});

export type GdriveImportedFile = typeof gdriveImportedFiles.$inferSelect;

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

// Papers pipeline from GitHub repository
export const papers = pgTable("papers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: text("paper_id").notNull().unique(), // e.g., "paper-001"
  latexFile: text("latex_file"), // e.g., "paper-001.tex"
  title: text("title").notNull(),
  currentStage: text("current_stage").notNull(), // before, mid, after
  stages: jsonb("stages").notNull(), // Full stage/factor JSON data
  lastUpdated: timestamp("last_updated"), // From the paper JSON
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const insertPaperSchema = createInsertSchema(papers).omit({
  id: true,
  syncedAt: true,
});

export type InsertPaper = z.infer<typeof insertPaperSchema>;
export type Paper = typeof papers.$inferSelect;

// TypeScript interfaces for the stages/factors structure
export interface PaperFactor {
  current: number;
  target: number | null;
  description?: string;
  partner_list?: string[];
  venue_name?: string | null;
}

export interface PaperStage {
  stage_name: string;
  completed: boolean;
  factors: Record<string, PaperFactor>;
}

export interface PaperStages {
  before: PaperStage;
  mid: PaperStage;
  after: PaperStage;
}

// Collaborators (authors with h-index from OpenAlex)
export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  openalexId: text("openalex_id"),
  hIndex: integer("h_index"),
  citationCount: integer("citation_count"),
  worksCount: integer("works_count"),
  institution: text("institution"),
  orcid: text("orcid"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCollaboratorSchema = createInsertSchema(collaborators).omit({
  id: true,
  createdAt: true,
});

export type InsertCollaborator = z.infer<typeof insertCollaboratorSchema>;
export type Collaborator = typeof collaborators.$inferSelect;

// Link between papers and collaborators (many-to-many)
export const paperCollaborators = pgTable("paper_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paperId: varchar("paper_id").notNull().references(() => papers.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id, { onDelete: 'cascade' }),
  role: text("role").default("author"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaperCollaboratorSchema = createInsertSchema(paperCollaborators).omit({
  id: true,
  createdAt: true,
});

export type InsertPaperCollaborator = z.infer<typeof insertPaperCollaboratorSchema>;
export type PaperCollaborator = typeof paperCollaborators.$inferSelect;

// Milestones - monthly goals set by admins for each project
export const milestones = pgTable("milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  month: varchar("month", { length: 7 }).notNull(), // Format: "2026-01"
  description: text("description").notNull(),
  customQuestions: jsonb("custom_questions").$type<{ label: string; required: boolean }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMilestoneSchema = createInsertSchema(milestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestones.$inferSelect;

// Milestone submissions - progress updates from team leads
export const milestoneSubmissions = pgTable("milestone_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  milestoneId: varchar("milestone_id").notNull().references(() => milestones.id, { onDelete: 'cascade' }),
  projectId: varchar("project_id").notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  teamLeadName: text("team_lead_name").notNull(),
  teamLeadEmail: text("team_lead_email").notNull(),
  progressSummary: text("progress_summary").notNull(),
  completionPercentage: integer("completion_percentage").default(0),
  challenges: text("challenges"),
  nextSteps: text("next_steps"),
  customAnswers: jsonb("custom_answers").$type<Record<string, string>>().default({}),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const insertMilestoneSubmissionSchema = createInsertSchema(milestoneSubmissions).omit({
  id: true,
  submittedAt: true,
});

export type InsertMilestoneSubmission = z.infer<typeof insertMilestoneSubmissionSchema>;
export type MilestoneSubmission = typeof milestoneSubmissions.$inferSelect;

// Team leads - people who receive milestone reminder emails
export const teamLeads = pgTable("team_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => researchProjects.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamLeadSchema = createInsertSchema(teamLeads).omit({
  id: true,
  createdAt: true,
});

export type InsertTeamLead = z.infer<typeof insertTeamLeadSchema>;
export type TeamLead = typeof teamLeads.$inferSelect;

// Admin emails - people who receive submission notifications
export const adminEmails = pgTable("admin_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminEmailSchema = createInsertSchema(adminEmails).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminEmail = z.infer<typeof insertAdminEmailSchema>;
export type AdminEmail = typeof adminEmails.$inferSelect;

// Admin action log - audit trail for admin actions
export const adminActionsLog = pgTable("admin_actions_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").notNull(),
  actorEmail: text("actor_email"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: varchar("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminActionLogSchema = createInsertSchema(adminActionsLog).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminActionLog = z.infer<typeof insertAdminActionLogSchema>;
export type AdminActionLog = typeof adminActionsLog.$inferSelect;

// Microgrant applications - public applications from potential grantees
export const micrograntApplications = pgTable("microgrant_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  projectDescription: text("project_description").notNull(),
  monthlyDeliverables: text("monthly_deliverables").notNull(), // What they can accomplish in a month
  researchRelevance: text("research_relevance").notNull(), // How it relates to CIMC research objectives
  sfAvailability: text("sf_availability").notNull(), // Dates available in SF
  documentPath: text("document_path"), // Path to uploaded document in object storage
  documentName: text("document_name"), // Original filename of uploaded document
  status: text("status").default("pending").notNull(), // pending, approved, rejected, under_review
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
});

export const insertMicrograntApplicationSchema = createInsertSchema(micrograntApplications).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
});

export type InsertMicrograntApplication = z.infer<typeof insertMicrograntApplicationSchema>;
export type MicrograntApplication = typeof micrograntApplications.$inferSelect;

// Comments/reviews on microgrant applications - allows multiple reviewers
export const grantComments = pgTable("grant_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email"),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGrantCommentSchema = createInsertSchema(grantComments).omit({
  id: true,
  createdAt: true,
});

export type InsertGrantComment = z.infer<typeof insertGrantCommentSchema>;
export type GrantComment = typeof grantComments.$inferSelect;
