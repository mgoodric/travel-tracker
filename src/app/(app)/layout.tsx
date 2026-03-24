import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

async function signOut() {
  "use server";
  redirect("/oauth2/sign_out");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Throws if not authenticated (oauth2-proxy not present and no DEV_USER_ID)
  await getUserId();

  return (
    <div className="min-h-screen bg-background">
      <AppNav signOutAction={signOut} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
