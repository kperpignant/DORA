import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TypeBadge } from "./TypeBadge";
import { SeverityBadge } from "./SeverityBadge";
import { TagBadge } from "./TagBadge";
import { UserAvatar } from "./UserAvatar";
import { IssueForm } from "./IssueForm";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface IssueDetailViewProps {
  issue: IssueWithAssignee;
  projectKey: string;
  onBack: () => void;
}

export function IssueDetailView({ issue, projectKey, onBack }: IssueDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const deleteIssue = useMutation(api.issues.remove);

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this issue?")) {
      await deleteIssue({ id: issue._id });
      onBack();
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="issue-detail">
      <div className="issue-detail-header">
        <button className="btn btn-secondary back-btn" onClick={onBack}>
          ← Back to Issues
        </button>
        <div className="issue-detail-actions">
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="issue-detail-content">
        <div className="issue-detail-top">
          <span className="issue-detail-id">
            {projectKey}-{issue.issueNumber}
          </span>
          <TypeBadge type={issue.type} />
        </div>

        <h1 className="issue-detail-title">{issue.title}</h1>

        <div className="issue-detail-badges">
          <StatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
          {issue.type === "bug" && issue.severity && (
            <SeverityBadge severity={issue.severity} />
          )}
        </div>

        <div className="issue-detail-section">
          <h3>Assignee</h3>
          <div className="issue-detail-assignee">
            {issue.assignee ? (
              <UserAvatar
                name={issue.assignee.name}
                image={issue.assignee.image}
                size="medium"
                showName
              />
            ) : (
              <span className="empty-text">Unassigned</span>
            )}
          </div>
        </div>

        <div className="issue-detail-section">
          <h3>Tags</h3>
          <div className="issue-detail-tags">
            {issue.tags && issue.tags.length > 0 ? (
              issue.tags.map((tag) => <TagBadge key={tag} tag={tag} />)
            ) : (
              <span className="empty-text">No tags</span>
            )}
          </div>
        </div>

        <div className="issue-detail-section">
          <h3>Description</h3>
          <div className="issue-detail-description">
            {issue.description || <span className="empty-text">No description provided</span>}
          </div>
        </div>

        {/* Type-specific sections */}
        {issue.type === "task" && (
          <div className="issue-detail-section">
            <h3>Estimate</h3>
            <div className="issue-detail-estimate">
              {issue.estimate || <span className="empty-text">No estimate provided</span>}
            </div>
          </div>
        )}

        {issue.type === "bug" && (
          <>
            <div className="issue-detail-section">
              <h3>Severity</h3>
              <div className="issue-detail-severity">
                {issue.severity ? (
                  <SeverityBadge severity={issue.severity} />
                ) : (
                  <span className="empty-text">No severity set</span>
                )}
              </div>
            </div>
            <div className="issue-detail-section">
              <h3>Steps to Reproduce</h3>
              <div className="issue-detail-steps">
                {issue.stepsToReproduce ? (
                  <pre>{issue.stepsToReproduce}</pre>
                ) : (
                  <span className="empty-text">No steps provided</span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="issue-detail-meta">
          <div className="meta-item">
            <span className="meta-label">Created:</span>
            <span className="meta-value">{formatDate(issue.createdAt)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Updated:</span>
            <span className="meta-value">{formatDate(issue.updatedAt)}</span>
          </div>
        </div>
      </div>

      {isEditing && (
        <IssueForm
          projectId={issue.projectId}
          issue={issue}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}
