import Google, { type GoogleProfile } from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import {
  assertEmailAllowed,
  assertEmailNotBlocked,
} from "./security";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Google<GoogleProfile>({
      profile(profile) {
        assertEmailAllowed(profile.email);
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email = args.profile.email as string | undefined;
      assertEmailAllowed(email);
      await assertEmailNotBlocked(ctx, email);

      const userData = {
        name: args.profile.name as string | undefined,
        image: args.profile.image as string | undefined,
        email,
        emailVerificationTime: Date.now(),
      };

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, userData);
        return args.existingUserId;
      }

      if (email) {
        const existing = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), email))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, userData);
          return existing._id;
        }
      }

      return await ctx.db.insert("users", userData);
    },
  },
});
