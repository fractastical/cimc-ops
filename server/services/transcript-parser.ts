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
  const prompt = `You are analyzing a research meeting transcript. Extract project updates and match them to existing projects.

CRITICAL: You MUST use the EXACT project name from this list when the update relates to an existing project. Do NOT create variations, abbreviations, or expanded versions of existing names.

EXISTING PROJECTS:
${existingProjects.length > 0 ? existingProjects.map((p, i) => `${i + 1}. "${p}"`).join('\n') : '(none yet)'}

MATCHING RULES:
- If an update is about an existing project, use the EXACT string from the list above (copy-paste it exactly)
- "Percepia" updates -> use the existing Percepia project name exactly
- "Self-Organizing MoE" or "NCA" updates -> use the existing Self-Organizing MoE project name exactly  
- "Emergent Agents" updates -> use the existing Emergent Agents project name exactly
- Only create a NEW project name if the topic is genuinely not covered by any existing project
- When in doubt, match to the closest existing project rather than creating a new one
- Personnel/hiring updates should go under an existing project if they relate to one

DOCUMENT: "${fileName}"

TEXT:
${text.slice(0, 15000)}

Instructions:
1. For each project update, extract:
   - "project": EXACT name from existing projects list, or a new name only if truly new
   - "date": Date in YYYY-MM-DD format (extract from filename "${fileName}" or text)
   - "description": Concise summary (2-4 sentences)
   - "grantee": Person who gave the update (full name if available)
2. Create separate entries for each distinct project discussed
3. Consolidate brief mentions into one entry per project

Return ONLY a JSON array. No markdown, no explanation.
[{"project":"Neural Architecture Search","date":"2025-01-15","description":"Discussed progress on NAS optimization.","grantee":"Jane Doe"}]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
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
