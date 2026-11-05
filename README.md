# Things

Personal tracker forked from [cimcai/research-data-viz](https://github.com/cimcai/research-data-viz)
(the app that used to live at `cimc-ops` / cimcops.org).

Sign in with `SITE_PASSWORD`, then use **Things** to keep a board of what you
are doing, what is open, what is done, and what you dropped. Each thing has a
title, optional notes, an area, and a link. The rest of the upstream console
(repos, research projects, papers, milestones, Slack) is still here.

This fork does not email CIMC staff or sync `cimcai/hypotheses` and
`cimcai/paper-pipeline` on its own. Set recipients in Settings, and set
`HYPOTHESES_REPO` or `PAPERS_REPO` to `owner/repo` if you want those syncs.
Google sign-in, if you wire it up, follows `ALLOWED_EMAILS` or
`ALLOWED_EMAIL_DOMAIN`. With neither set, any Google account can sign in.

```bash
npm install
# DATABASE_URL, SESSION_SECRET, SITE_PASSWORD — see .env.example
npm run db:push
npm run dev
```

## Upstream

# Research Operations Mission Control

A real-time monitoring and automation platform for research teams. It brings
repository activity, research projects, papers, milestones, and team
communications together into a single "mission control" dashboard, with
automated summaries, alerts, and an interactive activity visualization.

> This README describes how the system works. It intentionally contains no
> private data — no repository names, people, project contents, credentials, or
> internal endpoints. All of that lives in the database and environment
> configuration at runtime, not in source control.

## Features

- **Unified dashboard** — a single view of repository activity, research
  projects, papers, and milestones.
- **GitHub monitoring** — tracks commits, issues, and pull requests across an
  organization's repositories, with periodic background sync and a health
  indicator that flags stale data.
- **Research project tracking** — projects with status (active / on-hold /
  completed / archived), timeline updates, and bibliometric fields.
- **Milestones & submissions** — admins set monthly goals; team leads submit
  progress; admins are notified automatically.
- **Automated summaries & reminders** — scheduled daily/weekly summaries and
  monthly milestone reminder emails.
- **Activity visualization** — an animated "galaxy" view of research activity,
  including on-hover website previews for repositories that link to a site.
- **Slack integration** — posts alerts and scheduled summaries to configured
  channels.
- **Transactional email** — milestone reminders and notifications.

## Tech Stack

**Frontend**
- React 18 + TypeScript, built with Vite
- Tailwind CSS with shadcn/ui (Radix UI primitives)
- TanStack Query for server state, Wouter for routing
- Recharts for charts, Framer Motion for animation

**Backend**
- Express.js + TypeScript REST API
- PostgreSQL with Drizzle ORM (type-safe schema and migrations)
- Session storage backed by PostgreSQL
- Service modules for GitHub, Slack, scheduling, email, and object storage

**Tooling**
- esbuild for server bundling, Drizzle Kit for schema management

## Architecture

```
client/   React single-page app (dashboard + visualizations)
server/   Express API, service modules, scheduler
shared/   Drizzle schema and shared types used by both sides
```

- The **storage layer** abstracts all database access behind a single
  interface, keeping route handlers thin.
- **Service modules** isolate third-party integrations (GitHub, Slack, email,
  object storage) from the core application.
- A **scheduler** triggers daily/weekly summaries and monthly reminders on a
  fixed cadence, with in-memory guards to prevent duplicate sends.
- During development the server runs Vite for hot reloading; in production it
  serves a pre-built static bundle.

## Getting Started

### Prerequisites
- Node.js (LTS)
- A PostgreSQL database

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see "Configuration" below)
#    Set DATABASE_URL and any integration credentials you need.

# 3. Apply the database schema
npm run db:push

# 4. Start the development server
npm run dev
```

The app serves both the API and the client on a single port (default `5000`).

### Production

```bash
npm run build   # bundle client and server
npm start       # run the production build
```

## Configuration

Configuration is provided entirely through environment variables and the
in-app settings — never committed to the repository. The core requirement is a
PostgreSQL connection string; integrations (GitHub, Slack, email, object
storage, etc.) are optional and enabled by supplying their respective
credentials. Refer to your environment/secrets manager for the full list rather
than hard-coding any values.

## License

Released under the [MIT License](./LICENSE).
