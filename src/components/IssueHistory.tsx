import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { StatusBadge } from "./StatusBadge";
import { UserAvatar } from "./UserAvatar";
import { formatUserLabel } from "../lib/formatUserLabel";

interface IssueHistoryProps {
  issueId: Id<"issues">;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleString();
}

export function IssueHistory({ issueId }: IssueHistoryProps) {
  const history = useQuery(api.issues.listHistory, { issueId });

  if (history === undefined) {
    return <p className="loading">Loading history...</p>;
  }

  if (history.length === 0) {
    return <p className="empty-text">No status changes recorded yet.</p>;
  }

  return (
    <ol className="issue-history-timeline">
      {history.map((entry) => (
        <HistoryEntry key={entry._id} entry={entry} />
      ))}
    </ol>
  );
}

function HistoryEntry({
  entry,
}: {
  entry: Doc<"issueHistory"> & { user: Doc<"users"> | null };
}) {
  return (
    <li className="issue-history-entry">
      <div className="issue-history-header">
        <div className="issue-history-statuses">
          {entry.fromStatus ? (
            <>
              <StatusBadge status={entry.fromStatus} />
              <span className="issue-history-arrow">→</span>
              <StatusBadge status={entry.toStatus} />
            </>
          ) : (
            <>
              <span className="issue-history-created">Created as</span>
              <StatusBadge status={entry.toStatus} />
            </>
          )}
        </div>
        <span className="issue-history-time">
          {formatRelativeTime(entry.createdAt)}
        </span>
      </div>
      <div className="issue-history-meta">
        {entry.user ? (
          <UserAvatar
            name={formatUserLabel(entry.user)}
            image={entry.user.image}
            size="small"
            showName
          />
        ) : (
          <span className="empty-text">System</span>
        )}
      </div>
      {entry.note && (
        <p className="issue-history-note">{entry.note}</p>
      )}
    </li>
  );
}
