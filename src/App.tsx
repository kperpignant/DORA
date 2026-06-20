import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { AdminPanel } from "./components/AdminPanel";
import { ProjectList } from "./components/ProjectList";
import { ProjectView } from "./components/ProjectView";
import { SignIn } from "./components/SignIn";
import { UserMenu } from "./components/UserMenu";
import "./App.css";

function AuthenticatedApp() {
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);

  if (user === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Checking access...</p>
      </div>
    );
  }

  if (!user?.isAllowed) {
    return (
      <div className="sign-in-page">
        <div className="sign-in-container">
          <div className="sign-in-header">
            <h1>DORA</h1>
            <p>Project Management</p>
          </div>
          <div className="sign-in-content">
            <h2>Access restricted</h2>
            <p className="auth-message">
              This Google account is not on the DORA allowlist.
            </p>
            <button className="btn btn-google" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1>DORA</h1>
          <span className="tagline">Project Management</span>
        </div>
        <div className="app-header-right">
          {user.isAdmin && (
            <button
              type="button"
              className={`btn btn-secondary btn-small ${showAdminPanel ? "active" : ""}`}
              onClick={() => setShowAdminPanel((open) => !open)}
            >
              {showAdminPanel ? "Close Admin" : "Admin"}
            </button>
          )}
          <UserMenu />
        </div>
      </header>
      <main className="app-main">
        {showAdminPanel ? (
          <section className="content content-full">
            <AdminPanel onClose={() => setShowAdminPanel(false)} />
          </section>
        ) : (
          <>
            <aside className="sidebar">
              <ProjectList
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                isAdmin={user.isAdmin}
              />
            </aside>
            <section className="content">
              {selectedProjectId ? (
                <ProjectView projectId={selectedProjectId} />
              ) : (
                <div className="welcome">
                  <h2>Welcome to DORA</h2>
                  <p>
                    {user.isAdmin
                      ? "Select a project from the sidebar or create a new one to get started."
                      : "Select a project from the sidebar. Ask an admin if you need access to a project."}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <>
      <AuthLoading>
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </AuthLoading>

      <Unauthenticated>
        <SignIn />
      </Unauthenticated>

      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
    </>
  );
}

export default App;
