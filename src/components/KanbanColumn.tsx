import { useDroppable } from "@dnd-kit/core";
import { Doc } from "../../convex/_generated/dataModel";
import { KanbanCard } from "./KanbanCard";

type Status = "todo" | "in_progress" | "done";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface KanbanColumnProps {
  status: Status;
  title: string;
  issues: IssueWithAssignee[];
  projectKey: string;
  onViewIssue: (issue: IssueWithAssignee) => void;
}

export function KanbanColumn({ status, title, issues, projectKey, onViewIssue }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? "drag-over" : ""}`}
    >
      <div className="kanban-column-header">
        <h3>{title}</h3>
        <span className="kanban-column-count">{issues.length}</span>
      </div>
      <div className="kanban-column-content">
        {issues.map((issue) => (
          <KanbanCard
            key={issue._id}
            issue={issue}
            projectKey={projectKey}
            onView={() => onViewIssue(issue)}
          />
        ))}
        {issues.length === 0 && (
          <div className="kanban-column-empty">
            No issues
          </div>
        )}
      </div>
    </div>
  );
}
