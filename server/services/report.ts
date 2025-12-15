import PDFDocument from "pdfkit";
import { storage } from "../storage";
import { format, subDays } from "date-fns";

export class ReportService {
  async generateMonthlyPDF(): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const dateRange = `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;

    // Header
    doc.fontSize(24).font("Helvetica-Bold").text("Monthly Research Operations Report", { align: "center" });
    doc.fontSize(12).font("Helvetica").text(dateRange, { align: "center" });
    doc.moveDown(2);

    // Papers Pipeline Section
    await this.addPapersSection(doc);
    doc.addPage();

    // Repository Activity Section
    await this.addRepositorySection(doc, startDate);
    doc.addPage();

    // Research Projects Section
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

  private async addRepositorySection(doc: PDFKit.PDFDocument, startDate: Date) {
    doc.fontSize(18).font("Helvetica-Bold").text("Repository Activity", { underline: true });
    doc.moveDown();

    const repos = await storage.getRepositories();
    const activity = await storage.getRecentActivity(30);

    doc.fontSize(12).font("Helvetica");
    doc.text(`Total Repositories: ${repos.length}`);
    doc.text(`Total Activity Events (30 days): ${activity.length}`);
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
