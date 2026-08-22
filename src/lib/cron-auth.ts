import { NextRequest } from "next/server";
import { env } from "./env";

// A Vercel manda "Authorization: Bearer <CRON_SECRET>" nos crons agendados.
// O parâmetro ?secret= permite disparar manualmente pelo navegador.
export function cronAutorizado(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}
