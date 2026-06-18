---
name: Weekly analytics email — App Usage section
description: How registered-app usage stats feed the weekly analytics email, and why Neurocompute is excluded from the generic App Usage block.
---

# Weekly analytics email — App Usage

Registered external apps push freeform key/value usage stats (stored in the
`external_app_stats` jsonb table) via the registration/stats-push API. The weekly
analytics email renders these in an "App Usage" section, built scheduler-side in the
weekly-summary path and passed as `WeeklyAnalyticsData.appUsage`.

## Decisions
- **Neurocompute is excluded from the generic App Usage block.** It already has its
  own dedicated "Neurocompute Network" section fed live from `neurocompute.me/api/admin/analytics`.
  Rendering it again from pushed stats would duplicate it. Filter out app names matching `/neurocompute/i`.
- **Row selection:** stats rows come most-recent-first; pick the latest *weekly* row
  within a recency window (≈9 days), else fall back to the latest *daily* row in the
  window. Skip apps with no in-window rows.
- **Metric rendering is generic:** keep only numeric values, drop `period_label` and
  nulls, sort non-zero/descending, cap at 8, prettify snake_case keys (`ai`→`AI`).

**Why generic:** apps push arbitrary stat shapes (CIMC Spirits sends messages/users/rooms;
others differ). Hardcoding keys would silently drop new metrics. If an app later pushes
`hits`/`visits`, it shows up automatically — no code change needed.

## Current-state note (may change)
Only **CIMC Spirits** and **NeuroCompute / Worldforge** push stats. `cooperationengine`
is NOT a registered app and sends no telemetry (no logins/test-runs) — it would need to
register and push stats to appear.
