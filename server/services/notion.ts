// Notion integration via Replit connector
import { Client } from '@notionhq/client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=notion',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Notion not connected');
  }
  return accessToken;
}

async function getUncachableNotionClient() {
  const accessToken = await getAccessToken();
  return new Client({ auth: accessToken });
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
}

export interface NotionResearcher {
  id: string;
  name: string;
  properties: Record<string, any>;
  url: string;
}

function extractPlainText(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return "";
  return richText.map((t: any) => t.plain_text || "").join("");
}

function extractPropertyValue(prop: any): any {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return extractPlainText(prop.title);
    case "rich_text":
      return extractPlainText(prop.rich_text);
    case "number":
      return prop.number;
    case "select":
      return prop.select?.name || null;
    case "multi_select":
      return (prop.multi_select || []).map((s: any) => s.name);
    case "date":
      return prop.date?.start || null;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url;
    case "email":
      return prop.email;
    case "phone_number":
      return prop.phone_number;
    case "people":
      return (prop.people || []).map((p: any) => p.name || p.id);
    case "files":
      return (prop.files || []).map((f: any) => f.file?.url || f.external?.url || f.name);
    case "relation":
      return (prop.relation || []).map((r: any) => r.id);
    case "formula":
      return prop.formula?.string || prop.formula?.number || prop.formula?.boolean || prop.formula?.date?.start || null;
    case "rollup":
      return prop.rollup?.number || prop.rollup?.array?.map((a: any) => extractPropertyValue(a)) || null;
    case "status":
      return prop.status?.name || null;
    default:
      return null;
  }
}

export const notionService = {
  async listDatabases(): Promise<NotionDatabase[]> {
    const notion = await getUncachableNotionClient();
    const response = await notion.search({
      filter: { property: "object", value: "database" },
      page_size: 50,
    });

    return response.results.map((db: any) => ({
      id: db.id,
      title: extractPlainText(db.title) || "Untitled",
      url: db.url,
    }));
  },

  async queryDatabase(databaseId: string, pageSize: number = 100): Promise<NotionResearcher[]> {
    const notion = await getUncachableNotionClient();
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: pageSize,
    });

    return response.results.map((page: any) => {
      const properties: Record<string, any> = {};
      let name = "";

      for (const [key, value] of Object.entries(page.properties)) {
        const extracted = extractPropertyValue(value);
        properties[key] = extracted;
        if ((value as any).type === "title") {
          name = extracted || "Untitled";
        }
      }

      return {
        id: page.id,
        name,
        properties,
        url: page.url,
      };
    });
  },

  async getPageContent(pageId: string): Promise<{ properties: Record<string, any>; blocks: any[]; url: string }> {
    const notion = await getUncachableNotionClient();
    
    const page = await notion.pages.retrieve({ page_id: pageId }) as any;
    const properties: Record<string, any> = {};
    let name = "";
    for (const [key, value] of Object.entries(page.properties)) {
      const extracted = extractPropertyValue(value);
      properties[key] = extracted;
      if ((value as any).type === "title") {
        name = extracted || "Untitled";
      }
    }
    properties._name = name;

    const blocksResponse = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    const blocks = blocksResponse.results.map((block: any) => {
      const type = block.type;
      const content = block[type];
      let text = "";
      if (content?.rich_text) {
        text = extractPlainText(content.rich_text);
      }
      return { type, text, id: block.id };
    });

    return { properties, blocks, url: page.url };
  },
};
