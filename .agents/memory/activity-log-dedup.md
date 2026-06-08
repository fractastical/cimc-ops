---
name: activity_log dedup invariant
description: Why GitHub activity stats inflate and the dedup contract the live sync must uphold
---

# activity_log dedup invariant

GitHub stats (PR/commit counts per repo) inflated massively (e.g. one repo showed
252 PRs / 5670 push rows, ~98% duplicates) because the live sync re-fetches the
same recent GitHub events/commits on every run (startup + every 6h + manual) and
the insert path had NO dedup, so identical rows piled up each sync.

**The contract any code inserting into `activity_log` from a repeating sync must uphold:**
- Daily commit/push aggregates: UPSERT keyed by `(repository_id, metadata->>'date')`
  — counts/messages for a day can legitimately change between syncs, so update in place.
- PR/issue events: SKIP if a row already exists with the same
  `(repository_id, event_type, url, activity_date)`. `activity_date` = the GitHub
  event `created_at`, which is effectively unique per event, so this won't collapse
  genuinely-distinct events.

**Why:** without this, every re-sync of the same window duplicates rows and all
counts balloon. The one-time cleanup that fixed historical data partitioned by the
SAME logical keys (push by metadata date, non-push by url+activity_date) — keep
cleanup keys and live-sync dedup keys in lockstep or one will leak past the other.

**Concurrency:** sync has no DB unique constraint, so it relied on check-then-insert
which races. `syncOrganization` is now wrapped in a single-flight in-process lock
(`orgSyncInProgress`) so overlapping triggers await the running sync instead of
double-inserting. A DB partial-unique index + ON CONFLICT would be the fully robust
guard if cross-process concurrency ever becomes real.

**Known gap:** the backfill path uses its own date-string scan (JS toISOString) which
is timezone-sensitive and semantically separate from live-sync dedup. Not unified yet.

**Caveat for users:** the PR count is PR *event* rows (opened/closed/merged are
separate rows sharing a URL), not distinct PRs.
