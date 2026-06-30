import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { IssueCard } from "./IssueCard";
import { formatUserLabel } from "../lib/formatUserLabel";

type SortField = "priority" | "status" | "createdAt";
type SortOrder = "asc" | "desc";
type AssigneeFilter = "all" | "unassigned" | Id<"users">;

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
  epic?: Doc<"epics"> | null;
}

interface IssueListProps {
  projectId: Id<"projects">;
  projectKey: string;
  searchQuery?: string;
  onViewIssue: (issue: IssueWithAssignee) => void;
  onCreateIssue: () => void;
  lockedAssigneeId?: Id<"users">;
  title?: string;
}

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
const statusOrder: Record<string, number> = { todo: 0, in_progress: 1, blocked: 2, done: 3 };

export function IssueList({ projectId, projectKey, searchQuery = "", onViewIssue, onCreateIssue, lockedAssigneeId, title = "Issues" }: IssueListProps) {
  // Use search query if present, otherwise list all issues
  const allIssues = useQuery(api.issues.listByProject, { projectId });
  const searchResults = useQuery(
    api.issues.search,
    searchQuery.trim() ? { projectId, query: searchQuery.trim() } : "skip"
  );
  const users = useQuery(api.users.listForProject, { projectId });
  
  const issues = searchQuery.trim() ? searchResults : allIssues;
  const deleteIssue = useMutation(api.issues.remove);

  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>(
    lockedAssigneeId ?? "all"
  );

  const filteredIssues = useMemo(() => {
    if (!issues) return [];

    const effectiveFilter = lockedAssigneeId ?? assigneeFilter;
    if (effectiveFilter === "all") return issues;
    if (effectiveFilter === "unassigned") {
      return issues.filter((i) => !i.assigneeId);
    }
    return issues.filter((i) => i.assigneeId === effectiveFilter);
  }, [issues, assigneeFilter, lockedAssigneeId]);

  const sortedIssues = useMemo(() => {
    if (!filteredIssues.length) return [];
    
    return [...filteredIssues].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "priority":
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
          break;
        case "status":
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
        case "createdAt":
          comparison = a.createdAt - b.createdAt;
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredIssues, sortField, sortOrder]);

  const handleDelete = async (id: Id<"issues">) => {
    if (confirm("Are you sure you want to delete this issue?")) {
      await deleteIssue({ id });
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="issue-list">
      <div className="issue-list-header">
        <h3>
          {title}
          {isSearching && issues && (
            <span className="search-results-count"> ({filteredIssues.length} results)</span>
          )}
        </h3>
        <div className="issue-list-controls">
          <div className="sort-controls">
            {!lockedAssigneeId && (
              <select
                className="sort-select"
                value={assigneeFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setAssigneeFilter(
                    val === "all" || val === "unassigned"
                      ? val
                      : (val as Id<"users">)
                  );
                }}
                title="Filter by assignee"
              >
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {users?.map((user) => (
                  <option key={user._id} value={user._id}>
                    {formatUserLabel(user)}
                  </option>
                ))}
              </select>
            )}
            <select
              className="sort-select"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              title="Sort by"
            >
              <option value="createdAt">Date</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
            <select
              className="sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              title="Sort order"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={onCreateIssue}>
            + New Issue
          </button>
        </div>
      </div>

      <div className="issue-cards">
        {issues === undefined ? (
          <p className="loading">Loading issues...</p>
        ) : issues.length === 0 ? (
          <p className="empty">
            {isSearching 
              ? "No issues match your search." 
              : "No issues yet. Create one to get started!"}
          </p>
        ) : sortedIssues.length === 0 ? (
          <p className="empty">No issues match the current filters.</p>
        ) : (
          sortedIssues.map((issue) => (
            <IssueCard
              key={issue._id}
              issue={issue}
              projectKey={projectKey}
              onView={() => onViewIssue(issue)}
              onDelete={() => handleDelete(issue._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
