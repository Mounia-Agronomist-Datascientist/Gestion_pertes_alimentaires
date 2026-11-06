import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";

/** Toute la section administration est réservée ; chaque service revérifie la permission. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!can(user, "user.manage") && !can(user, "referentiel.manage")) redirect("/");
  return <div className="flex flex-col gap-4">{children}</div>;
}
