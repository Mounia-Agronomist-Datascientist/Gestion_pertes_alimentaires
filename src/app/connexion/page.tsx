import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/next-session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion — Pertes" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; login?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { erreur, login } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-4">
      <div>
        <h1 className="text-3xl font-bold">Suivi des pertes</h1>
        <p className="text-slate-600">La Brigade — déclaration des pertes alimentaires et matières</p>
      </div>
      <LoginForm error={erreur} login={login} />
    </main>
  );
}
