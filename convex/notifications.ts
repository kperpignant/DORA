import { v } from "convex/values";
import {
  internalAction,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const CODE_LOG_MAX_CHARS = 2000;

function formatUserLabel(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} — ${email}`;
  return name || email || "Unknown User";
}

function truncateCodeLog(codeLog: string): string {
  if (codeLog.length <= CODE_LOG_MAX_CHARS) return codeLog;
  return `${codeLog.slice(0, CODE_LOG_MAX_CHARS)}\n\n… (truncated — see full log in DORA)`;
}

export function buildAssignmentEmailText(args: {
  issue: Doc<"issues">;
  project: Doc<"projects">;
  assigner: Doc<"users"> | null;
  appUrl: string;
}): { subject: string; text: string } {
  const { issue, project, assigner, appUrl } = args;
  const issueKey = `${project.key}-${issue.issueNumber}`;
  const lines: string[] = [
    `You've been assigned ${issueKey} in ${project.name}.`,
    "",
    `Type: ${issue.type}`,
    `Status: ${issue.status}`,
    `Priority: ${issue.priority}`,
  ];

  if (issue.type === "bug") {
    if (issue.severity) lines.push(`Severity: ${issue.severity}`);
    if (issue.stepsToReproduce?.trim()) {
      lines.push("", "Steps to reproduce:", issue.stepsToReproduce.trim());
    }
    if (issue.expectedResult?.trim()) {
      lines.push("", "Expected result:", issue.expectedResult.trim());
    }
    if (issue.actualResult?.trim()) {
      lines.push("", "Actual result:", issue.actualResult.trim());
    }
  }

  if (issue.type === "task" && issue.estimate?.trim()) {
    lines.push(`Estimate: ${issue.estimate.trim()}`);
  }

  lines.push("", "Description:", issue.description.trim() || "(none)");

  if (issue.tags && issue.tags.length > 0) {
    lines.push("", `Tags: ${issue.tags.join(", ")}`);
  }

  if (issue.codeLog?.trim()) {
    lines.push("", "Code / logs:", truncateCodeLog(issue.codeLog.trim()));
  }

  lines.push(
    "",
    `Assigned by: ${assigner ? formatUserLabel(assigner) : "Unknown"}`,
    "",
    `Open DORA: ${appUrl}`,
    `Look for issue ${issueKey} in project ${project.key}.`
  );

  return {
    subject: `[${issueKey}] You've been assigned: ${issue.title}`,
    text: lines.join("\n"),
  };
}

/** Schedule an assignment email when the assignee changes. No-op if skipped. */
export async function scheduleAssignmentEmail(
  ctx: MutationCtx,
  args: {
    issueId: Id<"issues">;
    assigneeId: Id<"users"> | undefined;
    assignedByUserId: Id<"users">;
    previousAssigneeId?: Id<"users">;
  }
): Promise<void> {
  const { issueId, assigneeId, assignedByUserId, previousAssigneeId } = args;
  if (!assigneeId) return;
  if (assigneeId === previousAssigneeId) return;
  if (assigneeId === assignedByUserId) return;

  await ctx.scheduler.runAfter(0, internal.notifications.sendAssignmentEmail, {
    issueId,
    assigneeId,
    assignedByUserId,
  });
}

export const getAssignmentEmailContext = internalQuery({
  args: {
    issueId: v.id("issues"),
    assigneeId: v.id("users"),
    assignedByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return null;

    const project = await ctx.db.get(issue.projectId);
    if (!project) return null;

    const assignee = await ctx.db.get(args.assigneeId);
    if (!assignee?.email?.trim()) return null;

    const assigner = await ctx.db.get(args.assignedByUserId);
    return { issue, project, assignee, assigner };
  },
});

export const sendAssignmentEmail = internalAction({
  args: {
    issueId: v.id("issues"),
    assigneeId: v.id("users"),
    assignedByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.NOTIFICATION_FROM_EMAIL?.trim();
    if (!apiKey || !from) {
      console.log(
        "Assignment email skipped: RESEND_API_KEY or NOTIFICATION_FROM_EMAIL not set."
      );
      return;
    }

    const context = await ctx.runQuery(
      internal.notifications.getAssignmentEmailContext,
      args
    );
    if (!context) {
      console.log("Assignment email skipped: issue or assignee email not found.");
      return;
    }

    const appUrl = process.env.SITE_URL?.trim() || "http://localhost:5173";
    const { subject, text } = buildAssignmentEmailText({
      issue: context.issue,
      project: context.project,
      assigner: context.assigner,
      appUrl,
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [context.assignee.email!.trim()],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `Assignment email failed (${response.status}): ${body.slice(0, 500)}`
      );
    }
  },
});
