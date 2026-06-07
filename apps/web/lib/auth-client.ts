import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  genericOAuthClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), genericOAuthClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
} = authClient;
export const magicLinkSignIn = authClient.signIn.magicLink;
