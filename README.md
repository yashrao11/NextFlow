# NextFlow - LLM Workflow Builder

**Live Demo URL**: [https://next-flow-topaz-theta.vercel.app/](https://next-flow-topaz-theta.vercel.app/)

NextFlow is a pixel-perfect clone of the Galaxy.ai workflow builder, focused exclusively on creating and executing LLM workflows. This project has been built in accordance with the assignment specifications, featuring modern design systems, asynchronous task scheduling via Trigger.dev, AI inference with Google Gemini, and persistent campaign histories in Neon PostgreSQL.

## 🚀 Features & Deliverables

### 1. Authentication & Security (Clerk)
* Fully integrated with Clerk authentication.
* All routes (except Clerk public endpoints) are protected under global middleware. Unauthenticated traffic is redirected straight to Clerk's secure login.
* Workflows, campaigns, and run history are scoped strictly to the signed-in user.

### 2. Dashboard Page
* Lists all workflows belonging to the signed-in user, detailing name, last-edited relative timestamps, and execution status badges.
* Supports **Create New Workflow**, **Open**, **Rename**, and **Delete** actions.
* Custom-designed cards and list styles matching the exact hover states, typography, and layout of the Galaxy.ai dashboard.

### 3. React Flow Canvas Builder
* Pre-placed, undeletable **Request-Inputs** (top/left) and **Response** (right) nodes on canvas creation.
* Searchable floating node picker (`+` button bottom-center) with categories (`Recent`, `Image`, `Video`, `Audio`, `Others`) to add **Crop Image** and **Gemini 3.1 Pro** cards.
* Full support for pan, zoom, fit-view, interactive MiniMap, and a dot grid background.
* Zustand-powered **Undo / Redo** stack covering all node movements, creations, and edits.
* Animated edge connections matching references.

### 4. Interactive Node Parameters & DAG Rules
* **Configurable Inputs**: Manual entry inputs (crop sliders, Gemini prompts) are greyed-out/disabled when their respective handle receives an active incoming connection.
* **Type-Safe Connections**: The canvas visually rejects invalid drags (e.g. connecting an image output handle to a text prompt handle).
* **DAG-Only Validation**: Edge connections execute Depth-First Search (DFS) cycle checks. Loops are blocked, preventing canvas deadlock.

### 5. Multi-Scope Execution Engine (Trigger.dev & Gemini)
* **All executions run as Trigger.dev tasks**: Crops (`cropImageTask`) and LLM queries (`geminiPromptTask`) are decoupled to background queues.
* **Selective Execution**: Supports running the whole workflow (`FULL`), running target nodes (`PARTIAL`), or executing individual components.
* **Parallel Fan-Out**: Sibling tasks execute concurrently. A finished sibling proceeds downstream immediately without blocking on unrelated siblings at the same DAG level.
* **Pulsating border glows** highlight executing nodes.
* **Google Gemini integration**: Multi-image vision inputs are supported, fanning multiple crop nodes into Gemini Vision. Response is rendered inline.
* **Crop Delay Requirement**: The `Crop Image` task enforces a strictly **31-second delay** in both Trigger.dev and local fallback tasks.

### 6. JSON Export & Import
* Built-in buttons in the header to **Export JSON** and **Import JSON** canvas configurations.
* Import logic validates the JSON structure and ensures that essential core nodes (`Request-Inputs` and `Response`) are kept undeletable.

### 7. Run History Sidebar
* Color-coded badges representing success, failed, and partial run outcomes.
* Expandable node cards detailing node-level logs (inputs, outputs, execution duration, and stack traces).

---

## 🛠️ Tech Stack

* **Framework**: Next.js 14 (App Router)
* **Language**: TypeScript (Strict Mode)
* **Auth**: Clerk
* **Database**: PostgreSQL (Neon Serverless)
* **ORM**: Prisma Client
* **Canvas Engine**: React Flow
* **Background Runner**: Trigger.dev v3
* **AI Engine**: Google Gemini API (`@google/generative-ai`)
* **Image Processor**: Jimp v1 (Standard JPEG canvas-standardization)

---

## 🔑 Environment Variables Config (`.env`)

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Clerk Authentication Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# AI Inference Keys
GEMINI_API_KEY="AIzaSy..."

# Trigger.dev Keys
TRIGGER_API_KEY="tr_dev_..."
```

---

## 📦 Local Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database Schema
Generate the client and push the schema to PostgreSQL:
```bash
npx prisma generate
npx prisma db push
```

### 3. Seed the Sample Campaign Template
Seed the database with the pre-built **Headphones Marketing Campaign** template:
```bash
npx prisma db seed
```
This builds the exact campaign DAG structure (coordinates, edges, Gemini copy prompts) specified in the assignment details.

### 4. Run Trigger.dev Development Worker
Start the background queue processor:
```bash
npx trigger.dev@latest dev
```

### 5. Start Local Server
Run the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the builder dashboard.

---

## 📌 Implementation Notes

### Candidate Attribution Log
On the initial render of every page, the client outputs a log message in the browser console format:
`[NextFlow] Candidate LinkedIn: https://www.linkedin.com/in/yash-rao-75891316b`

### Client-Side Image Standardization
To prevent Jimp backend failures on modern macOS formats (like AVIF or WebP), the client standardizes file uploads by converting them to standard downscaled JPEG buffers. Re-uploading a photo instantly resolves crop fallbacks.
