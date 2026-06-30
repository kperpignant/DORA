import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { UserAvatar } from "./UserAvatar";
import { formatUserLabel } from "../lib/formatUserLabel";

interface CommentsSectionProps {
  issueId: Id<"issues">;
  currentUserId?: Id<"users">;
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
  return new Date(timestamp).toLocaleDateString();
}

export function CommentsSection({ issueId, currentUserId }: CommentsSectionProps) {
  const comments = useQuery(api.comments.listByIssue, { issueId });
  const createComment = useMutation(api.comments.create);
  const removeComment = useMutation(api.comments.remove);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      await createComment({ issueId, body: trimmed });
      setBody("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: Id<"comments">) => {
    if (confirm("Delete this comment?")) {
      await removeComment({ id });
    }
  };

  return (
    <div className="comments-section">
      <form className="comments-form" onSubmit={handleSubmit}>
        <textarea
          className="comments-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
        />
        <button
          type="submit"
          className="btn btn-primary btn-small"
          disabled={submitting || !body.trim()}
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
      </form>

      <div className="comments-list">
        {comments === undefined ? (
          <p className="loading">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="empty-text">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              canDelete={comment.authorId === currentUserId}
              onDelete={() => handleDelete(comment._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
}: {
  comment: Doc<"comments"> & { author: Doc<"users"> | null };
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="comment-item">
      <div className="comment-header">
        <div className="comment-author">
          <UserAvatar
            name={comment.author ? formatUserLabel(comment.author) : "Unknown User"}
            image={comment.author?.image}
            size="small"
          />
          <span className="comment-author-name">
            {comment.author ? formatUserLabel(comment.author) : "Unknown User"}
          </span>
          <span className="comment-time">{formatRelativeTime(comment.createdAt)}</span>
        </div>
        {canDelete && (
          <button
            type="button"
            className="delete-btn small"
            onClick={onDelete}
            title="Delete comment"
          >
            ×
          </button>
        )}
      </div>
      <p className="comment-body">{comment.body}</p>
    </div>
  );
}
