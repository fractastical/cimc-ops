---
name: Repo activity counting & ranking consistency
description: How GitHub repo engagement (commits/PRs/issues/comments) must be counted and ranked identically across every Slack + email surface.
---

# Repo activity counting & ranking

Engagement metrics for tracked GitHub repos appear on MANY surfaces: scheduler-driven
Slack daily/weekly/combined/repo summaries, the weekly analytics email, AND the
interactive `/research summary` Slack command (`getResearchSummaryResponse`). Every
surface must apply the SAME counting policy or numbers diverge between, e.g., the
scheduled post and the on-demand command.

## Counting policy (period-based, like commits)
- **PRs and issues**: dedupe by distinct `(repositoryId#metadata.number)` — a single
  PR/issue emits one activity_log row per lifecycle action (opened/closed/merged/etc),
  so raw row counts over-report. Fallback key when number missing: `url || id || JSON.stringify`.
- **Comments** (`issue_comment`): raw row count (each comment is distinct).
- **Commits** (`push`): raw row count.
- **Bot exclusion**: exclude bot authors from PR/issue/comment engagement (NOT from
  commit counts — scheduler counts push rows without bot filtering). Use shared
  `isBot()`.

## Ranking
Sort repos: **stars desc → issues desc → comments desc → commits desc**. Commits and
PRs are shown as informational, never primary sort keys.
Comparator: `(b.stars-a.stars)||(b.issues-a.issues)||(b.comments-a.comments)||(b.commits-a.commits)`.

## Shared util location
`isBot` + `BOT_PATTERNS` live in `server/utils.ts` (imported by both `scheduler.ts`
and `slack.ts`). **Why:** they were once duplicated locally in scheduler.ts only, so
`/research summary` silently lacked bot-exclusion. Keep ONE definition.

**How to apply:** when adding any new surface that counts repo engagement, reuse the
distinct-dedupe + raw-comments/commits + isBot policy and the stars→issues→comments→commits
sort. Don't reinvent per-surface aggregation.
