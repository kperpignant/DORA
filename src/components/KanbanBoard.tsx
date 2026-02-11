import { useMemo } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { UserAvatar } from "./UserAvatar";
import { useDroppable } from "@dnd-kit/core";

type Status = "todo" | "in_progress" | "done";

interface IssueWithAssignee extends Doc<"issues"> {
  assignee?: Doc<"users"> | null;
}

interface KanbanBoardProps {
  projectId: Id<"projects">;
  projectKey: string;
  searchQuery?: string;
  onViewIssue: (issue: IssueWithAssignee) => void;
  onCreateIssue: () => void;
}

const columns: { status: Status; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

function AssigneeDropZone({ userId, name, image }: { userId: Id<"users"> | null; name?: string | null; image?: string | null }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `assignee-${userId || "unassigned"}`,
    data: { type: "assignee", userId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`assignee-drop-zone ${isOver ? "drag-over" : ""}`}
      title={userId ? `Assign to ${name}` : "Unassign"}
    >
      {userId ? (
        <UserAvatar name={name} image={image} size="medium" />
      ) : (
        <div className="user-avatar-placeholder medium">?</div>
      )}
      <span className="assignee-drop-label">{name || "Unassigned"}</span>
    </div>
  );
}

export function KanbanBoard({ projectId, projectKey, searchQuery = "", onViewIssue, onCreateIssue }: KanbanBoardProps) {
  // Use search query if present, otherwise list all issues
  const allIssues = useQuery(api.issues.listByProject, { projectId });
  const searchResults = useQuery(
    api.issues.search,
    searchQuery.trim() ? { projectId, query: searchQuery.trim() } : "skip"
  );
  
  const issues = searchQuery.trim() ? searchResults : allIssues;
  const users = useQuery(api.users.list);
  const updateIssue = useMutation(api.issues.update);
  const clearAssignee = useMutation(api.issues.clearAssignee);

  const [activeIssue, setActiveIssue] = useState<IssueWithAssignee | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const issuesByStatus = useMemo(() => {
    if (!issues) return { todo: [], in_progress: [], done: [] };
    
    return {
      todo: issues.filter((i) => i.status === "todo"),
      in_progress: issues.filter((i) => i.status === "in_progress"),
      done: issues.filter((i) => i.status === "done"),
    };
  }, [issues]);

  const handleDragStart = (event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as IssueWithAssignee;
    if (issue) {
      setActiveIssue(issue);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);

    const { active, over } = event;
    if (!over) return;

    const issue = active.data.current?.issue as IssueWithAssignee;
    if (!issue) return;

    const overId = over.id as string;

    // Check if dropping on a status column
    if (["todo", "in_progress", "done"].includes(overId)) {
      const newStatus = overId as Status;
      if (issue.status !== newStatus) {
        await updateIssue({
          id: issue._id,
          status: newStatus,
        });
      }
      return;
    }

    // Check if dropping on an assignee zone
    if (overId.startsWith("assignee-")) {
      const targetId = overId.replace("assignee-", "");
      
      if (targetId === "unassigned") {
        if (issue.assigneeId) {
          await clearAssignee({ id: issue._id });
        }
      } else {
        const userId = targetId as Id<"users">;
        if (issue.assigneeId !== userId) {
          await updateIssue({
            id: issue._id,
            assigneeId: userId,
          });
        }
      }
    }
  };

  if (issues === undefined) {
    return <div className="loading">Loading...</div>;
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        <div className="kanban-header">
          <h3>
            Kanban Board
            {isSearching && (
              <span className="search-results-count"> ({issues.length} results)</span>
            )}
          </h3>
          <button className="btn btn-primary" onClick={onCreateIssue}>
            + New Issue
          </button>
        </div>

        <div className="kanban-columns">
          {columns.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              title={col.title}
              issues={issuesByStatus[col.status]}
              projectKey={projectKey}
              onViewIssue={onViewIssue}
            />
          ))}
        </div>

        {users && users.length > 0 && (
          <div className="kanban-assignees">
            <h4>Quick Assign (drag issue here)</h4>
            <div className="assignee-drop-zones">
              <AssigneeDropZone userId={null} name="Unassigned" />
              {users.map((user) => (
                <AssigneeDropZone
                  key={user._id}
                  userId={user._id}
                  name={user.name}
                  image={user.image}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeIssue && (
          <KanbanCard
            issue={activeIssue}
            projectKey={projectKey}
            onView={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
