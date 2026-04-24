import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

type Mode = "create" | "edit";

interface ProjectSettingsFormProps {
  mode: Mode;
  project?: Doc<"projects"> | null;
  onClose: () => void;
}

export function ProjectSettingsForm({
  mode,
  project,
  onClose,
}: ProjectSettingsFormProps) {
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [keyFeatures, setKeyFeatures] = useState("");
  const [knownConstraints, setKnownConstraints] = useState("");
  const [glossary, setGlossary] = useState("");

  useEffect(() => {
    if (mode === "edit" && project) {
      setName(project.name);
      setKey(project.key);
      setDescription(project.description ?? "");
      const s = project.summary;
      setTechStack(s?.techStack ?? "");
      setTargetUsers(s?.targetUsers ?? "");
      setKeyFeatures(s?.keyFeatures ?? "");
      setKnownConstraints(s?.knownConstraints ?? "");
      setGlossary(s?.glossary ?? "");
    }
  }, [mode, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (mode === "create" && !key.trim()) return;

    const summaryPayload = {
      techStack: techStack.trim() || undefined,
      targetUsers: targetUsers.trim() || undefined,
      keyFeatures: keyFeatures.trim() || undefined,
      knownConstraints: knownConstraints.trim() || undefined,
      glossary: glossary.trim() || undefined,
    };
    const hasAnySummaryField =
      !!summaryPayload.techStack ||
      !!summaryPayload.targetUsers ||
      !!summaryPayload.keyFeatures ||
      !!summaryPayload.knownConstraints ||
      !!summaryPayload.glossary;

    try {
      if (mode === "create") {
        await createProject({
          name: name.trim(),
          key: key.trim(),
          description: description.trim() || undefined,
          summary: hasAnySummaryField ? summaryPayload : undefined,
        });
      } else if (project) {
        await updateProject({
          id: project._id,
          name: name.trim(),
          description: description.trim() || undefined,
          summary: summaryPayload,
        });
      }
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save project");
    }
  };

  const title =
    mode === "create" ? "New project" : "Project settings";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide project-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="proj-name">Name</label>
            <input
              id="proj-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
              autoFocus
            />
          </div>
          {mode === "create" ? (
            <div className="form-group">
              <label htmlFor="proj-key">Key</label>
              <input
                id="proj-key"
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="e.g. DORA"
                maxLength={10}
                required
              />
            </div>
          ) : (
            <div className="form-group">
              <label>Key</label>
              <div className="type-display">{key}</div>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="proj-desc">Description</label>
            <textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short project description..."
              rows={3}
            />
          </div>

          <div className="form-section-title">Project summary (for AI bug triage)</div>
          <p className="form-hint">
            This context is sent to the AI when summarizing bugs in this project.
          </p>
          <div className="form-group">
            <label htmlFor="proj-tech">Tech stack</label>
            <textarea
              id="proj-tech"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              placeholder="Languages, frameworks, infra..."
              rows={2}
            />
          </div>
          <div className="form-group">
            <label htmlFor="proj-users">Target users</label>
            <textarea
              id="proj-users"
              value={targetUsers}
              onChange={(e) => setTargetUsers(e.target.value)}
              placeholder="Who uses this product?"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label htmlFor="proj-features">Key features / scope</label>
            <textarea
              id="proj-features"
              value={keyFeatures}
              onChange={(e) => setKeyFeatures(e.target.value)}
              placeholder="Main modules or areas of the codebase..."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label htmlFor="proj-constraints">Known constraints</label>
            <textarea
              id="proj-constraints"
              value={knownConstraints}
              onChange={(e) => setKnownConstraints(e.target.value)}
              placeholder="SLAs, compliance, legacy systems..."
              rows={2}
            />
          </div>
          <div className="form-group">
            <label htmlFor="proj-glossary">Glossary / notes</label>
            <textarea
              id="proj-glossary"
              value={glossary}
              onChange={(e) => setGlossary(e.target.value)}
              placeholder="Terms, acronyms, links to docs..."
              rows={2}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {mode === "create" ? "Create" : "Save"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
