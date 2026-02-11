import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface AssigneeSelectProps {
  value: Id<"users"> | null;
  onChange: (userId: Id<"users"> | null) => void;
}

export function AssigneeSelect({ value, onChange }: AssigneeSelectProps) {
  const users = useQuery(api.users.list);

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
          {user.name || user.email || "Unknown User"}
        </option>
      ))}
    </select>
  );
}
