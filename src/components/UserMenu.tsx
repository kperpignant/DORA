import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function UserMenu() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);

  if (!user) return null;

  return (
    <div className="user-menu">
      <div className="user-info">
        {user.image ? (
          <img src={user.image} alt={user.name || "User"} className="user-avatar" />
        ) : (
          <div className="user-avatar-placeholder">
            {(user.name || user.email || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <span className="user-name">{user.name || user.email}</span>
      </div>
      <button className="btn btn-secondary btn-small" onClick={() => signOut()}>
        Sign Out
      </button>
    </div>
  );
}
