import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { PriorityBadge } from "./PriorityBadge";
import { SeverityBadge } from "./SeverityBadge";
import { StatusBadge } from "./StatusBadge";
import { UserAvatar } from "./UserAvatar";
import { TagBadge } from "./TagBadge";
import { formatUserLabel } from "../lib/formatUserLabel";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface AiSummaryPanelProps {
  issue: IssueWithAssignee;
}

export function AiSummaryPanel({ issue }: AiSummaryPanelProps) {
  const regenerate = useAction(api.aiSummaries.regenerate);
  const applySeverity = useMutation(api.aiSummaries.applySuggestedSeverity);
  const applyPriority = useMutation(api.aiSummaries.applySuggestedPriority);
  const applyAssignee = useMutation(api.aiSummaries.applySuggestedAssignee);
  const applyTags = useMutation(api.aiSummaries.applySuggestedTags);
  const applyAll = useMutation(api.aiSummaries.applyAllSuggestions);
  const users = useQuery(api.users.listForProject, { projectId: issue.projectId });

  const [busy, setBusy] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const userById = useMemo(() => {
    const map = new Map<string, Doc<"users">>();
    for (const u of users ?? []) map.set(u._id, u);
    return map;
  }, [users]);

  const handleRun = async () => {
    setBusy(true);
    try {
      await regenerate({ issueId: issue._id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start AI agent");
    } finally {
      setBusy(false);
    }
  };

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const ai = issue.aiSummary;
  const status = ai?.status;
  const isBug = issue.type === "bug";
  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  const suggestedAssignee = ai?.suggestedAssigneeId
    ? userById.get(ai.suggestedAssigneeId as Id<"users">)
    : null;

  const severityDiffers =
    isBug && ai?.suggestedSeverity && issue.severity !== ai.suggestedSeverity;
  const priorityDiffers =
    ai?.suggestedPriority && issue.priority !== ai.suggestedPriority;
  const assigneeDiffers =
    ai?.suggestedAssigneeId && issue.assigneeId !== ai.suggestedAssigneeId;
  const existingTags = new Set(issue.tags ?? []);
  const tagsDiffers =
    ai?.suggestedTags &&
    ai.suggestedTags.some((tag) => !existingTags.has(tag));
  const anyDiff = severityDiffers || priorityDiffers || assigneeDiffers || tagsDiffers;

  const liveSteps = ai?.steps ?? [];

  return (
    <div className="ai-summary-panel">
      <div className="ai-summary-panel-header">
        <h3 className="ai-summary-title">AI triage agent</h3>
        {ai ? (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleRun}
            disabled={busy || status === "pending" || status === "generating"}
          >
            {busy ? "…" : "Re-run"}
          </button>
        ) : null}
      </div>

      {!ai && (
        <div className="ai-summary-body">
          <p className="ai-summary-muted">
            {isBug
              ? "Run the agent to get a triage decision, similar past issues (RAG), a suggested assignee, and concrete fix ideas."
              : "Run the agent to find related bugs, a suggested assignee, and tags for this task."}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleRun}
            disabled={busy}
          >
            {busy ? "Starting…" : "Run agent"}
          </button>
        </div>
      )}

      {ai && (status === "pending" || status === "generating") && (
        <div className="ai-summary-body">
          <div className="ai-summary-loading">
            <div className="ai-summary-spinner" aria-hidden />
            <p>
              {status === "pending"
                ? "Queued…"
                : `Agent thinking… (${liveSteps.length} steps)`}
            </p>
          </div>
          {liveSteps.length > 0 && (
            <ol className="ai-trace ai-trace-live">
              {liveSteps.slice(-4).map((s, i) => (
                <li key={i} className={`ai-trace-step ai-trace-${s.kind}`}>
                  <span className="ai-trace-tool">
                    {s.kind === "tool_call"
                      ? `→ ${s.tool}`
                      : s.kind === "tool_result"
                      ? `← ${s.tool}`
                      : s.kind}
                  </span>
                </li>
              ))}
            </ol>
          )}
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
          {anyDiff && (
            <div className="ai-suggestion-banner">
              <span>
                The agent suggests changes that differ from what is set on this
                issue.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => guard(() => applyAll({ issueId: issue._id }))}
                disabled={busy}
              >
                Apply all
              </button>
            </div>
          )}

          <div className="ai-summary-suggestions">
            <p className="ai-summary-apply-hint">
              Use <strong>Apply</strong> (or <strong>Apply all</strong> above) to
              copy the agent&rsquo;s values onto the issue.
            </p>
            {isBug && (
            <div className="ai-summary-row">
              <span className="ai-summary-label">Suggested severity</span>
              {ai.suggestedSeverity ? (
                <div className="ai-summary-badges">
                  <SeverityBadge severity={ai.suggestedSeverity} />
                  {issue.severity ? (
                    <span className="ai-summary-compare">
                      (on issue: <SeverityBadge severity={issue.severity} />)
                    </span>
                  ) : (
                    <span className="ai-summary-compare">
                      (on issue: <span className="ai-summary-muted">none</span>)
                    </span>
                  )}
                  {severityDiffers ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-tiny"
                      onClick={() =>
                        guard(() => applySeverity({ issueId: issue._id }))
                      }
                      disabled={busy}
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="ai-summary-synced" title="Issue already has this value">
                      On issue
                    </span>
                  )}
                </div>
              ) : (
                <span className="ai-summary-muted">—</span>
              )}
            </div>
            )}

            {isBug && (
            <div className="ai-summary-row">
              <span className="ai-summary-label">Suggested priority</span>
              {ai.suggestedPriority ? (
                <div className="ai-summary-badges">
                  <PriorityBadge priority={ai.suggestedPriority} />
                  <span className="ai-summary-compare">
                    (on issue: <PriorityBadge priority={issue.priority} />)
                  </span>
                  {priorityDiffers ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-tiny"
                      onClick={() =>
                        guard(() => applyPriority({ issueId: issue._id }))
                      }
                      disabled={busy}
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="ai-summary-synced" title="Issue already has this value">
                      On issue
                    </span>
                  )}
                </div>
              ) : (
                <span className="ai-summary-muted">—</span>
              )}
            </div>
            )}

            {suggestedAssignee && (
              <div className="ai-summary-row">
                <span className="ai-summary-label">Suggested assignee</span>
                <div className="ai-summary-badges">
                  <UserAvatar
                    name={formatUserLabel(suggestedAssignee)}
                    image={suggestedAssignee.image}
                    size="small"
                    showName
                  />
                  {assigneeDiffers ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-tiny"
                      onClick={() =>
                        guard(() => applyAssignee({ issueId: issue._id }))
                      }
                      disabled={busy}
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="ai-summary-synced" title="Issue already has this assignee">
                      On issue
                    </span>
                  )}
                </div>
                {ai.suggestedAssigneeReason && (
                  <p className="ai-summary-assignee-reason">
                    {ai.suggestedAssigneeReason}
                  </p>
                )}
              </div>
            )}

            {ai.suggestedTags && ai.suggestedTags.length > 0 && (
              <div className="ai-summary-row">
                <span className="ai-summary-label">Suggested tags</span>
                <div className="ai-summary-badges">
                  {ai.suggestedTags.map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                  {tagsDiffers ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-tiny"
                      onClick={() =>
                        guard(() => applyTags({ issueId: issue._id }))
                      }
                      disabled={busy}
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="ai-summary-synced" title="Issue already has these tags">
                      On issue
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {ai.similarIssues && ai.similarIssues.length > 0 && (
            <div className="ai-summary-section">
              <h4>{isBug ? "Similar past issues (RAG)" : "Related bugs (RAG)"}</h4>
              <ul className="ai-similar-list">
                {ai.similarIssues.map((s) => (
                  <li key={s.issueId} className="ai-similar-item">
                    <div className="ai-similar-top">
                      <span className="ai-similar-num">#{s.issueNumber}</span>
                      <span className="ai-similar-title">{s.title}</span>
                    </div>
                    <div className="ai-similar-meta">
                      <StatusBadge status={s.status} />
                      <span className="ai-similar-sim">
                        {(s.similarity * 100).toFixed(0)}% match
                      </span>
                      {s.relation && (
                        <span
                          className={`ai-similar-relation ai-similar-relation-${s.relation}`}
                        >
                          {s.relation}
                        </span>
                      )}
                    </div>
                    {s.note && (
                      <p className="ai-similar-note">{s.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

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

          {liveSteps.length > 0 && (
            <div className="ai-summary-section">
              <button
                type="button"
                className="ai-trace-toggle"
                onClick={() => setShowTrace((v) => !v)}
              >
                {showTrace ? "Hide" : "Show"} agent trace ({liveSteps.length}{" "}
                steps)
              </button>
              {showTrace && (
                <ol className="ai-trace">
                  {liveSteps.map((s, i) => (
                    <li
                      key={i}
                      className={`ai-trace-step ai-trace-${s.kind}`}
                    >
                      <div className="ai-trace-step-head">
                        <span className="ai-trace-tool">
                          {s.kind === "tool_call"
                            ? `→ ${s.tool}`
                            : s.kind === "tool_result"
                            ? `← ${s.tool}`
                            : s.kind}
                        </span>
                        <span className="ai-trace-time">
                          {new Date(s.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {s.input && (
                        <pre className="ai-trace-payload">{s.input}</pre>
                      )}
                      {s.output && (
                        <pre className="ai-trace-payload">{s.output}</pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="ai-summary-footer">
            {ai.model && <span>Model: {ai.model}</span>}
            {ai.latencyMs != null && (
              <span>Took {(ai.latencyMs / 1000).toFixed(1)}s</span>
            )}
            {(ai.tokensIn != null || ai.tokensOut != null) && (
              <span>
                Tokens: {ai.tokensIn ?? 0} in / {ai.tokensOut ?? 0} out
              </span>
            )}
            {ai.generatedAt != null && (
              <span>Updated {formatTime(ai.generatedAt)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
