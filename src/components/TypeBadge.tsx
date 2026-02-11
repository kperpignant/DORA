type IssueType = "task" | "bug";

interface TypeBadgeProps {
  type: IssueType;
}

const typeConfig: Record<IssueType, { label: string; className: string; icon: string }> = {
  task: { label: "Task", className: "type-task", icon: "✓" },
  bug: { label: "Bug", className: "type-bug", icon: "🐛" },
};

export function TypeBadge({ type }: TypeBadgeProps) {
  const config = typeConfig[type];
  return (
    <span className={`badge type-badge ${config.className}`}>
      <span className="type-icon">{config.icon}</span>
      {config.label}
    </span>
  );
}
