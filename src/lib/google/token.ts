import "server-only";
import { createClerkClient } from "@clerk/nextjs/server";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Built from the secret key alone (not request headers), so it also works
// inside cached functions.
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export type GoogleTokenResult =
  | { status: "ok"; token: string }
  /** Signed in, but not with Google (e.g. email sign-in). */
  | { status: "no_google" }
  /** Google is linked but the drive.file scope was never granted. */
  | { status: "needs_scope" };

/**
 * The user's Google access token, fetched server-side from Clerk.
 * Clerk refreshes it for us when it has expired.
 */
export async function getGoogleToken(userId: string): Promise<GoogleTokenResult> {
  const { data } = await clerk.users.getUserOauthAccessToken(userId, "google");
  const account = data[0];
  if (!account?.token) return { status: "no_google" };
  if (account.scopes && !account.scopes.includes(DRIVE_FILE_SCOPE)) {
    return { status: "needs_scope" };
  }
  return { status: "ok", token: account.token };
}
