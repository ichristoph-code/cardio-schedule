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
      <aside className="hidden w-64 shrink-0 bg-white/80 shadow-[1px_0_3px_rgba(0,0,0,0.04),2px_0_8px_rgba(0,0,0,0.02)] backdrop-blur-xl lg:block dark:bg-card/80">
        <Sidebar userRole={session.user.role} />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <Header
          userName={session.user.name ?? "User"}
          userRole={session.user.role}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
