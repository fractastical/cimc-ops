import { storage } from "../storage";
import type { InsertCollaborator } from "@shared/schema";

interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string;
  works_count: number;
  cited_by_count: number;
  summary_stats?: {
    h_index: number;
    i10_index: number;
  };
  last_known_institutions?: Array<{
    display_name: string;
  }>;
}

interface OpenAlexSearchResult {
  meta: {
    count: number;
  };
  results: OpenAlexAuthor[];
}

export class OpenAlexService {
  private baseUrl = "https://api.openalex.org";
  private email = "research-ops@example.com";

  async searchAuthorByName(name: string): Promise<OpenAlexAuthor[]> {
    try {
      const encodedName = encodeURIComponent(name);
      const url = `${this.baseUrl}/authors?search=${encodedName}&per-page=5&mailto=${this.email}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`OpenAlex search failed: ${response.statusText}`);
        return [];
      }

      const data: OpenAlexSearchResult = await response.json();
      return data.results || [];
    } catch (error) {
      console.error("Error searching OpenAlex:", error);
      return [];
    }
  }

  async getAuthorById(openalexId: string): Promise<OpenAlexAuthor | null> {
    try {
      const url = `${this.baseUrl}/authors/${openalexId}?mailto=${this.email}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`OpenAlex fetch failed: ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching OpenAlex author:", error);
      return null;
    }
  }

  async lookupAndCreateCollaborator(name: string): Promise<{ 
    collaborator: InsertCollaborator; 
    candidates: Array<{ name: string; hIndex: number; institution: string | null; openalexId: string }> 
  } | null> {
    const authors = await this.searchAuthorByName(name);
    
    if (authors.length === 0) {
      return {
        collaborator: {
          name,
          hIndex: null,
          citationCount: null,
          worksCount: null,
          institution: null,
          openalexId: null,
          orcid: null,
          lastSyncedAt: null,
        },
        candidates: [],
      };
    }

    const candidates = authors.map(a => ({
      name: a.display_name,
      hIndex: a.summary_stats?.h_index || 0,
      institution: a.last_known_institutions?.[0]?.display_name || null,
      openalexId: a.id,
    }));

    const topMatch = authors[0];
    return {
      collaborator: {
        name: topMatch.display_name,
        hIndex: topMatch.summary_stats?.h_index || null,
        citationCount: topMatch.cited_by_count || null,
        worksCount: topMatch.works_count || null,
        institution: topMatch.last_known_institutions?.[0]?.display_name || null,
        openalexId: topMatch.id,
        orcid: topMatch.orcid?.replace("https://orcid.org/", "") || null,
        lastSyncedAt: new Date(),
      },
      candidates,
    };
  }

  async refreshCollaboratorMetrics(openalexId: string): Promise<Partial<InsertCollaborator> | null> {
    const author = await this.getAuthorById(openalexId);
    if (!author) return null;

    return {
      name: author.display_name,
      hIndex: author.summary_stats?.h_index || null,
      citationCount: author.cited_by_count || null,
      worksCount: author.works_count || null,
      institution: author.last_known_institutions?.[0]?.display_name || null,
      orcid: author.orcid?.replace("https://orcid.org/", "") || null,
      lastSyncedAt: new Date(),
    };
  }
}

export const openAlexService = new OpenAlexService();
