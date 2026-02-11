import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectCard } from "./ProjectCard";

interface ProjectListProps {
  selectedProjectId: Id<"projects"> | null;
  onSelectProject: (id: Id<"projects"> | null) => void;
}

export function ProjectList({ selectedProjectId, onSelectProject }: ProjectListProps) {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const deleteProject = useMutation(api.projects.remove);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newKey.trim()) return;

    try {
      await createProject({
        name: newName.trim(),
        key: newKey.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewName("");
      setNewKey("");
      setNewDescription("");
      setIsCreating(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create project");
    }
  };

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
        <form className="create-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Project Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Key (e.g., DORA)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            maxLength={10}
          />
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Create
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
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
