import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectCard } from "./ProjectCard";
import { ProjectSettingsForm } from "./ProjectSettingsForm";

interface ProjectListProps {
  selectedProjectId: Id<"projects"> | null;
  onSelectProject: (id: Id<"projects"> | null) => void;
}

export function ProjectList({ selectedProjectId, onSelectProject }: ProjectListProps) {
  const projects = useQuery(api.projects.list);
  const deleteProject = useMutation(api.projects.remove);

  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = async (id: Id<"projects">) => {
    if (confirm("Are you sure you want to delete this project and all its issues?")) {
      await deleteProject({ id });
      if (selectedProjectId === id) {
        onSelectProject(null);
      }
    }
  };

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
          + New
        </button>
      </div>

      {isCreating && (
        <ProjectSettingsForm
          mode="create"
          onClose={() => setIsCreating(false)}
        />
      )}

      <div className="project-cards">
        {projects === undefined ? (
          <p className="loading">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="empty">No projects yet. Create one to get started!</p>
        ) : (
          projects.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              isSelected={selectedProjectId === project._id}
              onSelect={() => onSelectProject(project._id)}
              onDelete={() => handleDelete(project._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
