import { Doc } from "../../convex/_generated/dataModel";

interface ProjectCardProps {
  project: Doc<"projects">;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

export function ProjectCard({ project, isSelected, onSelect, onDelete }: ProjectCardProps) {
  return (
    <div
      className={`project-card ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="project-card-header">
        <span className="project-key">{project.key}</span>
        {onDelete && (
          <button
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete project"
          >
            ×
          </button>
        )}
      </div>
      <h3 className="project-name">{project.name}</h3>
      {project.description && (
        <p className="project-description">{project.description}</p>
      )}
    </div>
  );
}
