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
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
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
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Monthly Milestone Check-In</h2>
      <p>Hi ${teamLeadName},</p>
      <p>It's the start of a new month! Please submit your milestone progress update for <strong>${projectName}</strong>.</p>
      
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">Milestone for ${milestoneMonth}</h3>
        <p style="margin-bottom: 0;">${milestoneDescription}</p>
      </div>
      
      <p>
        <a href="${submissionUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Submit Progress Update
        </a>
      </p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        This is an automated reminder from Research Ops Mission Control.
      </p>
    </div>
  `;

  return sendEmail({
    to: teamLeadEmail,
    subject: `[Action Required] ${projectName} - ${milestoneMonth} Milestone Update`,
    html,
    text: `Hi ${teamLeadName}, please submit your milestone progress update for ${projectName}. Milestone: ${milestoneDescription}. Submit at: ${submissionUrl}`,
  });
}

export async function sendMilestoneSubmissionNotification(
  adminEmails: string[],
  projectName: string,
  teamLeadName: string,
  milestoneMonth: string,
  progressSummary: string
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Milestone Update Received</h2>
      <p>A milestone progress update has been submitted:</p>
      
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Project:</strong> ${projectName}</p>
        <p><strong>Team Lead:</strong> ${teamLeadName}</p>
        <p><strong>Month:</strong> ${milestoneMonth}</p>
        <p><strong>Progress Summary:</strong></p>
        <p style="white-space: pre-wrap;">${progressSummary}</p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        This is an automated notification from Research Ops Mission Control.
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmails,
    subject: `[Milestone Update] ${projectName} - ${milestoneMonth} Progress Submitted`,
    html,
    text: `Milestone update received for ${projectName} from ${teamLeadName}. Month: ${milestoneMonth}. Summary: ${progressSummary}`,
  });
}

export const emailService = {
  sendEmail,
  sendMilestoneReminderEmail,
  sendMilestoneSubmissionNotification,
};
