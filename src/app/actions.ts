"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { clearSessionCookie, readSessionToken } from "@/modules/auth/next-session";
import { logout } from "@/modules/auth/service";

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await logout(db, token);
  await clearSessionCookie();
  redirect("/connexion");
}
