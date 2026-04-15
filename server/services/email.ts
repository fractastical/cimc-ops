import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  const fromEmail = 'Research Ops <noreply@cimc.io>';
  return { apiKey: connectionSettings.settings.api_key, fromEmail };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  console.log(`Email service using from address: ${fromEmail}`);
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

// Parses "1) item one 2) item two" or "1. item" style text into an array of strings
function parseNumberedItems(text: string): string[] {
  if (!text) return [];
  // Split on patterns like "1)", "2)", "1.", "2." at start or after whitespace/newline
  const parts = text.split(/(?:\r?\n|\r|(?<=\S))\s*\d+[)\.]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    // Try inline split: "1) foo 2) bar"
    const inlineParts = text.split(/\s+\d+[)\.]\s+/).map(s => s.trim()).filter(Boolean);
    return inlineParts.length > 1 ? inlineParts : [text.trim()];
  }
  return parts;
}

function renderMilestoneDescription(description: string): string {
  const items = parseNumberedItems(description);
  if (items.length <= 1) {
    return `<p style="margin:0;color:#374151;line-height:1.6;white-space:pre-wrap;">${escHtml(description.trim())}</p>`;
  }
  const rows = items.map((item, i) => `
    <div style="display:flex;gap:12px;padding:8px 0;border-bottom:${i < items.length - 1 ? '1px solid #e5e7eb' : 'none'};">
      <span style="flex-shrink:0;width:22px;height:22px;background:#10b981;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:22px;text-align:center;">${i + 1}</span>
      <span style="color:#374151;line-height:1.6;font-size:14px;">${escHtml(item)}</span>
    </div>`).join('');
  return `<div style="margin-top:4px;">${rows}</div>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-family:monospace;font-size:20px;font-weight:700;color:#ffffff;">CIMC<span style="color:#10b981;">.AI</span></span>
              <span style="color:#64748b;font-size:13px;margin-left:8px;">Research Operations</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">Automated notification from Research Ops Mission Control · <a href="https://cimcops.org" style="color:#10b981;text-decoration:none;">cimcops.org</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function fieldBlock(label: string, value: string, isCode = false): string {
  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">${label}</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;${isCode ? 'font-family:monospace;font-size:13px;' : 'font-size:14px;'}color:#1e293b;line-height:1.6;white-space:pre-wrap;">${escHtml(value)}</div>
    </div>`;
}

function statusPill(pct: number): string {
  const color = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : pct > 0 ? '#3b82f6' : '#94a3b8';
  return `<span style="display:inline-block;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:20px;padding:3px 12px;font-size:13px;font-weight:700;">${pct}% Complete</span>`;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return { success: false, error: result.error.message };
    }

    console.log("Email sent successfully:", result.data?.id);
    return { success: true };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function sendMilestoneReminderEmail(
  teamLeadEmail: string,
  teamLeadName: string,
  projectName: string,
  milestoneMonth: string,
  milestoneDescription: string,
  submissionUrl: string
): Promise<{ success: boolean; error?: string }> {
  const monthLabel = new Date(milestoneMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const descHtml = renderMilestoneDescription(milestoneDescription);

  const content = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;">Monthly Milestone Check-In</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Hi ${escHtml(teamLeadName)}, it's time to submit your progress update.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#16a34a;margin-bottom:2px;">${escHtml(monthLabel)}</div>
      <div style="font-size:17px;font-weight:700;color:#0f172a;margin-bottom:12px;">${escHtml(projectName)}</div>
      <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Milestone Goal</div>
      ${descHtml}
    </div>

    <a href="${submissionUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;margin-bottom:24px;">
      Submit Progress Update →
    </a>

    <p style="margin:0;color:#94a3b8;font-size:13px;">If the button doesn't work, copy this link: <a href="${submissionUrl}" style="color:#10b981;">${submissionUrl}</a></p>
  `;

  return sendEmail({
    to: teamLeadEmail,
    subject: `[Action Required] ${projectName} — ${monthLabel} Milestone Update`,
    html: emailWrapper(content),
    text: `Hi ${teamLeadName}, please submit your milestone progress update for ${projectName} (${monthLabel}).\n\nMilestone: ${milestoneDescription}\n\nSubmit at: ${submissionUrl}`,
  });
}

export async function sendConsolidatedMilestoneReminderEmail(
  teamLeadEmail: string,
  teamLeadName: string,
  milestoneMonth: string,
  milestoneItems: { projectName: string; description: string; submissionUrl: string }[]
): Promise<{ success: boolean; error?: string }> {
  const monthLabel = new Date(milestoneMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const milestonesHtml = milestoneItems.map((item, idx) => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;">${idx + 1}. ${escHtml(item.projectName)}</div>
      <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Milestone Goal</div>
      ${renderMilestoneDescription(item.description)}
      <div style="margin-top:16px;">
        <a href="${item.submissionUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">
          Submit Update →
        </a>
      </div>
    </div>
  `).join('');

  const content = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;">Monthly Milestone Check-In</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Hi ${escHtml(teamLeadName)}, please submit your progress updates for <strong>${escHtml(monthLabel)}</strong>.</p>
    ${milestonesHtml}
  `;

  const projectNames = milestoneItems.map(m => m.projectName).join(', ');
  return sendEmail({
    to: teamLeadEmail,
    subject: `[Action Required] ${monthLabel} Milestone Check-In`,
    html: emailWrapper(content),
    text: `Hi ${teamLeadName}, please submit your milestone progress updates for ${monthLabel}.\n\nProjects: ${projectNames}`,
  });
}

export async function sendMilestoneSubmissionNotification(
  adminEmails: string[],
  projectName: string,
  teamLeadName: string,
  milestoneMonth: string,
  progressSummary: string,
  completionPercentage?: number,
  challenges?: string,
  nextSteps?: string
): Promise<{ success: boolean; error?: string }> {
  const monthLabel = new Date(milestoneMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pct = completionPercentage ?? 0;

  const content = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;">Milestone Update Received</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">A progress update has been submitted and is ready for review.</p>

    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
      <div style="flex:1;min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Project</div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${escHtml(projectName)}</div>
      </div>
      <div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Team Lead</div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${escHtml(teamLeadName)}</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Month</div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${escHtml(monthLabel)}</div>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Completion</div>
        <div style="margin-top:4px;">${statusPill(pct)}</div>
      </div>
    </div>

    <div style="border-top:2px solid #10b981;padding-top:20px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#10b981;margin-bottom:12px;">Progress Summary</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">${escHtml(progressSummary)}</div>
    </div>

    ${challenges ? `
    <div style="border-top:1px solid #fde68a;padding-top:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#d97706;margin-bottom:8px;">Challenges</div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:14px 16px;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">${escHtml(challenges)}</div>
    </div>` : ''}

    ${nextSteps ? `
    <div style="border-top:1px solid #bfdbfe;padding-top:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#2563eb;margin-bottom:8px;">Next Steps</div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:14px 16px;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">${escHtml(nextSteps)}</div>
    </div>` : ''}

    <div style="margin-top:24px;text-align:center;">
      <a href="https://cimcops.org/milestones" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        View in Mission Control →
      </a>
    </div>
  `;

  return sendEmail({
    to: adminEmails,
    subject: `[Milestone Update] ${projectName} — ${monthLabel} (${pct}% complete)`,
    html: emailWrapper(content),
    text: `Milestone update received.\n\nProject: ${projectName}\nTeam Lead: ${teamLeadName}\nMonth: ${monthLabel}\nCompletion: ${pct}%\n\nProgress Summary:\n${progressSummary}${challenges ? '\n\nChallenges:\n' + challenges : ''}${nextSteps ? '\n\nNext Steps:\n' + nextSteps : ''}`,
  });
}

export async function sendMicrograntNotification(
  application: { name: string; email: string; projectDescription: string; id: string },
  adminEmails: string[]
): Promise<{ success: boolean; error?: string }> {
  const content = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;">New Microgrant Application</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">A new application has been submitted and is ready for review.</p>

    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
      <div style="flex:1;min-width:200px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Applicant</div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${escHtml(application.name)}</div>
      </div>
      <div style="flex:1;min-width:200px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:4px;">Email</div>
        <div style="font-size:15px;color:#0f172a;"><a href="mailto:${escHtml(application.email)}" style="color:#10b981;">${escHtml(application.email)}</a></div>
      </div>
    </div>

    <div style="border-top:2px solid #10b981;padding-top:20px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#10b981;margin-bottom:12px;">Project Description</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">${escHtml(application.projectDescription.substring(0, 800))}${application.projectDescription.length > 800 ? '…' : ''}</div>
    </div>

    <div style="margin-top:24px;text-align:center;">
      <a href="https://cimcops.org/grants" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        Review Application →
      </a>
    </div>
  `;

  return sendEmail({
    to: adminEmails,
    subject: `[New Grant Application] ${application.name}`,
    html: emailWrapper(content),
    text: `New microgrant application from ${application.name} (${application.email}).\n\nProject: ${application.projectDescription.substring(0, 300)}...`,
  });
}

export interface NeurocomputeAnalytics {
  totalNodes: number;
  activeNodes24h: number;
  onlineNow: number;
  totalTokens: number;
  totalPixelsPlaced: number;
  computeSeconds: number;
  newContributors: number;
  periodLabel: string;
}

export interface WeeklyAnalyticsData {
  periodLabel: string;
  totalCommits: number;
  totalPRs: number;
  activeRepos: number;
  repoActivity: Array<{ repo: string; commits: number; prs: number; prAuthors?: string[] }>;
  totalResearchUpdates: number;
  projectsWithUpdates: number;
  projectUpdates: Array<{ name: string; updateCount: number }>;
  totalPapers: number;
  papersByStage: { before: number; mid: number; after: number };
  contributors: string[];
  neurocompute?: NeurocomputeAnalytics;
}

export async function sendWeeklyAnalyticsEmail(
  data: WeeklyAnalyticsData,
  recipients?: string[]
): Promise<{ success: boolean; error?: string }> {
  const to = recipients && recipients.length > 0
    ? recipients
    : ["emily@cimc.ai", "erik@cimc.ai", "joel@cimc.ai"];
  const repoRows = data.repoActivity.slice(0, 10).map((r, i) => {
    const bar = Math.round((r.commits / Math.max(data.totalCommits, 1)) * 100);
    const barColor = i === 0 ? "#10b981" : i < 3 ? "#3b82f6" : "#94a3b8";
    return `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#0f172a;font-family:monospace;">${escHtml(r.repo)}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${r.commits}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${r.prs}</td>
      <td style="padding:10px 12px;min-width:80px;">
        <div style="background:#f1f5f9;border-radius:4px;height:8px;width:100%;overflow:hidden;">
          <div style="background:${barColor};height:8px;width:${Math.max(bar, 4)}%;border-radius:4px;"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const projectRows = data.projectUpdates.slice(0, 8).map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:13px;color:#374151;flex:1;padding-right:12px;">${escHtml(p.name)}</span>
      <span style="font-size:12px;font-weight:700;background:#eff6ff;color:#2563eb;border-radius:12px;padding:2px 10px;">${p.updateCount} update${p.updateCount !== 1 ? "s" : ""}</span>
    </div>`).join('');

  const totalPapers = data.totalPapers;
  const beforePct = totalPapers ? Math.round((data.papersByStage.before / totalPapers) * 100) : 0;
  const midPct = totalPapers ? Math.round((data.papersByStage.mid / totalPapers) * 100) : 0;
  const afterPct = totalPapers ? Math.round((data.papersByStage.after / totalPapers) * 100) : 0;

  const content = `
    <h2 style="margin:0 0 4px;color:#0f172a;font-size:22px;font-weight:800;">Weekly Analytics Report</h2>
    <p style="margin:0 0 28px;color:#64748b;font-size:14px;">${escHtml(data.periodLabel)}</p>

    <!-- Stat pills -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">
      <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#10b981;">${data.totalCommits}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#16a34a;margin-top:2px;">Commits</div>
      </div>
      <div style="flex:1;min-width:120px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#2563eb;">${data.totalPRs}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#1d4ed8;margin-top:2px;">Pull Requests</div>
      </div>
      <div style="flex:1;min-width:120px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#7c3aed;">${data.activeRepos}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6d28d9;margin-top:2px;">Active Repos</div>
      </div>
      <div style="flex:1;min-width:120px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#ea580c;">${data.totalResearchUpdates}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#c2410c;margin-top:2px;">Research Updates</div>
      </div>
    </div>

    <!-- Code Activity -->
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#10b981;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #10b981;">
        Code Activity
      </div>
      ${data.repoActivity.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;text-align:left;">Repository</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;text-align:right;">Pushes</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;text-align:right;">PRs</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Activity</th>
          </tr>
        </thead>
        <tbody>${repoRows}</tbody>
      </table>` : `<p style="color:#94a3b8;font-size:14px;margin:0;">No code activity this week.</p>`}
    </div>

    <!-- Research Activity -->
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#7c3aed;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #7c3aed;">
        Research Activity — ${data.projectsWithUpdates} project${data.projectsWithUpdates !== 1 ? "s" : ""} updated
      </div>
      ${data.projectUpdates.length > 0 ? projectRows : `<p style="color:#94a3b8;font-size:14px;margin:0;">No research updates this week.</p>`}
      ${data.projectUpdates.length > 8 ? `<p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">...and ${data.projectUpdates.length - 8} more projects</p>` : ""}
    </div>

    <!-- Papers Pipeline -->
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#ea580c;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #ea580c;">
        Papers Pipeline — ${totalPapers} total
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#0f172a;">${data.papersByStage.before}</div>
          <div style="font-size:11px;color:#64748b;font-weight:600;margin-top:2px;">Pre-submission</div>
          <div style="font-size:11px;color:#94a3b8;">${beforePct}%</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#0f172a;">${data.papersByStage.mid}</div>
          <div style="font-size:11px;color:#64748b;font-weight:600;margin-top:2px;">Under Review</div>
          <div style="font-size:11px;color:#94a3b8;">${midPct}%</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#10b981;">${data.papersByStage.after}</div>
          <div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:2px;">Published</div>
          <div style="font-size:11px;color:#94a3b8;">${afterPct}%</div>
        </div>
      </div>
    </div>

    ${data.neurocompute ? `
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0ea5e9;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #0ea5e9;">
        Neurocompute Network <span style="font-size:11px;font-weight:400;color:#94a3b8;text-transform:none;letter-spacing:0;">neurocompute.me</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="flex:1;min-width:100px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#0284c7;">${data.neurocompute.totalNodes}</div>
          <div style="font-size:11px;color:#0369a1;font-weight:600;margin-top:2px;">Total Nodes</div>
        </div>
        <div style="flex:1;min-width:100px;background:${data.neurocompute.onlineNow > 0 ? '#f0fdf4' : '#f8fafc'};border:1px solid ${data.neurocompute.onlineNow > 0 ? '#bbf7d0' : '#e2e8f0'};border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${data.neurocompute.onlineNow > 0 ? '#10b981' : '#94a3b8'};">${data.neurocompute.onlineNow}</div>
          <div style="font-size:11px;color:${data.neurocompute.onlineNow > 0 ? '#16a34a' : '#94a3b8'};font-weight:600;margin-top:2px;">Online Now</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#0f172a;">${data.neurocompute.activeNodes24h}</div>
          <div style="font-size:11px;color:#64748b;font-weight:600;margin-top:2px;">Active (24h)</div>
        </div>
        <div style="flex:1;min-width:100px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#7c3aed;">${data.neurocompute.newContributors}</div>
          <div style="font-size:11px;color:#6d28d9;font-weight:600;margin-top:2px;">Contributors</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:4px;">Total Tokens</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${data.neurocompute.totalTokens.toLocaleString()}</div>
        </div>
        <div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:4px;">Compute Time</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${Math.round(data.neurocompute.computeSeconds / 3600).toLocaleString()}h</div>
        </div>
        <div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:4px;">Pixels Placed</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${data.neurocompute.totalPixelsPlaced.toLocaleString()}</div>
        </div>
      </div>
    </div>` : ""}

    ${data.contributors.length > 0 ? `
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:10px;">Top Contributors</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${data.contributors.map((c, i) => `<span style="background:${i === 0 ? "#f0fdf4" : "#f8fafc"};border:1px solid ${i === 0 ? "#bbf7d0" : "#e2e8f0"};border-radius:20px;padding:4px 14px;font-size:13px;color:${i === 0 ? "#16a34a" : "#374151"};font-weight:${i === 0 ? "700" : "400"};">${escHtml(c)}</span>`).join("")}
      </div>
    </div>` : ""}

    <div style="text-align:center;margin-top:8px;">
      <a href="https://cimcops.org/dashboard" style="display:inline-block;background:#0f172a;color:#ffffff;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        Open Mission Control →
      </a>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Weekly Research Ops — ${data.periodLabel}`,
    html: emailWrapper(content),
    text: `Weekly Analytics Report\n${data.periodLabel}\n\nCommits: ${data.totalCommits} | PRs: ${data.totalPRs} | Active Repos: ${data.activeRepos} | Research Updates: ${data.totalResearchUpdates}\n\nView full report at https://cimcops.org/dashboard`,
  });
}

export const emailService = {
  sendEmail,
  sendMilestoneReminderEmail,
  sendConsolidatedMilestoneReminderEmail,
  sendMilestoneSubmissionNotification,
  sendMicrograntNotification,
  sendWeeklyAnalyticsEmail,
};
