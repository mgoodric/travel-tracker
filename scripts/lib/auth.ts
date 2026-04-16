/** Resolve the app user ID from environment, or throw. */
export function getUserId(): string {
  const userId = process.env.APP_USER_ID || process.env.DEV_USER_ID;
  if (!userId) {
    throw new Error("Missing APP_USER_ID or DEV_USER_ID environment variable");
  }
  return userId;
}
