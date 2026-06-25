import { describe, expect, test } from "vitest";
import { buildAssignmentEmailText } from "./notifications";
import type { Doc, Id } from "./_generated/dataModel";

const baseIssue = {
  _id: "issue1" as Id<"issues">,
  _creationTime: 0,
  projectId: "project1" as Id<"projects">,
  issueNumber: 42,
  type: "bug" as const,
  title: "Login fails on Safari",
  description: "Users cannot sign in.",
  status: "todo" as const,
  priority: "high" as const,
  severity: "major" as const,
  stepsToReproduce: "Open Safari and click Sign In.",
  createdAt: 0,
  updatedAt: 0,
} satisfies Doc<"issues">;

const baseProject = {
  _id: "project1" as Id<"projects">,
  _creationTime: 0,
  name: "Klaviyo Core",
  key: "KLA",
  createdAt: 0,
} satisfies Doc<"projects">;

describe("buildAssignmentEmailText", () => {
  test("includes issue key, fields, and app link", () => {
    const { subject, text } = buildAssignmentEmailText({
      issue: baseIssue,
      project: baseProject,
      assigner: {
        _id: "u1" as Id<"users">,
        _creationTime: 0,
        name: "Alex",
        email: "alex@example.com",
      },
      appUrl: "https://dora.example.com",
    });

    expect(subject).toBe("[KLA-42] You've been assigned: Login fails on Safari");
    expect(text).toContain("You've been assigned KLA-42");
    expect(text).toContain("Steps to reproduce:");
    expect(text).toContain("Open DORA: https://dora.example.com");
    expect(text).toContain("Look for issue KLA-42 in project KLA.");
    expect(text).toContain("Assigned by: Alex — alex@example.com");
  });

  test("truncates very long code logs", () => {
    const { text } = buildAssignmentEmailText({
      issue: { ...baseIssue, codeLog: "x".repeat(3000) },
      project: baseProject,
      assigner: null,
      appUrl: "https://dora.example.com",
    });

    expect(text).toContain("… (truncated — see full log in DORA)");
    expect(text.length).toBeLessThan(3500);
  });
});
