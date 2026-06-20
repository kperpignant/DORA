import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatUserLabel } from "../lib/formatUserLabel";

interface AssigneeSelectProps {
  projectId: Id<"projects">;
  value: Id<"users"> | null;
  onChange: (userId: Id<"users"> | null) => void;
}

export function AssigneeSelect({ projectId, value, onChange }: AssigneeSelectProps) {
  const users = useQuery(api.users.listForProject, { projectId });

  if (users === undefined) {
    return (
      <select disabled className="assignee-select">
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      className="assignee-select"
      value={value || ""}
      onChange={(e) => {
        const selectedId = e.target.value;
        onChange(selectedId ? (selectedId as Id<"users">) : null);
      }}
    >
      <option value="">Unassigned</option>
      {users.map((user) => (
        <option key={user._id} value={user._id}>
          {formatUserLabel(user)}
        </option>
      ))}
    </select>
  );
}
