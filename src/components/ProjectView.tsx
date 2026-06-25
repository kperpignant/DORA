import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { IssueList } from "./IssueList";
import { IssueForm } from "./IssueForm";
import { IssueDetailView } from "./IssueDetailView";
import { KanbanBoard } from "./KanbanBoard";
import { EpicsView } from "./EpicsView";
import { ViewToggle } from "./ViewToggle";
import { SearchBar } from "./SearchBar";
import { ProjectSettingsForm } from "./ProjectSettingsForm";

type ViewMode = "list" | "kanban" | "epics";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface ProjectViewProps {
  projectId: Id<"projects">;
}

export function ProjectView({ projectId }: ProjectViewProps) {
  const project = useQuery(api.projects.get, { id: projectId });
  const currentUser = useQuery(api.users.current);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [viewingIssue, setViewingIssue] = useState<IssueWithAssignee | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProjectSettings, setShowProjectSettings] = useState(false);

  if (project === undefined) {
    return <div className="project-view loading">Loading project...</div>;
  }

  if (project === null) {
    return <div className="project-view error">Project not found</div>;
  }

  // Show issue detail view if an issue is selected
  if (viewingIssue) {
    return (
      <IssueDetailView
        issue={viewingIssue}
        projectKey={project.key}
        onBack={() => setViewingIssue(null)}
      />
    );
  }

  return (
    <div className="project-view">
      <div className="project-view-header">
        <div className="project-view-header-top">
          <div>
            <span className="project-key-large">{project.key}</span>
            <h2>{project.name}</h2>
          </div>
          <div className="project-view-controls">
            {currentUser?.isAdmin && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowProjectSettings(true)}
              >
                Settings
              </button>
            )}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search issues..."
            />
            <ViewToggle view={viewMode} onChange={setViewMode} />
          </div>
        </div>
        {project.description && (
          <p className="project-description">{project.description}</p>
        )}
      </div>

      {viewMode === "list" ? (
        <IssueList
          projectId={projectId}
          projectKey={project.key}
          searchQuery={searchQuery}
          onViewIssue={setViewingIssue}
          onCreateIssue={() => setIsCreatingIssue(true)}
        />
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          projectId={projectId}
          projectKey={project.key}
          searchQuery={searchQuery}
          onViewIssue={setViewingIssue}
          onCreateIssue={() => setIsCreatingIssue(true)}
        />
      ) : (
        <EpicsView
          projectId={projectId}
          projectKey={project.key}
          onViewIssue={setViewingIssue}
        />
      )}

      {isCreatingIssue && (
        <IssueForm
          projectId={projectId}
          onClose={() => setIsCreatingIssue(false)}
        />
      )}

      {showProjectSettings && (
        <ProjectSettingsForm
          mode="edit"
          project={project}
          onClose={() => setShowProjectSettings(false)}
        />
      )}
    </div>
  );
}
