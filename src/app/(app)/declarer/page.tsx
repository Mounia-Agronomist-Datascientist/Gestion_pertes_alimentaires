import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { toProductionLocalDate } from "@/domain/semaine-production";
import { requireUser } from "@/modules/auth/next-session";
import { can } from "@/modules/auth/permissions";
import { getDeclarationOptions } from "@/modules/declarations/options";
import { DeclarationWizard } from "./declaration-wizard";

export const metadata = { title: "Déclarer une perte — Pertes" };

export default async function DeclarePage() {
  const user = await requireUser();
  if (!can(user, "declaration.create")) redirect("/");
  const options = await getDeclarationOptions(db, user, toProductionLocalDate(new Date()));
  return <DeclarationWizard options={options} userTeam={user.team} />;
}
