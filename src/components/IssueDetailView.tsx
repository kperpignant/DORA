import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TypeBadge } from "./TypeBadge";
import { SeverityBadge } from "./SeverityBadge";
import { TagBadge } from "./TagBadge";
import { UserAvatar } from "./UserAvatar";
import { formatUserLabel } from "../lib/formatUserLabel";
import { IssueForm } from "./IssueForm";
import { AiSummaryPanel } from "./AiSummaryPanel";
import { IssueAttachments } from "./IssueAttachments";
import { CodeBlock } from "./CodeBlock";
import { CommentsSection } from "./CommentsSection";
import { EpicBadge } from "./EpicBadge";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
  epic?: Doc<"epics"> | null;
}

interface IssueDetailViewProps {
  issue: IssueWithAssignee;
  projectKey: string;
  onBack: () => void;
}

export function IssueDetailView({ issue, projectKey, onBack }: IssueDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const deleteIssue = useMutation(api.issues.remove);
  const live = useQuery(api.issues.get, { id: issue._id });
  const currentUser = useQuery(api.users.current);

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this issue?")) {
      await deleteIssue({ id: issue._id });
      onBack();
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (live === null) {
    return (
      <div className="issue-detail">
        <p className="issue-detail-error">This issue no longer exists or was deleted.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          ← Back to Issues
        </button>
      </div>
    );
  }

  const displayIssue = live ?? issue;

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

      <div className="issue-detail-layout">
        <div className="issue-detail-main">
          <div className="issue-detail-content">
            <div className="issue-detail-top">
              <span className="issue-detail-id">
                {projectKey}-{displayIssue.issueNumber}
              </span>
              <TypeBadge type={displayIssue.type} />
            </div>

            <h1 className="issue-detail-title">{displayIssue.title}</h1>

            <div className="issue-detail-badges">
              <StatusBadge status={displayIssue.status} />
              <PriorityBadge priority={displayIssue.priority} />
              {displayIssue.type === "bug" && displayIssue.severity && (
                <SeverityBadge severity={displayIssue.severity} />
              )}
              {displayIssue.epic && (
                <EpicBadge epic={displayIssue.epic} projectKey={projectKey} />
              )}
            </div>

            <div className="issue-detail-section">
              <h3>Assignee</h3>
              <div className="issue-detail-assignee">
                {displayIssue.assignee ? (
                  <UserAvatar
                    name={formatUserLabel(displayIssue.assignee)}
                    image={displayIssue.assignee.image}
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
                {displayIssue.tags && displayIssue.tags.length > 0 ? (
                  displayIssue.tags.map((tag) => <TagBadge key={tag} tag={tag} />)
                ) : (
                  <span className="empty-text">No tags</span>
                )}
              </div>
            </div>

            <div className="issue-detail-section">
              <h3>Description</h3>
              <div className="issue-detail-description">
                {displayIssue.description || <span className="empty-text">No description provided</span>}
              </div>
            </div>

            {displayIssue.codeLog && (
              <div className="issue-detail-section">
                <h3>Code / Logs</h3>
                <CodeBlock value={displayIssue.codeLog} />
              </div>
            )}

            <div className="issue-detail-section">
              <h3>Attachments</h3>
              <IssueAttachments issueId={displayIssue._id} />
            </div>

            <div className="issue-detail-section">
              <h3>Comments</h3>
              <CommentsSection
                issueId={displayIssue._id}
                currentUserId={currentUser?._id}
              />
            </div>

            {/* Type-specific sections */}
            {displayIssue.type === "task" && (
              <div className="issue-detail-section">
                <h3>Estimate</h3>
                <div className="issue-detail-estimate">
                  {displayIssue.estimate || <span className="empty-text">No estimate provided</span>}
                </div>
              </div>
            )}

            {displayIssue.type === "bug" && (
              <>
                <div className="issue-detail-section">
                  <h3>Severity</h3>
                  <div className="issue-detail-severity">
                    {displayIssue.severity ? (
                      <SeverityBadge severity={displayIssue.severity} />
                    ) : (
                      <span className="empty-text">No severity set</span>
                    )}
                  </div>
                </div>
                <div className="issue-detail-section">
                  <h3>Steps to Reproduce</h3>
                  <div className="issue-detail-steps">
                    {displayIssue.stepsToReproduce ? (
                      <pre>{displayIssue.stepsToReproduce}</pre>
                    ) : (
                      <span className="empty-text">No steps provided</span>
                    )}
                  </div>
                </div>
                <div className="issue-detail-section">
                  <h3>Expected result</h3>
                  <div className="issue-detail-result">
                    {displayIssue.expectedResult ? (
                      <pre>{displayIssue.expectedResult}</pre>
                    ) : (
                      <span className="empty-text">Not specified</span>
                    )}
                  </div>
                </div>
                <div className="issue-detail-section">
                  <h3>Actual result</h3>
                  <div className="issue-detail-result">
                    {displayIssue.actualResult ? (
                      <pre>{displayIssue.actualResult}</pre>
                    ) : (
                      <span className="empty-text">Not specified</span>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="issue-detail-meta">
              <div className="meta-item">
                <span className="meta-label">Created:</span>
                <span className="meta-value">{formatDate(displayIssue.createdAt)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Updated:</span>
                <span className="meta-value">{formatDate(displayIssue.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {displayIssue.type === "bug" && (
          <aside className="issue-detail-aside">
            <AiSummaryPanel issue={displayIssue} />
          </aside>
        )}
      </div>

      {isEditing && (
        <IssueForm
          projectId={displayIssue.projectId}
          issue={displayIssue}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}
