import PDFDocument from "pdfkit";
import { storage } from "../storage";
import { format, subDays } from "date-fns";

export class ReportService {
  async generateMonthlyPDF(months: number = 1): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    const days = months * 30;
    const endDate = new Date();
    const startDate = subDays(endDate, days);
    const dateRange = `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;
    const periodLabel = months === 1 ? "Monthly" : `${months}-Month`;

    doc.fontSize(24).font("Helvetica-Bold").text(`${periodLabel} Research Operations Report`, { align: "center" });
    doc.fontSize(12).font("Helvetica").text(dateRange, { align: "center" });
    doc.moveDown(2);

    await this.addPapersSection(doc);
    doc.addPage();

    await this.addRepositorySection(doc, startDate, days);
    doc.addPage();

    await this.addMilestoneSection(doc, months);
    doc.addPage();

    await this.addResearchSection(doc);

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  private async addPapersSection(doc: PDFKit.PDFDocument) {
    doc.fontSize(18).font("Helvetica-Bold").text("Papers Pipeline", { underline: true });
    doc.moveDown();

    const papers = await storage.getPapersWithCollaborators();

    if (papers.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No papers in the pipeline.");
      return;
    }

    const stageNames: Record<string, string> = { before: "Draft", mid: "Review", after: "Published" };

    for (const paper of papers) {
      doc.fontSize(14).font("Helvetica-Bold").text(paper.title);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Stage: ${stageNames[paper.currentStage] || paper.currentStage}`);

      // Calculate progress
      const stage = paper.stages?.[paper.currentStage as "before" | "mid" | "after"];
      const progress = stage?.completion_percentage ?? 0;
      doc.text(`Progress: ${Math.round(progress)}%`);

      // Collaborators
      if (paper.collaborators && paper.collaborators.length > 0) {
        const collabText = paper.collaborators
          .map((c) => `${c.name}${c.hIndex ? ` (h: ${c.hIndex})` : ""}`)
          .join(", ");
        doc.text(`Collaborators: ${collabText}`);
        if (paper.maxHIndex) {
          doc.text(`Highest h-index: ${paper.maxHIndex}`);
        }
      }

      doc.moveDown();
    }
  }

  private async addRepositorySection(doc: PDFKit.PDFDocument, startDate: Date, days: number = 30) {
    doc.fontSize(18).font("Helvetica-Bold").text("Repository Activity", { underline: true });
    doc.moveDown();

    const repos = await storage.getRepositories();
    const activity = await storage.getRecentActivity(days);

    doc.fontSize(12).font("Helvetica");
    doc.text(`Total Repositories: ${repos.length}`);
    doc.text(`Total Activity Events (${days} days): ${activity.length}`);
    doc.moveDown();

    // Group activity by repo
    const repoActivity: Record<string, number> = {};
    for (const event of activity) {
      repoActivity[event.repositoryId] = (repoActivity[event.repositoryId] || 0) + 1;
    }

    // Top repos by activity
    const repoMap = new Map(repos.map((r) => [r.id, r]));
    const topRepos = Object.entries(repoActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topRepos.length > 0) {
      doc.fontSize(14).font("Helvetica-Bold").text("Top Active Repositories:");
      doc.fontSize(10).font("Helvetica");
      for (const [repoId, count] of topRepos) {
        const repo = repoMap.get(repoId);
        if (repo) {
          doc.text(`  • ${repo.fullName}: ${count} events`);
        }
      }
    }
    doc.moveDown();

    // Commits summary
    const commits = activity.filter((a) => a.eventType === "commit" || a.eventType === "push");
    doc.text(`Total Commits: ${commits.length}`);
  }

  private async addMilestoneSection(doc: PDFKit.PDFDocument, months: number) {
    doc.fontSize(18).font("Helvetica-Bold").text("Milestone Progress", { underline: true });
    doc.moveDown();

    const now = new Date();
    const milestones = await storage.getMilestones();
    const projects = await storage.getResearchProjects();
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const submissions = await storage.getMilestoneSubmissions();

    const targetMonths: string[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      targetMonths.push(format(d, "yyyy-MM"));
    }

    const relevantMilestones = milestones.filter(m => targetMonths.includes(m.month));

    if (relevantMilestones.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No milestones for the selected period.");
      return;
    }

    const byMonth = new Map<string, typeof relevantMilestones>();
    for (const m of relevantMilestones) {
      const list = byMonth.get(m.month) || [];
      list.push(m);
      byMonth.set(m.month, list);
    }

    for (const month of targetMonths.sort().reverse()) {
      const monthMilestones = byMonth.get(month);
      if (!monthMilestones) continue;

      doc.fontSize(14).font("Helvetica-Bold").text(format(new Date(month + "-01"), "MMMM yyyy"));
      doc.moveDown(0.5);

      for (const milestone of monthMilestones) {
        const project = projectMap.get(milestone.projectId);
        const subs = submissions.filter(s => s.milestoneId === milestone.id);

        doc.fontSize(12).font("Helvetica-Bold").text(project?.name || "Unknown Project");
        doc.fontSize(10).font("Helvetica");
        const desc = milestone.description.slice(0, 200) + (milestone.description.length > 200 ? "..." : "");
        doc.text(`Goal: ${desc}`);
        doc.text(`Submissions: ${subs.length}`);

        for (const sub of subs) {
          doc.text(`  • ${sub.teamLeadEmail}: ${sub.progressSummary?.slice(0, 120) || "No summary"}`, { indent: 10 });
          if (sub.challenges) {
            doc.text(`    Challenges: ${sub.challenges.slice(0, 100)}`, { indent: 15 });
          }
        }
        doc.moveDown(0.5);
      }
      doc.moveDown();
    }
  }

  private async addResearchSection(doc: PDFKit.PDFDocument) {
    doc.fontSize(18).font("Helvetica-Bold").text("Research Projects", { underline: true });
    doc.moveDown();

    const timeline = await storage.getResearchTimeline();

    if (timeline.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No research projects found.");
      return;
    }

    doc.fontSize(12).font("Helvetica");
    doc.text(`Active Projects: ${timeline.length}`);
    
    const totalUpdates = timeline.reduce((sum, t) => sum + t.updates.length, 0);
    doc.text(`Total Updates: ${totalUpdates}`);
    doc.moveDown();

    for (const project of timeline) {
      doc.fontSize(14).font("Helvetica-Bold").text(project.project.name);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Updates: ${project.updates.length}`);

      // Recent updates (last 3)
      const recentUpdates = project.updates.slice(0, 3);
      for (const update of recentUpdates) {
        const date = format(new Date(update.date), "MMM d");
        const desc = update.description.slice(0, 100) + (update.description.length > 100 ? "..." : "");
        doc.text(`  [${date}] ${desc}`, { indent: 10 });
      }
      doc.moveDown(0.5);
    }
  }
}

export const reportService = new ReportService();
