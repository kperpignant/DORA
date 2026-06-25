import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { EpicCard } from "./EpicCard";
import { EpicForm } from "./EpicForm";
import { EpicDetailView } from "./EpicDetailView";

interface EpicWithProgress extends Doc<"epics"> {
  issueCount: number;
  doneCount: number;
}

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface EpicsViewProps {
  projectId: Id<"projects">;
  projectKey: string;
  onViewIssue: (issue: IssueWithAssignee) => void;
}

export function EpicsView({ projectId, projectKey, onViewIssue }: EpicsViewProps) {
  const epics = useQuery(api.epics.listByProject, { projectId });
  const [viewingEpic, setViewingEpic] = useState<EpicWithProgress | null>(null);
  const [isCreatingEpic, setIsCreatingEpic] = useState(false);

  if (viewingEpic) {
    return (
      <EpicDetailView
        epic={viewingEpic}
        projectId={projectId}
        projectKey={projectKey}
        onBack={() => setViewingEpic(null)}
        onViewIssue={onViewIssue}
      />
    );
  }

  return (
    <div className="epics-view">
      <div className="epics-view-header">
        <h3>Epics</h3>
        <button className="btn btn-primary" onClick={() => setIsCreatingEpic(true)}>
          + New Epic
        </button>
      </div>

      <div className="epic-cards">
        {epics === undefined ? (
          <p className="loading">Loading epics...</p>
        ) : epics.length === 0 ? (
          <p className="empty">No epics yet. Create one to group issues by feature.</p>
        ) : (
          epics.map((epic) => (
            <EpicCard
              key={epic._id}
              epic={epic}
              projectKey={projectKey}
              onView={() => setViewingEpic(epic)}
            />
          ))
        )}
      </div>

      {isCreatingEpic && (
        <EpicForm projectId={projectId} onClose={() => setIsCreatingEpic(false)} />
      )}
    </div>
  );
}
