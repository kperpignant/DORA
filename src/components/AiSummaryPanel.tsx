import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { PriorityBadge } from "./PriorityBadge";
import { SeverityBadge } from "./SeverityBadge";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface AiSummaryPanelProps {
  issue: IssueWithAssignee;
}

export function AiSummaryPanel({ issue }: AiSummaryPanelProps) {
  const regenerate = useAction(api.aiSummaries.regenerate);
  const [busy, setBusy] = useState(false);

  const handleRun = async () => {
    setBusy(true);
    try {
      await regenerate({ issueId: issue._id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start AI summary");
    } finally {
      setBusy(false);
    }
  };

  const ai = issue.aiSummary;
  const status = ai?.status;

  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div className="ai-summary-panel">
      <div className="ai-summary-panel-header">
        <h3 className="ai-summary-title">AI triage</h3>
        {ai ? (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleRun}
            disabled={busy || status === "pending" || status === "generating"}
          >
            {busy ? "…" : "Regenerate"}
          </button>
        ) : null}
      </div>

      {!ai && (
        <div className="ai-summary-body">
          <p className="ai-summary-muted">
            No AI analysis yet. Generate one to get severity suggestions, edge
            cases, and fix ideas.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleRun}
            disabled={busy}
          >
            {busy ? "Starting…" : "Generate summary"}
          </button>
        </div>
      )}

      {ai && (status === "pending" || status === "generating") && (
        <div className="ai-summary-body ai-summary-loading">
          <div className="ai-summary-spinner" aria-hidden />
          <p>
            {status === "pending"
              ? "Queued for analysis…"
              : "Analyzing issue…"}
          </p>
        </div>
      )}

      {ai && status === "failed" && (
        <div className="ai-summary-body">
          <p className="ai-summary-error">{ai.errorMessage ?? "Unknown error"}</p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleRun}
            disabled={busy}
          >
            Retry
          </button>
        </div>
      )}

      {ai && status === "complete" && (
        <div className="ai-summary-body">
          <div className="ai-summary-suggestions">
            <div className="ai-summary-row">
              <span className="ai-summary-label">Suggested severity</span>
              {ai.suggestedSeverity ? (
                <div className="ai-summary-badges">
                  <SeverityBadge severity={ai.suggestedSeverity} />
                  {issue.severity && issue.severity !== ai.suggestedSeverity && (
                    <span className="ai-summary-compare">
                      (reporter: <SeverityBadge severity={issue.severity} />)
                    </span>
                  )}
                </div>
              ) : (
                <span className="ai-summary-muted">—</span>
              )}
            </div>
            <div className="ai-summary-row">
              <span className="ai-summary-label">Suggested priority</span>
              {ai.suggestedPriority ? (
                <div className="ai-summary-badges">
                  <PriorityBadge priority={ai.suggestedPriority} />
                  {issue.priority !== ai.suggestedPriority && (
                    <span className="ai-summary-compare">
                      (reporter: <PriorityBadge priority={issue.priority} />)
                    </span>
                  )}
                </div>
              ) : (
                <span className="ai-summary-muted">—</span>
              )}
            </div>
          </div>

          {ai.reasoning && (
            <div className="ai-summary-section">
              <h4>Reasoning</h4>
              <p className="ai-summary-text">{ai.reasoning}</p>
            </div>
          )}

          {ai.edgeCases && ai.edgeCases.length > 0 && (
            <div className="ai-summary-section">
              <h4>Edge cases &amp; regressions to test</h4>
              <ul className="ai-summary-list">
                {ai.edgeCases.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {ai.possibleSolutions && ai.possibleSolutions.length > 0 && (
            <div className="ai-summary-section">
              <h4>Possible solutions</h4>
              <ul className="ai-summary-list">
                {ai.possibleSolutions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="ai-summary-footer">
            {ai.model && <span>Model: {ai.model}</span>}
            {ai.generatedAt != null && (
              <span>Updated {formatTime(ai.generatedAt)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
