export type IssueStatus = "todo" | "in_progress" | "blocked" | "done";

export function getStatusChangeVariant(
  from: IssueStatus,
  to: IssueStatus
): "done" | "reopen" | null {
  if (to === "done" && from !== "done") return "done";
  if (from === "done" && to !== "done") return "reopen";
  return null;
}
