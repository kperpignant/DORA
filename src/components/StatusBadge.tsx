type Status = "todo" | "in_progress" | "done";

interface StatusBadgeProps {
  status: Status;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  todo: { label: "To Do", className: "status-todo" },
  in_progress: { label: "In Progress", className: "status-in-progress" },
  done: { label: "Done", className: "status-done" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
