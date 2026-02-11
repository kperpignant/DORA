import { useDraggable } from "@dnd-kit/core";
import { Doc } from "../../convex/_generated/dataModel";
import { TypeBadge } from "./TypeBadge";
import { PriorityBadge } from "./PriorityBadge";
import { SeverityBadge } from "./SeverityBadge";
import { TagBadge } from "./TagBadge";
import { UserAvatar } from "./UserAvatar";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface KanbanCardProps {
  issue: IssueWithAssignee;
  projectKey: string;
  onView: () => void;
}

const MAX_VISIBLE_TAGS = 2;

export function KanbanCard({ issue, projectKey, onView }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue._id,
    data: { issue },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const tags = issue.tags || [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = tags.length - MAX_VISIBLE_TAGS;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`kanban-card ${isDragging ? "dragging" : ""}`}
      onClick={onView}
    >
      <div className="kanban-card-header">
        <div className="kanban-card-left">
          <TypeBadge type={issue.type} />
          <span className="kanban-card-id">
            {projectKey}-{issue.issueNumber}
          </span>
        </div>
        <PriorityBadge priority={issue.priority} />
      </div>
      <h4 className="kanban-card-title">{issue.title}</h4>
      {tags.length > 0 && (
        <div className="kanban-card-tags">
          {visibleTags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          {remainingCount > 0 && (
            <span className="tag-overflow">+{remainingCount}</span>
          )}
        </div>
      )}
      <div className="kanban-card-footer">
        {issue.type === "bug" && issue.severity && (
          <SeverityBadge severity={issue.severity} />
        )}
        {issue.assignee && (
          <UserAvatar
            name={issue.assignee.name}
            image={issue.assignee.image}
            size="small"
          />
        )}
      </div>
    </div>
  );
}
