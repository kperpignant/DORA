type ViewMode = "list" | "kanban" | "epics";

interface ViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn ${view === "list" ? "active" : ""}`}
        onClick={() => onChange("list")}
        title="List View"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 4h12v1H2V4zm0 3.5h12v1H2v-1zm0 3.5h12v1H2v-1z"/>
        </svg>
        List
      </button>
      <button
        className={`view-toggle-btn ${view === "kanban" ? "active" : ""}`}
        onClick={() => onChange("kanban")}
        title="Kanban Board"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2h3v12H2V2zm4.5 0h3v12h-3V2zM11 2h3v12h-3V2z"/>
        </svg>
        Kanban
      </button>
      <button
        className={`view-toggle-btn ${view === "epics" ? "active" : ""}`}
        onClick={() => onChange("epics")}
        title="Epics"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2h5v5H2V2zm7 0h5v3H9V2zM2 9h5v5H2V9zm7 2h5v3H9v-3z"/>
        </svg>
        Epics
      </button>
    </div>
  );
}
