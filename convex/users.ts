import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isEmailAllowed, requireAllowedUser } from "./security";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { ...user, isAllowed: isEmailAllowed(user.email) };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAllowedUser(ctx);
    return await ctx.db.query("users").collect();
  },
});
