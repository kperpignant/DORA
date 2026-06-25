type EpicStatus = "planned" | "in_progress" | "done";

interface EpicStatusBadgeProps {
  status: EpicStatus;
}

const statusConfig: Record<EpicStatus, { label: string; className: string }> = {
  planned: { label: "Planned", className: "epic-status-planned" },
  in_progress: { label: "In Progress", className: "epic-status-in-progress" },
  done: { label: "Done", className: "epic-status-done" },
};

export function EpicStatusBadge({ status }: EpicStatusBadgeProps) {
  const config = statusConfig[status];
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
