









WorkFlow: Enterprise AI Human Capital & Task Management Suite
WorkFlow is a highly secure, enterprise-grade MNC Human Resource Management System (HRMS) and Predictive Task Analytics platform. Designed to satisfy rigorous corporate compliance guidelines, it transitions away from standard isolated SDK dependencies to a unified, asynchronous cloud neural router backbone executing across low-latency AI architectures.

The system is fully bound to an atomic relational Postgres instance through a secure realtime replication matrix, completely isolating production datasets from phantom records or dummy execution layers.

📑 Table of Contents
Core Architectural Blueprint

Neural Routing Framework (Qwen 3 Engine)

System Modules & Workspace Separation

Enterprise Database Schema Manual

Neural Router API Contract Documentation

Local Deployment Setup

MNC Compliance & Git Deployment Protocol

🏗️ Core Architectural Blueprint
The front-facing architecture utilizes React 18, compiled through Vite via an optimized Single Page Application (SPA) tree structure, strictly mapped using TypeScript (Strict Mode). Structural layout design elements are built using Tailwind CSS layout boundaries and shadcn/ui core component definitions, utilizing atomic icon assets from the Lucide-React system wrapper.

┌─────────────────────────────────────────────────────────────────┐
│                    React Client SPA (Vite)                      │
│      Admin Engine  │  HR Hub  │  Team Lead  │  Candidate Hub    │
└────────────────┬────────────────────────────────┬───────────────┘
                 │                                │
  JSON Payloads  │                                │ Asynchronous REST
 (TLS Encrypted) │                                │  HTTPS Packets
                 ▼                                ▼
┌─────────────────────────────────┐    ┌──────────────────────────┐
│      Supabase Data Matrix       │    │   Hugging Face Router    │
│  Postgres DB  │ Storage Buckets │    │    Qwen/Qwen3-32B:groq   │
└─────────────────────────────────┘    └──────────────────────────┘
Strategic System Safeguards
Context Persistence Boundaries: Walled-off system workspaces prevent session parameter leakage between corporate execution roles (admin, hr, team_lead, employee, candidate).

Realtime Invalidation Engine: PostgREST database tracking webhooks listen across system nodes (tasks, complaints, leaves, notifications), executing context refresh loops on client state layers immediately.

Failsafe DB Mutations: All data mutations implement typed error collection blocks that explicitly capture, log, and throw exceptions upstream rather than allowing hidden runtime failures.

🧠 Neural Routing Framework (Qwen 3 Engine)
The system completely bypasses isolated vendor SDKs, routing all cognitive analysis, workspace metrics scoring, and talent trajectories through a centralized, hyper-secure Hugging Face Unified Router endpoint leveraging the Qwen/Qwen3-32B:groq framework.

Cognitive Purification Pipeline
To safeguard enterprise production data layers from parsing exceptions, a deterministic sanitization pipeline parses every LLM response:

Low-Temperature Bounds (0.1 - 0.2): Eradicates token hallucinations, forcing responses to stick to strict schema layouts or plain text.

Reasoning Isolate Blocks: Intercepts and completely purges deep model-internal thought tags (<think>...</think> or <thinking>...</thinking>).

Regex Sanitize Filters: Wipes out syntax highlighting markers (```json), formatting asterisks (), or hash headings (#) to protect column writebacks from format corruption.

🏢 System Modules & Workspace Separation
1. Central Application Hub & Recruiting ATS
Dynamic Form Synthesis: Asynchronously maps active Job Descriptions (JDs) to construct custom screening questionnaires, storing schemas in database tables.

Global ATS Queue Processing: Evaluates candidate interview data in batches or individual tracks against live JDs via the Qwen 3 router engine, outputting database scores.

2. Corporate Smart Inbox API
Workspace Implicit OAuth 2.0 Flow: HR authenticates via Google's OAuth gateway to download Base64url message segments from the corporate Gmail REST endpoint securely.

Neural Email Parsing: Decrypts body segments on the fly, matching applicant profiles against target schemas before uploading task records directly to Supabase.

3. Onboarding & Verification Center
Human-Gated Document Verification: Loads binary documents from protected storage buckets, featuring native View and Download capability.

Atomic Role Elevation Matrix: Gates candidate account conversion. Upon HR sign-off, it updates the record's role from 'candidate' to 'employee', maps department hierarchies, binds a reporting Team Lead manager, and logs the session entry in candidate_onboarding.

4. AI Performance Engine
Organization Evaluation Cycles: Aggregates background operational performance logs (completed tasks metrics vs total active logged shift hours), and runs evaluation prompts via Qwen 3 to save updated metrics to profile histories.

5. AI Career Path Predictor
Predictive Talent Analytics: Employees can evaluate their historical record trajectories to check promotion viability, calculate operational layoff probability risks, and receive quarterly skill targets.

🗄️ Enterprise Database Schema Manual
public.profiles
Tracks secure organizational variables and performance scores for all users.

SQL
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'hr', 'team_lead', 'employee', 'candidate', 'archived')),
    department TEXT DEFAULT 'Unassigned',
    team_lead_id UUID REFERENCES public.profiles(id),
    payroll_ctc NUMERIC DEFAULT 0,
    performance_score INTEGER DEFAULT 0,
    performance_history JSONB DEFAULT '[]'::jsonb,
    ai_career_prediction JSONB DEFAULT NULL,
    verification_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
public.background_verifications
Manages candidate background screening document verification metrics.

SQL
CREATE TABLE public.background_verifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Verified', 'Rejected')),
    verification_status VARCHAR(50) DEFAULT 'Submitted',
    ai_analysis TEXT,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
public.candidate_onboarding
Tracks official onboarding logs for verification audits.

SQL
CREATE TABLE public.candidate_onboarding (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    department VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
public.tasks
Manages task distribution metrics across the corporate system.

SQL
CREATE TABLE public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
    priority VARCHAR(50) DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    project_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
🔌 Neural Router API Contract Documentation
End-of-Day Shift Evaluation Prompt
Endpoint: POST https://router.huggingface.co/v1/chat/completions

Headers:

HTTP
Authorization: Bearer VITE_HF_TOKEN
Content-Type: application/json
Payload Structure:

JSON
{
  "model": "Qwen/Qwen3-32B:groq",
  "temperature": 0.2,
  "messages": [
    {
      "role": "user",
      "content": "Act as an elite FWC India HR Evaluation Engine. Employee: John Doe. Hours Worked: 8.50. Tasks Done: 3 (Fix layout crash, Update auth service). Write a 3-sentence performance review. Assign a 'Competence Score' out of 100. No markdown."
    }
  ]
}
Cleaned Response Output:

John Doe completed all assigned tasks with high efficiency during this shift, logging a standard 8.5 hours. Time-management boundaries were maintained within optimal operational tolerances. Competence Score: 88.
Predictive HR Matrix Prompt
Endpoint: POST https://router.huggingface.co/v1/chat/completions

Payload Structure:

JSON
{
  "model": "Qwen/Qwen3-32B:groq",
  "temperature": 0.1,
  "messages": [
    {
      "role": "user",
      "content": "Act as an Elite MNC Predictive HR Algorithm... Output a STRICT JSON object answering these exact corporate points: {\"promotion_verdict\": \"Deserves Promotion\", \"raise_verdict\": \"Deserves Raise\", \"dry_promotion_chance\": 85, \"layoff_risk\": 15, \"training_required\": true, \"training_topic\": \"Skill\", \"overall_analysis\": \"Analysis\"}"
    }
  ]
}
Cleaned Response Output (JSON Array):

JSON
{
  "promotion_verdict": "Maintain Current Level",
  "raise_verdict": "Hold Steady",
  "dry_promotion_chance": 12,
  "layoff_risk": 5,
  "training_required": true,
  "training_topic": "Advanced Database Sharding",
  "overall_analysis": "Employee matches assigned completion velocities regularly. Total logged active presence falls within safe parameters. Vertical movement is recommended upon next quarterly cycle check."
}
🛠️ Local Deployment Setup
To initialize the project environment locally, use the following commands:

Bash
# 1. Clone the project repository from the corporate version control host
git clone [https://github.com/Veeresh111/Task-Flow-Tracker.git](https://github.com/Veeresh111/Task-Flow-Tracker.git)
cd Task-Flow-Tracker

# 2. Install all strict structural dependency node modules
npm install

# 3. Spin up the Vite performance development server locally
npm run dev
Configuration Environment Settings (.env)
Create a .env file in your project's root folder and append your secure connection string keys:

Code snippet
VITE_SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
VITE_SUPABASE_ANON_KEY=your-anon-key-string
VITE_HF_TOKEN=hf_your_actual_token_string
🚀 MNC Compliance & Git Deployment Protocol
To push your local code changes up to the remote source repository securely without exposing secret access keys or triggering structural layout compilation crashes, use this Git delivery sequence:

1. Perform Failsafe Verification Tests
Before committing any changes, run a local production build to check for TypeScript type errors or syntax mistakes:

Bash
npm run build
Make sure the compilation completes with zero errors before moving to the commit stage.

2. Delivery Sequence Commands
Run these commands in order from your terminal to stage, commit, and securely deploy your file changes:

Bash
# Verify the current branch context is set to your target team line
git branch

# Stage all updated file changes, component modules, and SQL schema code scripts
git add .

# Log a descriptive, compliance-approved commit note outlining your updates
git commit -m "feat(core): migrate AI engines to unified Qwen 3 router and patch onboarding schema"

# Push the verified local changes up to the secure upstream backend repository branch
git push origin backend-development# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
