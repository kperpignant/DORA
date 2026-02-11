type Priority = "low" | "medium" | "high";

interface PriorityBadgeProps {
  priority: Priority;
}

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "priority-low" },
  medium: { label: "Medium", className: "priority-medium" },
  high: { label: "High", className: "priority-high" },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
