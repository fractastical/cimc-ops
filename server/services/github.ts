import { storage } from "../storage";
import type { InsertRepository, InsertActivityLog, InsertHypothesis } from "@shared/schema";

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
  type: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  archived: boolean;
  private: boolean;
  owner: {
    login: string;
  };
}

export class GitHubService {
  private token: string | null = null;

  async initialize() {
    const settings = await storage.getIntegrationSettings();
    if (settings?.githubToken) {
      this.token = settings.githubToken;
    }
  }

  async fetchRepository(owner: string, repo: string): Promise<GitHubRepo | null> {
    await this.initialize();
    
    if (!this.token) {
      console.warn("GitHub token not configured");
      return null;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch GitHub repo: ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching GitHub repository:", error);
      return null;
    }
  }

  async fetchOrganizationRepos(org: string): Promise<GitHubRepo[]> {
    await this.initialize();
    
    if (!this.token) {
      console.warn("GitHub token not configured");
      return [];
    }

    const allRepos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        const response = await fetch(
          `https://api.github.com/orgs/${org}/repos?per_page=${perPage}&page=${page}&sort=updated`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch org repos: ${response.statusText}`);
          break;
        }

        const repos: GitHubRepo[] = await response.json();
        
        if (repos.length === 0) break;
        
        // Filter out archived repos
        const activeRepos = repos.filter(r => !r.archived);
        allRepos.push(...activeRepos);
        
        if (repos.length < perPage) break;
        page++;
      }

      console.log(`Fetched ${allRepos.length} active repos from org ${org}`);
      return allRepos;
    } catch (error) {
      console.error("Error fetching organization repositories:", error);
      return [];
    }
  }

  async syncOrganization(org: string): Promise<{ added: number; updated: number }> {
    const repos = await this.fetchOrganizationRepos(org);
    let added = 0;
    let updated = 0;

    for (const repoData of repos) {
      const existing = await storage.getRepositoryByFullName(repoData.full_name);

      const repoUpdate: InsertRepository = {
        owner: repoData.owner.login,
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description || "",
        language: repoData.language || "Unknown",
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        isActive: true,
      };

      if (existing) {
        await storage.updateRepository(existing.id, repoUpdate);
        updated++;
      } else {
        await storage.createRepository(repoUpdate);
        added++;
      }
    }

    // Fetch historical activity for all repos
    const allRepos = await storage.getActiveRepositories();
    for (const repo of allRepos) {
      await this.fetchRepoActivity(repo.id, repo.fullName);
    }

    return { added, updated };
  }

  async fetchRepoActivity(repoId: string, fullName: string): Promise<number> {
    await this.initialize();
    
    if (!this.token) {
      console.warn("GitHub token not configured");
      return 0;
    }

    let eventsAdded = 0;

    try {
      // Fetch recent commits (last 30 days worth)
      const [owner, repo] = fullName.split("/");
      const since = new Date();
      since.setDate(since.getDate() - 30);
      
      const commitsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?since=${since.toISOString()}&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (commitsResponse.ok) {
        const commits = await commitsResponse.json();
        
        // Group commits by date and track longest message
        const dailyCommits = new Map<string, { 
          count: number; 
          authors: Set<string>; 
          longestMessage: string;
        }>();
        
        for (const commit of commits) {
          const date = commit.commit.author.date.split("T")[0];
          const author = commit.author?.login || commit.commit.author.name || "Unknown";
          const commitMessage = commit.commit.message || "";
          
          if (!dailyCommits.has(date)) {
            dailyCommits.set(date, { count: 0, authors: new Set(), longestMessage: "" });
          }
          const day = dailyCommits.get(date)!;
          day.count++;
          day.authors.add(author);
          // Track the longest commit message for the day
          if (commitMessage.length > day.longestMessage.length) {
            day.longestMessage = commitMessage;
          }
        }

        // Create activity log entries for each day
        for (const [date, data] of dailyCommits) {
          const authors = Array.from(data.authors);
          // Use the longest commit message if available, otherwise use summary
          const message = data.longestMessage || 
            `${data.count} commit${data.count !== 1 ? 's' : ''} by ${authors.length} contributor${authors.length !== 1 ? 's' : ''}`;
          
          const activityLog = {
            repositoryId: repoId,
            eventType: "push",
            author: authors[0] || "Unknown",
            message,
            url: `https://github.com/${fullName}/commits`,
            metadata: { commits: data.count, authors, date, longestMessage: data.longestMessage },
            activityDate: new Date(date), // Use the actual commit date
          };
          
          await storage.createActivityLog(activityLog as InsertActivityLog);
          eventsAdded++;
        }
      }

      // Fetch recent events (PRs, issues, etc)
      const eventsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/events?per_page=50`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (eventsResponse.ok) {
        const events = await eventsResponse.json();
        
        for (const event of events) {
          if (event.type === "PullRequestEvent") {
            const pr = event.payload.pull_request;
            const action = event.payload.action;
            
            const activityLog: InsertActivityLog = {
              repositoryId: repoId,
              eventType: action === "closed" && pr?.merged ? "pull_request_merged" : "pull_request",
              author: event.actor?.login || "Unknown",
              message: `${action} PR: ${pr?.title || "Pull Request"}`,
              url: pr?.html_url,
              metadata: { action, number: pr?.number },
            };
            
            await storage.createActivityLog(activityLog);
            eventsAdded++;
          } else if (event.type === "IssuesEvent") {
            const issue = event.payload.issue;
            
            const activityLog: InsertActivityLog = {
              repositoryId: repoId,
              eventType: "issues",
              author: event.actor?.login || "Unknown",
              message: `${event.payload.action} issue: ${issue?.title || "Issue"}`,
              url: issue?.html_url,
              metadata: { action: event.payload.action, number: issue?.number },
            };
            
            await storage.createActivityLog(activityLog);
            eventsAdded++;
          }
        }
      }

      console.log(`Fetched ${eventsAdded} activity events for ${fullName}`);
    } catch (error) {
      console.error(`Error fetching activity for ${fullName}:`, error);
    }

    return eventsAdded;
  }

  async syncRepository(fullName: string): Promise<void> {
    const [owner, name] = fullName.split("/");
    const repoData = await this.fetchRepository(owner, name);

    if (!repoData) {
      throw new Error(`Could not fetch repository: ${fullName}`);
    }

    const existing = await storage.getRepositoryByFullName(fullName);

    const repoUpdate: InsertRepository = {
      owner: repoData.owner.login,
      name: repoData.name,
      fullName: repoData.full_name,
      description: repoData.description || "",
      language: repoData.language || "Unknown",
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      isActive: true,
    };

    if (existing) {
      await storage.updateRepository(existing.id, repoUpdate);
    } else {
      await storage.createRepository(repoUpdate);
    }
  }

  async processWebhookEvent(event: string, payload: any): Promise<InsertActivityLog | null> {
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) return null;

    const repo = await storage.getRepositoryByFullName(repoFullName);
    if (!repo || !repo.isActive) return null;

    let activityLog: InsertActivityLog | null = null;

    switch (event) {
      case "push":
        const commits = payload.commits || [];
        const author = payload.sender?.login || "Unknown";
        const commitCount = commits.length;
        
        activityLog = {
          repositoryId: repo.id,
          eventType: "push",
          author,
          message: `Pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''}`,
          url: payload.compare,
          metadata: { commits: commitCount, ref: payload.ref },
        };
        break;

      case "pull_request":
        const pr = payload.pull_request;
        const action = payload.action;
        
        activityLog = {
          repositoryId: repo.id,
          eventType: action === "closed" && pr.merged ? "pull_request_merged" : "pull_request",
          author: pr.user.login,
          message: `${action.charAt(0).toUpperCase() + action.slice(1)} PR #${pr.number}: ${pr.title}`,
          url: pr.html_url,
          metadata: { number: pr.number, action, merged: pr.merged },
        };
        break;

      case "issues":
        const issue = payload.issue;
        
        activityLog = {
          repositoryId: repo.id,
          eventType: "issues",
          author: issue.user.login,
          message: `${payload.action.charAt(0).toUpperCase() + payload.action.slice(1)} issue #${issue.number}: ${issue.title}`,
          url: issue.html_url,
          metadata: { number: issue.number, action: payload.action },
        };
        break;

      case "release":
        const release = payload.release;
        
        activityLog = {
          repositoryId: repo.id,
          eventType: "release",
          author: release.author.login,
          message: `Released ${release.tag_name}: ${release.name || release.tag_name}`,
          url: release.html_url,
          metadata: { tag: release.tag_name },
        };
        break;
    }

    if (activityLog) {
      return await storage.createActivityLog(activityLog as InsertActivityLog);
    }

    return null;
  }

  // Sync hypotheses from a repository containing markdown files
  async syncHypotheses(owner: string, repo: string, path: string = ""): Promise<{ synced: number; updated: number; errors: string[] }> {
    await this.initialize();
    
    const result = { synced: 0, updated: 0, errors: [] as string[] };
    
    if (!this.token) {
      result.errors.push("GitHub token not configured");
      return result;
    }

    try {
      // Fetch directory contents
      const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const response = await fetch(contentsUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        result.errors.push(`Failed to fetch repository contents: ${response.statusText}`);
        return result;
      }

      const contents = await response.json();
      
      // Filter for markdown files, excluding README
      const mdFiles = Array.isArray(contents) 
        ? contents.filter((item: any) => 
            item.type === "file" && 
            item.name.endsWith(".md") && 
            item.name.toLowerCase() !== "readme.md"
          )
        : [];

      console.log(`Found ${mdFiles.length} markdown files in ${owner}/${repo}/${path}`);

      for (const file of mdFiles) {
        try {
          // Fetch file content
          const fileResponse = await fetch(file.url, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/vnd.github.v3+json",
            },
          });

          if (!fileResponse.ok) {
            result.errors.push(`Failed to fetch ${file.name}: ${fileResponse.statusText}`);
            continue;
          }

          const fileData: GitHubFileContent = await fileResponse.json();
          
          // Decode base64 content
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          
          // Check if file contains multiple hypotheses
          // Pattern 1: Numbered like "## **C5 – ..." or "## C5 – ..." or "## 1. The ..."
          // Pattern 2: Named like "## Name: The "Something" Hypothesis"
          // Pattern 3: Numbered section like "### 1." or "### 2."
          const numberedPattern = /^##\s+\*?\*?([A-Z]\d+)\s*[–\-:]/gm;
          const namedPattern = /^###?\s+(?:\*\*)?(?:\d+\.\s+)?(?:The\s+)?["""]?([^"""\n:]+)["""]?\s*Hypothesis/gm;
          
          const numberedMatches = [...content.matchAll(numberedPattern)];
          const namedMatches = [...content.matchAll(namedPattern)];
          const totalSubHypotheses = numberedMatches.length + namedMatches.length;
          
          if (totalSubHypotheses > 1) {
            // File contains multiple hypotheses - split them
            console.log(`Found ${totalSubHypotheses} sub-hypotheses in ${file.name} (${numberedMatches.length} numbered, ${namedMatches.length} named)`);
            
            // Split content by ## or ### headings that look like hypotheses
            const splitPattern = /(?=^###?\s+(?:\*\*)?(?:[A-Z]\d+\s*[–\-:]|\d+\.\s+|[^#\n]+(?:Hypothesis|hypothesis)))/gm;
            const sections = content.split(splitPattern);
            
            for (const section of sections) {
              if (!section.trim()) continue;
              
              // Try numbered pattern: ## **C5 – Title** or ## C5 – Title
              let numberedMatch = section.match(/^##\s+\*?\*?([A-Z]\d+)\s*[–\-:]\s*(.+?)(?:\*\*)?$/m);
              // Try named pattern with number: ### 1. The "Something" Hypothesis or ### Name: The "Something" Hypothesis
              let namedMatch = section.match(/^###?\s+(?:\*\*)?(?:\d+\.\s+)?(?:([^:*\n]+):\s+)?(?:The\s+)?["""]?([^"""\n]+?)["""]?\s*Hypothesis(?:\*\*)?/m);
              
              let hypothesisId: string;
              let displayTitle: string;
              
              if (numberedMatch) {
                hypothesisId = numberedMatch[1]; // e.g., "C5"
                const hypothesisName = numberedMatch[2].replace(/\*+/g, '').trim();
                // Only show the name, not the number prefix
                displayTitle = hypothesisName;
              } else if (namedMatch) {
                const authorName = namedMatch[1]?.trim(); // e.g., "Joscha Bach" (may be undefined)
                const conceptName = namedMatch[2].trim(); // e.g., "Coherent Simulation"
                hypothesisId = authorName ? (authorName.split(' ').pop() || authorName) : conceptName.split(' ')[0];
                displayTitle = authorName 
                  ? `${authorName}: ${conceptName} Hypothesis`
                  : `${conceptName} Hypothesis`;
              } else {
                // Not a hypothesis section, skip
                continue;
              }
              
              const subFilename = `${file.name.replace('.md', '')}_${hypothesisId.replace(/\s+/g, '_')}.md`;
              
              // Extract content for this hypothesis
              const subContent = section.trim();
              const subSummary = subContent.split('\n').slice(1).find(line => line.trim() && !line.startsWith('#') && !line.startsWith('*'))?.trim()?.substring(0, 300) || null;
              
              const existing = await storage.getHypothesisByFilename(subFilename);
              
              if (existing) {
                if (existing.sha !== fileData.sha) {
                  await storage.updateHypothesis(existing.id, {
                    title: displayTitle,
                    content: subContent,
                    summary: subSummary,
                    sha: fileData.sha,
                  });
                  result.updated++;
                  console.log(`Updated sub-hypothesis: ${displayTitle}`);
                }
              } else {
                await storage.createHypothesis({
                  filename: subFilename,
                  title: displayTitle,
                  content: subContent,
                  summary: subSummary,
                  sha: fileData.sha,
                  status: "active",
                });
                result.synced++;
                console.log(`Created sub-hypothesis: ${displayTitle}`);
              }
            }
          } else {
            // Single hypothesis file - extract the actual hypothesis name from ### heading
            // Look for patterns like "### Name: The "Something" Hypothesis/Theory" or just use the first ### title
            let title: string;
            
            // Try to find a named hypothesis/theory in the content
            // Pattern: ### Author Name: The "Concept Name" or ### Author Name: The Concept Name
            const hypothesisHeadingMatch = content.match(/^###?\s+(?:\*\*)?([^:*\n]+):\s+(?:The\s+)?["""]([^"""]+)["""]|^###?\s+(?:\*\*)?([^:*\n]+):\s+(?:The\s+)?([^*\n]+?)(?:\*\*)?$/m);
            
            if (hypothesisHeadingMatch) {
              // First pattern (with quotes) captures groups 1,2; second pattern captures groups 3,4
              const authorName = (hypothesisHeadingMatch[1] || hypothesisHeadingMatch[3])?.trim();
              const conceptName = (hypothesisHeadingMatch[2] || hypothesisHeadingMatch[4])?.trim();
              title = `${authorName}: ${conceptName}`;
            } else {
              // Fall back to first H1 title
              const titleMatch = content.match(/^#\s+(.+)/m);
              title = titleMatch ? titleMatch[1].trim() : file.name.replace('.md', '');
            }
            
            const summaryMatch = content.match(/^#\s+.+\n+([^#\n][^\n]+)/m);
            const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 300) : null;

            const existing = await storage.getHypothesisByFilename(file.name);
            
            if (existing) {
              if (existing.sha !== fileData.sha) {
                await storage.updateHypothesis(existing.id, {
                  title,
                  content,
                  summary,
                  sha: fileData.sha,
                });
                result.updated++;
                console.log(`Updated hypothesis: ${title}`);
              }
            } else {
              await storage.createHypothesis({
                filename: file.name,
                title,
                content,
                summary,
                sha: fileData.sha,
                status: "active",
              });
              result.synced++;
              console.log(`Created hypothesis: ${title}`);
            }
          }
        } catch (fileError) {
          result.errors.push(`Error processing ${file.name}: ${fileError}`);
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Error syncing hypotheses: ${error}`);
      return result;
    }
  }

  // Push a hypothesis to GitHub as a markdown file
  async pushHypothesis(
    owner: string, 
    repo: string, 
    title: string, 
    content: string,
    existingFilename?: string,
    existingSha?: string
  ): Promise<{ success: boolean; filename: string; error?: string }> {
    await this.initialize();
    
    if (!this.token) {
      return { success: false, filename: "", error: "GitHub token not configured" };
    }

    try {
      // Generate filename from title if not provided
      const filename = existingFilename || this.generateFilename(title);
      const path = filename;
      
      // Format content as markdown with title
      const markdownContent = `# ${title}\n\n${content}`;
      const encodedContent = Buffer.from(markdownContent).toString('base64');
      
      // Check if file exists to get SHA for update
      let sha = existingSha;
      if (!sha) {
        try {
          const checkResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
            {
              headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          if (checkResponse.ok) {
            const existing = await checkResponse.json();
            sha = existing.sha;
          }
        } catch {
          // File doesn't exist, that's fine
        }
      }

      // Create or update file
      const body: any = {
        message: sha ? `Update hypothesis: ${title}` : `Add hypothesis: ${title}`,
        content: encodedContent,
        branch: "main",
      };
      
      if (sha) {
        body.sha = sha;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("GitHub API error:", errorData);
        return { 
          success: false, 
          filename, 
          error: errorData.message || response.statusText 
        };
      }

      const result = await response.json();
      console.log(`Successfully pushed hypothesis to GitHub: ${filename}`);
      
      return { 
        success: true, 
        filename,
      };
    } catch (error) {
      console.error("Error pushing hypothesis to GitHub:", error);
      return { 
        success: false, 
        filename: "", 
        error: String(error) 
      };
    }
  }

  private generateFilename(title: string): string {
    // Convert title to kebab-case filename
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)
      .replace(/-$/, '');
    
    return `${slug}.md`;
  }

  // Fetch papers from the paper-pipeline repository
  async fetchPapers(owner: string = "CIMC-ai", repo: string = "paper-pipeline"): Promise<{
    papers: Array<{
      id: string;
      title: string;
      status: string;
      arxivId?: string;
      url?: string;
      authors?: string[];
      abstract?: string;
      addedDate?: string;
      lastUpdated?: string;
    }>;
    error?: string;
  }> {
    await this.initialize();
    
    if (!this.token) {
      return { papers: [], error: "GitHub token not configured" };
    }

    try {
      // Try to find JSON file(s) containing paper status
      const contentsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!contentsResponse.ok) {
        return { papers: [], error: `Failed to fetch repo contents: ${contentsResponse.statusText}` };
      }

      const contents = await contentsResponse.json();
      
      // Look for JSON files that might contain papers data
      const jsonFiles = Array.isArray(contents) 
        ? contents.filter((item: any) => 
            item.type === "file" && 
            (item.name.endsWith(".json") || item.name === "papers.json" || item.name === "status.json")
          )
        : [];

      const allPapers: any[] = [];

      for (const file of jsonFiles) {
        try {
          const fileResponse = await fetch(file.url, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/vnd.github.v3+json",
            },
          });

          if (fileResponse.ok) {
            const fileData = await fileResponse.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const parsed = JSON.parse(content);
            
            // Handle different JSON structures
            if (Array.isArray(parsed)) {
              allPapers.push(...parsed);
            } else if (parsed.papers && Array.isArray(parsed.papers)) {
              allPapers.push(...parsed.papers);
            } else if (typeof parsed === 'object') {
              // Single paper or object with papers as values
              Object.entries(parsed).forEach(([key, value]: [string, any]) => {
                if (typeof value === 'object' && value !== null) {
                  allPapers.push({ id: key, ...value });
                }
              });
            }
          }
        } catch (e) {
          console.error(`Error parsing ${file.name}:`, e);
        }
      }

      // Normalize paper objects
      const papers = allPapers.map((paper, index) => ({
        id: paper.id || paper.arxiv_id || paper.arxivId || `paper-${index}`,
        title: paper.title || paper.name || "Untitled",
        status: paper.status || paper.state || "unknown",
        arxivId: paper.arxiv_id || paper.arxivId,
        url: paper.url || paper.link || (paper.arxiv_id ? `https://arxiv.org/abs/${paper.arxiv_id}` : undefined),
        authors: paper.authors,
        abstract: paper.abstract || paper.summary,
        addedDate: paper.added_date || paper.addedDate || paper.created_at,
        lastUpdated: paper.last_updated || paper.lastUpdated || paper.updated_at,
      }));

      console.log(`Fetched ${papers.length} papers from ${owner}/${repo}`);
      return { papers };
    } catch (error) {
      console.error("Error fetching papers:", error);
      return { papers: [], error: String(error) };
    }
  }
}

export const githubService = new GitHubService();
