import { headers } from "next/headers";

export async function getUserId(): Promise<string> {
  const h = await headers();
  // oauth2-proxy with nginx auth_request sets X-Email (via --set-xauthrequest)
  const email = h.get("x-email");

  if (email && process.env.APP_USER_ID) {
    return process.env.APP_USER_ID;
  }

  // Dev fallback when oauth2-proxy is not running
  if (process.env.DEV_USER_ID) {
    return process.env.DEV_USER_ID;
  }

  throw new Error("Not authenticated");
}
