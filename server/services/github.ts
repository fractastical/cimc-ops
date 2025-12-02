import { storage } from "../storage";
import type { InsertRepository, InsertActivityLog } from "@shared/schema";

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
        
        // Group commits by date and author
        const dailyCommits = new Map<string, { count: number; authors: Set<string> }>();
        
        for (const commit of commits) {
          const date = commit.commit.author.date.split("T")[0];
          const author = commit.author?.login || commit.commit.author.name || "Unknown";
          
          if (!dailyCommits.has(date)) {
            dailyCommits.set(date, { count: 0, authors: new Set() });
          }
          const day = dailyCommits.get(date)!;
          day.count++;
          day.authors.add(author);
        }

        // Create activity log entries for each day
        for (const [date, data] of dailyCommits) {
          const authors = Array.from(data.authors);
          const activityLog: InsertActivityLog = {
            repositoryId: repoId,
            eventType: "push",
            author: authors[0] || "Unknown",
            message: `${data.count} commit${data.count !== 1 ? 's' : ''} by ${authors.length} contributor${authors.length !== 1 ? 's' : ''}`,
            url: `https://github.com/${fullName}/commits`,
            metadata: { commits: data.count, authors, date },
          };
          
          await storage.createActivityLog(activityLog);
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
}

export const githubService = new GitHubService();
