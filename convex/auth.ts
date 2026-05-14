import Google, { type GoogleProfile } from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { assertEmailAllowed } from "./security";

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
});
