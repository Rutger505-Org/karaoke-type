import { reportClientError } from "@/server/report-client-error";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const { signIn, signUp, signOut, useSession } = createAuthClient({
  plugins: [magicLinkClient()],
  fetchOptions: {
    onError: ({ error, request }) => {
      // Wrong password etc. are normal; only report unexpected failures.
      if (error.status === 401) return;
      const path = new URL(request.url, window.location.origin).pathname;
      void reportClientError(
        "auth",
        `Path: ${path}\nStatus: ${error.status}\nError: ${error.message}`,
      );
    },
  },
});
