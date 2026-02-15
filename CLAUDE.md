# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run preview      # Preview production build
```

No test framework is configured.

## Architecture

**React 18 SPA** built with TypeScript, Vite, and React Router v6. This is an enterprise innovation management platform with modules for ideas, projects, teams, and analytics (Edge, Crunch, Flow).

### Key Layers

- **Routing**: All routes defined in `src/App.tsx` — flat route structure, no nested layouts in the router. Add new routes above the `*` catch-all.
- **Layout**: Most pages wrap content in `DashboardLayout` which provides the sidebar (`AppSidebar`), top header, search, notifications, and theme toggle. Mobile uses a Sheet-based drawer sidebar.
- **Auth**: `src/hooks/useAuth.tsx` — currently a mock auth provider returning `demo@example.com`. Real auth will use Supabase. Wrap with `AuthProvider` at root.
- **Data fetching**: TanStack React Query for server state. Supabase client at `src/integrations/supabase/client.ts` with auto-generated types. Many pages currently use hardcoded mock data.
- **Forms**: React Hook Form + zod for validation.
- **State**: React Context (auth), React Query (server), component-level useState (UI). No global state library.

### Path Alias

`@/*` maps to `src/*` (configured in vite.config.ts and tsconfig).

### Import Convention for Supabase

```ts
import { supabase } from "@/integrations/supabase/client";
```

## UI & Styling

### Component Library

shadcn/ui components in `src/components/ui/` — these are Radix UI primitives styled with Tailwind. Do not import from Radix directly; use the shadcn wrappers.

### Design System

Full spec in `docs/DESIGN_SYSTEM.md`. Key constraints:

- **Colors**: Primary Blue `#4B6CA1`, Primary Yellow `#FDD31D`. Never use pure black `#000` — all grays are blue-tinted.
- **Typography**: Display = IBM Plex Sans, Body = Inter, Mono = IBM Plex Mono.
- **Custom CSS classes**: `fusion-card`, `fusion-card-flat`, `status-badge-*`, `metric-widget` — defined in `tailwind.config.ts` and `src/index.css`.
- **Spacing**: 8px grid system.
- **Icons**: Lucide React exclusively.
- **Toasts**: Sonner (via `src/components/ui/sonner.tsx`).
- **Charts**: Recharts.
- **Dark mode**: next-themes with system/light/dark support.

### Mobile Responsiveness

`useIsMobile` hook (`src/hooks/use-mobile.tsx`) detects mobile breakpoints. `DashboardLayout` renders different header/sidebar patterns for mobile vs desktop. Mobile sidebar uses Sheet (drawer). Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

- `src/pages/` — one file per route, each is a full page component
- `src/components/` — shared components (AppSidebar, DashboardLayout)
- `src/components/ui/` — shadcn/ui primitives (do not edit manually — regenerate with shadcn CLI)
- `src/hooks/` — useAuth, useToast, useIsMobile
- `src/lib/` — utilities (cn helper for className merging)
- `src/integrations/supabase/` — auto-generated Supabase client and DB types
- `supabase/` — database migrations
- `docs/` — design system documentation
