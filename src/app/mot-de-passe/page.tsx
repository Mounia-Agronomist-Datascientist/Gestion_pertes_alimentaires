import Link from "next/link";
import { requireUser } from "@/modules/auth/next-session";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Mot de passe — Pertes" };

export default async function PasswordPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Changer le mot de passe</h1>
        <p className="text-slate-600">
          {user.displayName}
          {user.mustChangePassword && " — un nouveau mot de passe est demandé avant de continuer."}
        </p>
      </div>
      <PasswordForm />
      {!user.mustChangePassword && (
        <Link href="/" className="text-center text-slate-600 underline">
          Retour à l&apos;accueil
        </Link>
      )}
    </main>
  );
}
