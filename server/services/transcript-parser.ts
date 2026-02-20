// AI-powered transcript parser that segments meeting notes by project
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ParsedUpdate {
  project: string;
  date: string;
  description: string;
  grantee?: string;
}

export async function parseTranscript(
  text: string,
  fileName: string,
  existingProjects: string[]
): Promise<ParsedUpdate[]> {
  const prompt = `You are analyzing a research meeting transcript or notes document. Extract individual project updates from this text.

EXISTING PROJECTS (try to match updates to these when possible, using fuzzy matching for slight name variations):
${existingProjects.length > 0 ? existingProjects.map(p => `- ${p}`).join('\n') : '(none yet)'}

DOCUMENT: "${fileName}"

TEXT:
${text.slice(0, 15000)}

Instructions:
1. Identify each distinct project or research topic discussed
2. For each project update, extract:
   - "project": The project name (match existing projects when clearly the same topic, otherwise create a descriptive name)
   - "date": The date of the meeting/update in YYYY-MM-DD format. Look for dates in the filename or text. If no date is found, use today's date.
   - "description": A concise summary of what was discussed or reported for this project (2-4 sentences)
   - "grantee": The person who gave the update or is primarily responsible (full name if available, otherwise omit)
3. If the document covers multiple projects in one meeting, create separate entries for each project
4. If you can extract a date from the filename "${fileName}", use that date for all entries from this document
5. Consolidate very short mentions into a single entry per project

Return ONLY a JSON array of objects. No markdown, no explanation. Example:
[{"project":"Neural Architecture Search","date":"2025-01-15","description":"Discussed progress on NAS optimization. Results show 15% improvement over baseline.","grantee":"Aleksandr Groznykh"}]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    if (!Array.isArray(parsed)) return [];
    
    return parsed.filter((u: any) => u.project && u.date && u.description).map((u: any) => ({
      project: u.project,
      date: u.date,
      description: u.description,
      grantee: u.grantee || undefined,
    }));
  } catch (error) {
    console.error("Error parsing transcript with AI:", error);
    return [];
  }
}
