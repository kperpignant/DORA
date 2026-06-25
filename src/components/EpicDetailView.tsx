import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { EpicStatusBadge } from "./EpicStatusBadge";
import { EpicForm } from "./EpicForm";
import { IssueCard } from "./IssueCard";

const DEFAULT_EPIC_COLOR = "#6554c0";

interface EpicWithProgress extends Doc<"epics"> {
  issueCount: number;
  doneCount: number;
}

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface EpicDetailViewProps {
  epic: EpicWithProgress;
  projectId: Id<"projects">;
  projectKey: string;
  onBack: () => void;
  onViewIssue: (issue: IssueWithAssignee) => void;
}

export function EpicDetailView({
  epic,
  projectId,
  projectKey,
  onBack,
  onViewIssue,
}: EpicDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddIssues, setShowAddIssues] = useState(false);

  const liveEpic = useQuery(api.epics.get, { id: epic._id });
  const memberIssues = useQuery(api.epics.listIssues, { epicId: epic._id });
  const allIssues = useQuery(api.issues.listByProject, { projectId });

  const removeEpic = useMutation(api.epics.remove);
  const setIssueEpic = useMutation(api.epics.setIssueEpic);
  const deleteIssue = useMutation(api.issues.remove);

  const displayEpic = liveEpic ?? epic;
  const accentColor = displayEpic.color || DEFAULT_EPIC_COLOR;
  const progressPercent =
    displayEpic.issueCount > 0
      ? Math.round((displayEpic.doneCount / displayEpic.issueCount) * 100)
      : 0;

  const availableIssues = useMemo(() => {
    if (!allIssues) return [];
    return allIssues.filter((issue) => issue.epicId !== epic._id);
  }, [allIssues, epic._id]);

  const handleDeleteEpic = async () => {
    if (confirm("Are you sure you want to delete this epic? Issues will be unlinked but not deleted.")) {
      await removeEpic({ id: epic._id });
      onBack();
    }
  };

  const handleRemoveIssue = async (issueId: Id<"issues">) => {
    await setIssueEpic({ issueId, epicId: null });
  };

  const handleAddIssue = async (issueId: Id<"issues">) => {
    await setIssueEpic({ issueId, epicId: epic._id });
  };

  const handleDeleteIssue = async (id: Id<"issues">) => {
    if (confirm("Are you sure you want to delete this issue?")) {
      await deleteIssue({ id });
    }
  };

  if (liveEpic === null) {
    return (
      <div className="epic-detail">
        <p className="epic-detail-error">This epic no longer exists or was deleted.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          ← Back to Epics
        </button>
      </div>
    );
  }

  return (
    <div className="epic-detail">
      <div className="epic-detail-header">
        <button className="btn btn-secondary back-btn" onClick={onBack}>
          ← Back to Epics
        </button>
        <div className="epic-detail-actions">
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={handleDeleteEpic}>
            Delete
          </button>
        </div>
      </div>

      <div className="epic-detail-content" style={{ borderLeftColor: accentColor }}>
        <div className="epic-detail-top">
          <span className="epic-detail-id">
            {projectKey}-E{displayEpic.epicNumber}
          </span>
          <EpicStatusBadge status={displayEpic.status} />
        </div>

        <h1 className="epic-detail-title">{displayEpic.name}</h1>

        {displayEpic.description && (
          <p className="epic-detail-description">{displayEpic.description}</p>
        )}

        <div className="epic-progress epic-detail-progress">
          <div className="epic-progress-label">
            <span>
              {displayEpic.doneCount} of {displayEpic.issueCount} issues done
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="epic-progress-bar">
            <div
              className="epic-progress-fill"
              style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      </div>

      <div className="epic-detail-issues">
        <div className="epic-detail-issues-header">
          <h3>Issues</h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddIssues((open) => !open)}
          >
            {showAddIssues ? "Hide picker" : "Add issues"}
          </button>
        </div>

        {showAddIssues && (
          <div className="epic-add-issues">
            {availableIssues.length === 0 ? (
              <p className="empty">No other issues available to add.</p>
            ) : (
              <ul className="epic-add-issues-list">
                {availableIssues.map((issue) => (
                  <li key={issue._id} className="epic-add-issues-item">
                    <div className="epic-add-issues-info">
                      <span className="issue-id">
                        {projectKey}-{issue.issueNumber}
                      </span>
                      <span className="epic-add-issues-title">{issue.title}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => handleAddIssue(issue._id)}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="issue-cards">
          {memberIssues === undefined ? (
            <p className="loading">Loading issues...</p>
          ) : memberIssues.length === 0 ? (
            <p className="empty">No issues in this epic yet. Use Add issues to link some.</p>
          ) : (
            memberIssues.map((issue) => (
              <div key={issue._id} className="epic-member-issue">
                <IssueCard
                  issue={issue}
                  projectKey={projectKey}
                  onView={() => onViewIssue(issue)}
                  onDelete={() => handleDeleteIssue(issue._id)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small epic-remove-issue-btn"
                  onClick={() => handleRemoveIssue(issue._id)}
                >
                  Remove from epic
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {isEditing && (
        <EpicForm
          projectId={projectId}
          epic={displayEpic}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
}
