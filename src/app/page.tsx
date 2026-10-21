import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/crm" : "/login");
}
