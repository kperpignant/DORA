import { useMemo, useState } from "react";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "planned" | "in_progress" | "done">("all");

  const filteredEpics = useMemo(() => {
    if (!epics) return [];
    if (statusFilter === "all") return epics;
    return epics.filter((epic) => epic.status === statusFilter);
  }, [epics, statusFilter]);

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
        <h3>
          Epics
          {epics && statusFilter !== "all" && (
            <span className="search-results-count"> ({filteredEpics.length} results)</span>
          )}
        </h3>
        <div className="epics-view-controls">
          <select
            className="sort-select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            title="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <button className="btn btn-primary" onClick={() => setIsCreatingEpic(true)}>
            + New Epic
          </button>
        </div>
      </div>

      <div className="epic-cards">
        {epics === undefined ? (
          <p className="loading">Loading epics...</p>
        ) : filteredEpics.length === 0 ? (
          <p className="empty">
            {statusFilter !== "all"
              ? "No epics match the current filter."
              : "No epics yet. Create one to group issues by feature."}
          </p>
        ) : (
          filteredEpics.map((epic) => (
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
