import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-black/[0.04] bg-white/70 backdrop-blur-xl backdrop-saturate-150 lg:block dark:border-white/[0.06] dark:bg-card/70">
        <Sidebar userRole={session.user.role} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-mesh">
        <Header
          userName={session.user.name ?? "User"}
          userRole={session.user.role}
          physicianId={(session.user as Record<string, unknown>).physicianId as string | null}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
