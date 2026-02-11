import { Doc } from "../../convex/_generated/dataModel";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TypeBadge } from "./TypeBadge";
import { SeverityBadge } from "./SeverityBadge";
import { TagBadge } from "./TagBadge";
import { UserAvatar } from "./UserAvatar";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface IssueCardProps {
  issue: IssueWithAssignee;
  projectKey: string;
  onView: () => void;
  onDelete: () => void;
}

const MAX_VISIBLE_TAGS = 3;

export function IssueCard({ issue, projectKey, onView, onDelete }: IssueCardProps) {
  const tags = issue.tags || [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = tags.length - MAX_VISIBLE_TAGS;

  return (
    <div className="issue-card" onClick={onView}>
      <div className="issue-card-header">
        <div className="issue-card-left">
          <TypeBadge type={issue.type} />
          <span className="issue-id">
            {projectKey}-{issue.issueNumber}
          </span>
        </div>
        <div className="issue-badges">
          {issue.type === "bug" && issue.severity && (
            <SeverityBadge severity={issue.severity} />
          )}
          <PriorityBadge priority={issue.priority} />
          <StatusBadge status={issue.status} />
        </div>
      </div>
      <h4 className="issue-title">{issue.title}</h4>
      {issue.description && (
        <p className="issue-description">{issue.description}</p>
      )}
      {tags.length > 0 && (
        <div className="issue-card-tags">
          {visibleTags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          {remainingCount > 0 && (
            <span className="tag-overflow">+{remainingCount}</span>
          )}
        </div>
      )}
      <div className="issue-card-footer">
        <div className="issue-card-footer-left">
          <span className="issue-date">
            {new Date(issue.createdAt).toLocaleDateString()}
          </span>
          {issue.assignee && (
            <UserAvatar
              name={issue.assignee.name}
              image={issue.assignee.image}
              size="small"
            />
          )}
        </div>
        <button
          className="delete-btn small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete issue"
        >
          ×
        </button>
      </div>
    </div>
  );
}
