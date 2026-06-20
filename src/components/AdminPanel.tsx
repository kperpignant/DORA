import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatUserLabel } from "../lib/formatUserLabel";

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const users = useQuery(api.admin.listUsers);
  const projects = useQuery(api.admin.listProjectsForAdmin);
  const blockedEmails = useQuery(api.admin.listBlockedEmails);
  const currentUser = useQuery(api.users.current);

  const setRole = useMutation(api.admin.setRole);
  const removeUser = useMutation(api.admin.removeUser);
  const addProjectMember = useMutation(api.admin.addProjectMember);
  const removeProjectMember = useMutation(api.admin.removeProjectMember);
  const unblockEmail = useMutation(api.admin.unblockEmail);

  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "">("");
  const [memberToAdd, setMemberToAdd] = useState<Id<"users"> | "">("");
  const [busy, setBusy] = useState(false);

  const projectMembers = useQuery(
    api.admin.listProjectMembers,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );

  const memberIds = new Set(projectMembers?.map((member) => member._id) ?? []);
  const availableMembers = users?.filter((user) => !memberIds.has(user._id)) ?? [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSetRole = (userId: Id<"users">, role: "admin" | "member") => {
    void run(() => setRole({ userId, role }));
  };

  const handleRemoveUser = (userId: Id<"users">, label: string) => {
    if (!confirm(`Remove ${label}? They will be unassigned from all issues and blocked from signing in again.`)) {
      return;
    }
    void run(() => removeUser({ userId }));
  };

  const handleAddMember = () => {
    if (!selectedProjectId || !memberToAdd) return;
    void run(async () => {
      await addProjectMember({
        projectId: selectedProjectId,
        userId: memberToAdd,
      });
      setMemberToAdd("");
    });
  };

  const handleRemoveMember = (userId: Id<"users">, label: string) => {
    if (!selectedProjectId) return;
    if (!confirm(`Remove ${label} from this project?`)) return;
    void run(() =>
      removeProjectMember({
        projectId: selectedProjectId,
        userId,
      })
    );
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h2>Admin Panel</h2>
          <p className="admin-panel-subtitle">
            Manage user roles, project access, and blocked accounts.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Back to app
        </button>
      </div>

      <section className="admin-section">
        <h3>Users</h3>
        {users === undefined ? (
          <p className="loading">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="empty">No users have signed in yet.</p>
        ) : (
          <div className="admin-table">
            <div className="admin-table-row admin-table-header">
              <span>User</span>
              <span>Role</span>
              <span>Actions</span>
            </div>
            {users.map((user) => {
              const label = formatUserLabel(user);
              const isSelf = currentUser?._id === user._id;
              return (
                <div key={user._id} className="admin-table-row">
                  <span className="admin-user-cell">
                    {user.image ? (
                      <img src={user.image} alt="" className="user-avatar small" />
                    ) : (
                      <div className="user-avatar-placeholder small">
                        {(user.name || user.email || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span>{label}</span>
                  </span>
                  <span>
                    <select
                      className="admin-role-select"
                      value={user.isAdmin ? "admin" : "member"}
                      disabled={busy || isSelf}
                      onChange={(event) =>
                        handleSetRole(user._id, event.target.value as "admin" | "member")
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </span>
                  <span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={busy || isSelf}
                      onClick={() => handleRemoveUser(user._id, label)}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-section">
        <h3>Project access</h3>
        <p className="admin-help">
          Members only see projects they are assigned to. Admins see all projects.
        </p>
        <div className="admin-project-picker">
          <label htmlFor="admin-project-select">Project</label>
          <select
            id="admin-project-select"
            value={selectedProjectId}
            onChange={(event) => {
              setSelectedProjectId(event.target.value as Id<"projects"> | "");
              setMemberToAdd("");
            }}
          >
            <option value="">Select a project...</option>
            {projects?.map((project) => (
              <option key={project._id} value={project._id}>
                {project.key} — {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProjectId && (
          <>
            <div className="admin-add-member">
              <select
                value={memberToAdd}
                onChange={(event) => setMemberToAdd(event.target.value as Id<"users"> | "")}
                disabled={busy || availableMembers.length === 0}
              >
                <option value="">Add member...</option>
                {availableMembers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {formatUserLabel(user)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={busy || !memberToAdd}
                onClick={handleAddMember}
              >
                Add
              </button>
            </div>

            {projectMembers === undefined ? (
              <p className="loading">Loading members...</p>
            ) : projectMembers.length === 0 ? (
              <p className="empty">No members assigned to this project yet.</p>
            ) : (
              <div className="admin-table admin-table-two-col">
                <div className="admin-table-row admin-table-header">
                  <span>Member</span>
                  <span>Actions</span>
                </div>
                {projectMembers.map((member) => {
                  const label = formatUserLabel(member);
                  return (
                    <div key={member._id} className="admin-table-row">
                      <span>{label}</span>
                      <span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={busy}
                          onClick={() => handleRemoveMember(member._id, label)}
                        >
                          Remove from project
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="admin-section">
        <h3>Blocked emails</h3>
        <p className="admin-help">
          Removed users are blocked from signing in again. Unblock to allow re-registration.
        </p>
        {blockedEmails === undefined ? (
          <p className="loading">Loading blocked emails...</p>
        ) : blockedEmails.length === 0 ? (
          <p className="empty">No blocked emails.</p>
        ) : (
          <div className="admin-table">
            <div className="admin-table-row admin-table-header">
              <span>Email</span>
              <span>Blocked at</span>
              <span>Actions</span>
            </div>
            {blockedEmails.map((entry) => (
              <div key={entry._id} className="admin-table-row">
                <span>{entry.email}</span>
                <span>{new Date(entry.blockedAt).toLocaleString()}</span>
                <span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busy}
                    onClick={() =>
                      run(() => unblockEmail({ email: entry.email }))
                    }
                  >
                    Unblock
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
