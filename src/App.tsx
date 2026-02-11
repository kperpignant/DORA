import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Id } from "../convex/_generated/dataModel";
import { ProjectList } from "./components/ProjectList";
import { ProjectView } from "./components/ProjectView";
import { SignIn } from "./components/SignIn";
import { UserMenu } from "./components/UserMenu";
import "./App.css";

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);

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
        <div className="app">
          <header className="app-header">
            <div className="app-header-left">
              <h1>DORA</h1>
              <span className="tagline">Project Management</span>
            </div>
            <UserMenu />
          </header>
          <main className="app-main">
            <aside className="sidebar">
              <ProjectList
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
              />
            </aside>
            <section className="content">
              {selectedProjectId ? (
                <ProjectView projectId={selectedProjectId} />
              ) : (
                <div className="welcome">
                  <h2>Welcome to DORA</h2>
                  <p>Select a project from the sidebar or create a new one to get started.</p>
                </div>
              )}
            </section>
          </main>
        </div>
      </Authenticated>
    </>
  );
}

export default App;
