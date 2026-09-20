import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(session.user.role === "VIEWER" ? "/dashboard/schedule" : "/dashboard/vacation");
}
