interface TagBadgeProps {
  tag: string;
  onRemove?: () => void;
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <span className="tag-badge">
      {tag}
      {onRemove && (
        <button
          type="button"
          className="tag-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
