type Status = "todo" | "in_progress" | "blocked" | "done";

interface StatusBadgeProps {
  status: Status;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  todo: { label: "To Do", className: "status-todo" },
  in_progress: { label: "In Progress", className: "status-in-progress" },
  blocked: { label: "Blocked", className: "status-blocked" },
  done: { label: "Done", className: "status-done" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
