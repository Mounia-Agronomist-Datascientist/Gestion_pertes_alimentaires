/**
 * Photo du n° de lot et de la DLC d'une perte (règle R37), visible par ceux qui peuvent lire la perte.
 */
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { getCurrentUser } from "@/modules/auth/next-session";
import { canReadDeclaration } from "@/modules/declarations/access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Accès refusé", { status: 403 });
  const { id, photoId } = await params;
  if (!UUID.test(id) || !UUID.test(photoId)) return new NextResponse("Photo introuvable", { status: 404 });
  const [declaration] = await db.select().from(s.lossDeclarations).where(eq(s.lossDeclarations.id, id));
  if (!declaration || !canReadDeclaration(user, declaration))
    return new NextResponse("Photo introuvable", { status: 404 });
  const [photo] = await db
    .select({ content: s.declarationPhotos.content, contentType: s.declarationPhotos.contentType })
    .from(s.declarationPhotos)
    .where(and(eq(s.declarationPhotos.id, photoId), eq(s.declarationPhotos.declarationId, id)));
  if (!photo) return new NextResponse("Photo effacée (plus de 3 mois) ou introuvable", { status: 404 });
  return new NextResponse(new Uint8Array(photo.content), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
