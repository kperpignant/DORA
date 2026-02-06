# DORA - Project Management

A simple JIRA clone built with React and Convex.

## Features

- **Project Management**: Create, view, and delete projects
- **Issue Tracking**: Create, edit, and delete issues within projects
- **Status Tracking**: Track issues through To Do, In Progress, and Done statuses
- **Priority Levels**: Assign Low, Medium, or High priority to issues
- **Real-time Updates**: All changes sync in real-time via Convex

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Convex (serverless database and functions)
- **Styling**: Custom CSS with modern design

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Convex account (free at [convex.dev](https://convex.dev))

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize Convex:
   ```bash
   npx convex dev
   ```
   This will prompt you to log in to Convex and create a new project. It will also create a `.env.local` file with your `VITE_CONVEX_URL`.

3. In a new terminal, start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
DORA/
├── convex/                 # Convex backend
│   ├── schema.ts          # Database schema
│   ├── projects.ts        # Project queries and mutations
│   └── issues.ts          # Issue queries and mutations
├── src/
│   ├── components/        # React components
│   │   ├── ProjectList.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── ProjectView.tsx
│   │   ├── IssueList.tsx
│   │   ├── IssueCard.tsx
│   │   ├── IssueForm.tsx
│   │   ├── StatusBadge.tsx
│   │   └── PriorityBadge.tsx
│   ├── App.tsx            # Main app component
│   ├── App.css            # App styles
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── index.html
├── package.json
└── vite.config.ts
```

## Usage

1. **Create a Project**: Click "+ New" in the sidebar to create a new project with a name, key (e.g., "DORA"), and optional description.

2. **Create Issues**: Select a project, then click "+ New Issue" to add issues with title, description, status, and priority.

3. **Edit Issues**: Click on any issue card to edit its details.

4. **Delete**: Use the × button to delete projects or issues.

## License

MIT
