import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";

type EpicStatus = "planned" | "in_progress" | "done";

const EPIC_COLORS = [
  "#6554c0",
  "#0052cc",
  "#00875a",
  "#ff5630",
  "#ff991f",
  "#00b8d9",
  "#8777d9",
  "#36b37e",
];

interface EpicFormProps {
  projectId: Id<"projects">;
  epic?: Doc<"epics"> | null;
  onClose: () => void;
}

export function EpicForm({ projectId, epic, onClose }: EpicFormProps) {
  const createEpic = useMutation(api.epics.create);
  const updateEpic = useMutation(api.epics.update);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(EPIC_COLORS[0]);
  const [status, setStatus] = useState<EpicStatus>("planned");

  const isEditing = !!epic;

  useEffect(() => {
    if (epic) {
      setName(epic.name);
      setDescription(epic.description || "");
      setColor(epic.color || EPIC_COLORS[0]);
      setStatus(epic.status);
    }
  }, [epic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (epic) {
      await updateEpic({
        id: epic._id,
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        status,
      });
    } else {
      await createEpic({
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        status,
      });
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? "Edit Epic" : "Create Epic"}</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="epic-name">Name</label>
            <input
              id="epic-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Epic name"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="epic-description">Description</label>
            <textarea
              id="epic-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the feature or initiative..."
              rows={4}
            />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="epic-color-picker">
              {EPIC_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`epic-color-swatch ${color === option ? "selected" : ""}`}
                  style={{ backgroundColor: option }}
                  onClick={() => setColor(option)}
                  title={option}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="epic-status">Status</label>
            <select
              id="epic-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as EpicStatus)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {isEditing ? "Update" : "Create"}
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
