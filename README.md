# 🦊 Foxy Hub | Agency Client Portal

Foxy Hub is a multi-tenant agency client portal, project management, and billing platform designed to streamline operations, collaboration, and subscription management between agencies and their clients. 

Built with Next.js App Router, TypeScript, and a security-first backend architecture powered by Supabase.

---

## 🛠️ Tech Stack & Architecture

- Framework: Next.js (App Router, React Server Components)
- Language: TypeScript (Strict Mode)
- Styling: Tailwind CSS
- UI Components: shadcn/ui & Reusable Fx Design Tokens
- Icons: Lucide React
- Theme Management: next-themes (Light / Dark / System)
- Backend & Auth: Supabase (@supabase/ssr with RLS Policies)
- Schema Validation: Zod (Form handling & runtime env parsing)

---

## 📁 Project Architecture

The codebase follows a modular, domain-driven structure isolating server actions, proxy guards, schemas, and shared design primitives:

foxy-hub/
├── app/                  # App Router routes, layouts, and loading states
├── components/          
│   ├── ui/               # Primitive shadcn/ui base elements
│   ├── shared/           # Design System tokens (FxCard, FxButton, FxField)
│   └── layout/           # Sidebar, Navigation, and Header layouts
├── features/             # Feature-based domain logic (auth, profile, workspace)
│   └── auth/actions.ts   # Explicit 'use server' mutation handlers
├── lib/                  # Infrastructure & Utilities
│   ├── dal/              # Data Access Layer & DTO types
│   ├── env.ts            # Type-safe Zod runtime environment parser
│   └── utils.ts          # Styling & formatting helpers
├── proxy.ts              # Edge request proxying & route authentication guard
└── types/                # Shared application & database interfaces

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed locally:

- Node.js: v18.17+ or v20+
- Package Manager: npm or pnpm

### 1. Installation

Clone the repository and install dependencies:

git clone https://github.com/your-username/foxy-hub-ui.git
cd foxy-hub-ui
npm install

### 2. Environment Variables

Create a .env.local file in the root directory and populate it with your configuration:

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME="Foxy Hub"
NEXT_PUBLIC_SITE_DESCRIPTION="Agency Client Portal & Project Platform"
NEXT_PUBLIC_TWITTER_HANDLE=@foxyhub

# Supabase Public Keys (Browser & Edge Safe)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Supabase Private Admin Key (SERVER-ONLY — Never expose to client)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

Note: Environment variables are validated on app initialization using Zod (lib/env.ts). Missing or malformed variables will fail fast at runtime.

### 3. Running Locally

Start the development server:

npm run dev

Open http://localhost:3000 in your browser to view the application.

---

## 🛡️ Security & Route Protection

- Request Guarding: Unauthenticated route access and post-auth setup states are handled at the network boundary via proxy.ts using @supabase/ssr.
- Database Access: Client-side components query Supabase through Row Level Security (RLS) policies using the ANON key. Admin overrides are strictly restricted to Server Components / Server Actions using the SUPABASE_SERVICE_ROLE_KEY.

---

## 📜 Code Style & Quality

Run code checks and formatting before pushing changes:

# Lint codebase
npm run lint