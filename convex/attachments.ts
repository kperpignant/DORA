import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess } from "./security";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export type AttachmentKind = "image" | "log" | "video" | "other";

export function detectAttachmentKind(
  contentType: string,
  fileName: string
): AttachmentKind {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerType.startsWith("image/")) return "image";
  if (lowerType.startsWith("video/")) return "video";
  if (
    lowerType.startsWith("text/") ||
    lowerName.endsWith(".log") ||
    lowerName.endsWith(".txt")
  ) {
    return "log";
  }
  return "other";
}

export const generateUploadUrl = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireProjectAccess(ctx, issue.projectId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    issueId: v.id("issues"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    const user = await requireProjectAccess(ctx, issue.projectId);

    if (args.size > MAX_FILE_SIZE_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("File exceeds the 50 MB size limit.");
    }

    const kind = detectAttachmentKind(args.contentType, args.fileName);

    return await ctx.db.insert("attachments", {
      issueId: args.issueId,
      projectId: issue.projectId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      kind,
      uploadedBy: user._id,
      uploadedAt: Date.now(),
    });
  },
});

export const listByIssue = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return [];

    await requireProjectAccess(ctx, issue.projectId);

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const withUrls = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        url: await ctx.storage.getUrl(attachment.storageId),
      }))
    );

    return withUrls.sort((a, b) => a.uploadedAt - b.uploadedAt);
  },
});

export const remove = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new Error("Attachment not found");

    await requireProjectAccess(ctx, attachment.projectId);
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(args.attachmentId);
  },
});
