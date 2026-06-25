import { Doc } from "../../convex/_generated/dataModel";
import { EpicStatusBadge } from "./EpicStatusBadge";

interface EpicWithProgress extends Doc<"epics"> {
  issueCount: number;
  doneCount: number;
}

interface EpicCardProps {
  epic: EpicWithProgress;
  projectKey: string;
  onView: () => void;
}

const DEFAULT_EPIC_COLOR = "#6554c0";

export function EpicCard({ epic, projectKey, onView }: EpicCardProps) {
  const progressPercent =
    epic.issueCount > 0 ? Math.round((epic.doneCount / epic.issueCount) * 100) : 0;
  const accentColor = epic.color || DEFAULT_EPIC_COLOR;

  return (
    <div
      className="epic-card"
      onClick={onView}
      style={{ borderLeftColor: accentColor }}
    >
      <div className="epic-card-header">
        <span className="epic-id">
          {projectKey}-E{epic.epicNumber}
        </span>
        <EpicStatusBadge status={epic.status} />
      </div>
      <h4 className="epic-card-title">{epic.name}</h4>
      {epic.description && (
        <p className="epic-card-description">{epic.description}</p>
      )}
      <div className="epic-progress">
        <div className="epic-progress-label">
          <span>
            {epic.doneCount} of {epic.issueCount} issues done
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
  );
}
