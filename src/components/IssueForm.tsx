import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { AssigneeSelect } from "./AssigneeSelect";
import { TagInput } from "./TagInput";

type IssueType = "task" | "bug";
type Status = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";
type Severity = "critical" | "major" | "minor" | "trivial";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface IssueFormProps {
  projectId: Id<"projects">;
  issue?: IssueWithAssignee | null;
  onClose: () => void;
}

export function IssueForm({ projectId, issue, onClose }: IssueFormProps) {
  const createIssue = useMutation(api.issues.create);
  const updateIssue = useMutation(api.issues.update);
  const clearAssignee = useMutation(api.issues.clearAssignee);

  const [type, setType] = useState<IssueType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [estimate, setEstimate] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [severity, setSeverity] = useState<Severity>("major");
  const [tags, setTags] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState<Id<"users"> | null>(null);
  const [codeLog, setCodeLog] = useState("");

  const isEditing = !!issue;

  useEffect(() => {
    if (issue) {
      setType(issue.type);
      setTitle(issue.title);
      setDescription(issue.description);
      setStatus(issue.status);
      setPriority(issue.priority);
      setEstimate(issue.estimate || "");
      setStepsToReproduce(issue.stepsToReproduce || "");
      setExpectedResult(issue.expectedResult || "");
      setActualResult(issue.actualResult || "");
      setSeverity(issue.severity || "major");
      setTags(issue.tags || []);
      setAssigneeId(issue.assigneeId || null);
      setCodeLog(issue.codeLog || "");
    }
  }, [issue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (issue) {
      // If clearing assignee, call separate mutation
      if (!assigneeId && issue.assigneeId) {
        await clearAssignee({ id: issue._id });
      }
      
      await updateIssue({
        id: issue._id,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        estimate: type === "task" ? estimate.trim() || undefined : undefined,
        stepsToReproduce: type === "bug" ? stepsToReproduce.trim() || undefined : undefined,
        expectedResult: type === "bug" ? expectedResult.trim() || undefined : undefined,
        actualResult: type === "bug" ? actualResult.trim() || undefined : undefined,
        severity: type === "bug" ? severity : undefined,
        tags: tags.length > 0 ? tags : undefined,
        assigneeId: assigneeId || undefined,
        codeLog: codeLog.trim() || undefined,
      });
    } else {
      await createIssue({
        projectId,
        type,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        estimate: type === "task" ? estimate.trim() || undefined : undefined,
        stepsToReproduce: type === "bug" ? stepsToReproduce.trim() || undefined : undefined,
        expectedResult: type === "bug" ? expectedResult.trim() || undefined : undefined,
        actualResult: type === "bug" ? actualResult.trim() || undefined : undefined,
        severity: type === "bug" ? severity : undefined,
        tags: tags.length > 0 ? tags : undefined,
        assigneeId: assigneeId || undefined,
        codeLog: codeLog.trim() || undefined,
      });
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? "Edit Issue" : "Create Issue"}</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {!isEditing && (
            <div className="form-group">
              <label htmlFor="type">Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as IssueType)}
              >
                <option value="task">Task</option>
                <option value="bug">Bug</option>
              </select>
            </div>
          )}
          {isEditing && (
            <div className="form-group">
              <label>Type</label>
              <div className="type-display">
                {type === "task" ? "✓ Task" : "🐛 Bug"}
              </div>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="codeLog">Code / Logs</label>
            <textarea
              id="codeLog"
              className="code-log-input"
              value={codeLog}
              onChange={(e) => setCodeLog(e.target.value)}
              placeholder="Paste stack traces, error logs, or code snippets..."
              rows={6}
              spellCheck={false}
            />
          </div>

          {/* Type-specific fields */}
          {type === "task" && (
            <div className="form-group">
              <label htmlFor="estimate">Estimate</label>
              <input
                id="estimate"
                type="text"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="e.g., 2h, 1d, 3 points"
              />
            </div>
          )}
          {type === "bug" && (
            <>
              <div className="form-group">
                <label htmlFor="severity">Severity</label>
                <select
                  id="severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="trivial">Trivial</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="stepsToReproduce">Steps to Reproduce</label>
                <textarea
                  id="stepsToReproduce"
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label htmlFor="expectedResult">Expected result</label>
                <textarea
                  id="expectedResult"
                  value={expectedResult}
                  onChange={(e) => setExpectedResult(e.target.value)}
                  placeholder="What should have happened"
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label htmlFor="actualResult">Actual result</label>
                <textarea
                  id="actualResult"
                  value={actualResult}
                  onChange={(e) => setActualResult(e.target.value)}
                  placeholder="What happened instead"
                  rows={2}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Tags</label>
            <TagInput tags={tags} onChange={setTags} placeholder="Press Enter to add tags" />
          </div>

          <div className="form-group">
            <label htmlFor="assignee">Assignee</label>
            <AssigneeSelect projectId={projectId} value={assigneeId} onChange={setAssigneeId} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
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
