import { NextRequest } from "next/server";
import { env } from "./env";
import { timingSafeEqual } from "node:crypto";

/**
 * QUEM PODE DISPARAR AS ROTINAS.
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>` nos crons agendados.
 * É o único jeito aceito.
 *
 * O `?secret=` SAIU
 * ---------------------------------------------------------------------------
 * Ele existia para "disparar manualmente pelo navegador" — e era exatamente o
 * problema: segredo em query string vai para o log de acesso do servidor, para
 * o log do proxy e para o histórico do navegador de quem digitou. Três lugares
 * onde ninguém procura vazamento, e todos os três guardam para sempre.
 *
 * Para disparar à mão continua dando, com o segredo no header:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/diario
 *
 * Não há perda de capacidade — só o segredo mudou de lugar.
 */
export function cronAutorizado(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return igual(auth, `Bearer ${secret}`);
}

/**
 * Comparação de tempo constante.
 *
 * `a === b` sai no primeiro caractere diferente, e a diferença de tempo entre
 * "errou na primeira letra" e "errou na última" é medível pela rede. Não é o
 * risco mais urgente deste sistema — mas comparar segredo é o único lugar onde
 * isso importa, e custa três linhas.
 */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
