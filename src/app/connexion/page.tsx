import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/next-session";
import { ClearOfflinePages } from "../service-worker";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion — Pertes" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; login?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { erreur, login } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        {/* Logo de La Brigade de Véro : sur la page de connexion seulement (décision du 20/11/2026). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, sans optimisation d'image */}
        <img
          src="/marque/logo-brigade-de-vero.svg"
          alt="La Brigade de Véro"
          width={191}
          height={116}
          className="h-28 w-auto"
        />
        <div>
          <h1 className="text-3xl font-extrabold">Suivi des pertes</h1>
          <p className="text-slate-600">Déclaration des pertes alimentaires et matières</p>
        </div>
      </div>
      <LoginForm error={erreur} login={login} />
      <ClearOfflinePages />
    </main>
  );
}
