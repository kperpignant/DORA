import { describe, expect, test } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./security";

describe("email allowlist helpers", () => {
  test("normalizes comma-separated allowed emails", () => {
    expect(parseAllowedEmails(" Admin@Example.com, teammate@example.com ,, ")).toEqual(
      new Set(["admin@example.com", "teammate@example.com"])
    );
  });

  test("matches emails case-insensitively after trimming whitespace", () => {
    const allowed = parseAllowedEmails("admin@example.com");

    expect(isEmailAllowed(" Admin@Example.com ", allowed)).toBe(true);
    expect(isEmailAllowed("visitor@example.com", allowed)).toBe(false);
    expect(isEmailAllowed(undefined, allowed)).toBe(false);
  });
});
