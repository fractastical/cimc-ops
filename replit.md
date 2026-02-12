# Research Operations Mission Control

## Overview

Research Operations Mission Control is a real-time monitoring and automation platform designed to track research projects, GitHub repository activity, and team communications through Slack integration. The application provides a unified dashboard for managing research operations with automated daily/weekly summaries, real-time alerts, and activity visualization.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Vite as the build tool and development server.

**UI Components**: The application uses shadcn/ui component library built on Radix UI primitives, providing accessible and customizable components. Styling is handled through Tailwind CSS with a custom dark "Mission Control" theme featuring tech-green primary colors and a glassmorphic design aesthetic.

**State Management**: TanStack Query (React Query) handles all server state management, data fetching, and caching. The query client is configured with infinite stale time and disabled auto-refetching to optimize API calls.

**Routing**: Wouter is used for client-side routing, providing a lightweight alternative to React Router.

**Design System**: The interface follows a "Mission Control" aesthetic with:
- Dark background theme (HSL 222 47% 11%)
- Tech green primary color (HSL 160 84% 39%)
- Monospace fonts (JetBrains Mono) for data/code elements
- Sans-serif fonts (Inter) for UI elements
- Glassmorphic cards with subtle borders and shadows
- Real-time data visualizations using Recharts

### Backend Architecture

**Framework**: Express.js server with TypeScript, providing RESTful API endpoints.

**Server Structure**:
- Main server entry point (`server/index.ts`) sets up Express middleware and HTTP server
- Routes module (`server/routes.ts`) registers all API endpoints
- Storage abstraction layer (`server/storage.ts`) provides database operations interface
- Service modules for external integrations (GitHub, Slack, Scheduler)

**Development vs Production**: The application uses conditional Vite integration during development for HMR (Hot Module Replacement). In production, it serves pre-built static assets from the `dist/public` directory.

**Build Process**: Custom esbuild configuration bundles server code with selective dependency bundling to reduce cold start times. The build script bundles allowlisted dependencies (database drivers, API clients) while externalizing others.

### Data Storage

**Database**: PostgreSQL via Neon serverless driver, enabling connection pooling and WebSocket-based connections.

**ORM**: Drizzle ORM provides type-safe database queries and schema management. The schema is defined in TypeScript and migrations are generated using Drizzle Kit.

**Schema Design**:
- `users`: Authentication and user management
- `integration_settings`: Centralized configuration for Slack/GitHub integrations
- `repositories`: Tracked GitHub repositories with metadata
- `activity_log`: GitHub events and commits timeline
- `slack_messages`: Chat history and bot interactions
- `research_projects`: Research initiatives tracking with status (active/on-hold/completed/archived) and h-index fields
- `research_updates`: Timeline updates for research projects
- `milestones`: Monthly goals set by admins for each project
- `milestone_submissions`: Progress updates submitted by team leads
- `team_leads`: People who receive monthly milestone reminder emails
- `admin_emails`: People who receive notifications when submissions are received

**Data Access Pattern**: Storage interface abstracts database operations, providing methods for CRUD operations on each entity type. This separation allows for easy testing and potential database swapping.

### External Dependencies

**GitHub Integration**:
- GitHub REST API v3 for fetching repository metadata, commits, and activity
- Personal access token authentication
- Service layer (`server/services/github.ts`) handles API communication
- Supports organization-wide repository monitoring
- Activity logging for commits, issues, and pull requests
- Papers Pipeline: Fetches paper status from CIMC-ai/paper-pipeline JSON files
- Automatic sync every 6 hours in production, plus on startup

**Slack Integration**:
- Incoming webhooks for posting messages to Slack channels
- Bot token support for enhanced interactions
- Service layer (`server/services/slack.ts`) manages message formatting and delivery
- Configurable channels and notification preferences
- Support for real-time alerts and scheduled summaries

**Scheduling Service**:
- Custom scheduler (`server/services/scheduler.ts`) for automated summaries
- Hourly check intervals for daily/weekly summary triggers
- Configurable timing for daily summaries (HH:mm format)
- Weekly summaries triggered by day of week and time
- Monthly milestone reminders sent on the last Thursday of each month at 9 AM
- In-memory state tracking to prevent duplicate sends

**Email Service (Resend Integration)**:
- Transactional emails via Resend API (`server/services/email.ts`)
- Milestone reminder emails sent to team leads with submission form links
- Admin notification emails when milestone submissions are received
- Automatic credential management via Replit connectors

**Development Tools**:
- Replit-specific Vite plugins for development banner and cartographer
- Custom meta images plugin for OpenGraph/Twitter card generation
- Runtime error overlay for better debugging experience

**UI Libraries**:
- Motion (Framer Motion) for animations and transitions
- date-fns for date manipulation and formatting
- Embla Carousel for carousel components
- Recharts for data visualization
- Lucide React for icons

**Session Management**: 
- Express sessions with connect-pg-simple for PostgreSQL-backed session storage
- Configurable session lifetime and security settings