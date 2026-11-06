import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { BatchDeclaration } from "./batch-declaration";

export const metadata = { title: "Déclarer plusieurs pertes — Pertes" };

export default async function BatchPage() {
  const user = await requireUser();
  if (!can(user, "declaration.create")) redirect("/");
  const options = await getDeclarationOptions(db, user, toProductionLocalDate(new Date()));
  return <BatchDeclaration options={options} userTeam={user.team} userId={user.id} />;
}
