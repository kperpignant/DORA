import { Doc } from "../../convex/_generated/dataModel";

const DEFAULT_EPIC_COLOR = "#6554c0";

interface EpicBadgeProps {
  epic: Pick<Doc<"epics">, "_id" | "name" | "color" | "epicNumber">;
  projectKey: string;
}

export function EpicBadge({ epic, projectKey }: EpicBadgeProps) {
  const accentColor = epic.color || DEFAULT_EPIC_COLOR;

  return (
    <span
      className="epic-badge"
      style={{ borderColor: accentColor, color: accentColor }}
      title={epic.name}
    >
      {projectKey}-E{epic.epicNumber}
    </span>
  );
}
