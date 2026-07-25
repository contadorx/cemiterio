import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resumo do DIA para o Início: o que a equipe precisa fazer hoje, o que entrou
// hoje e quantas conversas estão esperando uma resposta nossa.
// "Hoje" é sensível a fuso — usamos o dia-calendário de São Paulo, não o UTC,
// para bater com o calendário de quem opera.
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

  const [{ data: servHoje }, { data: credHoje }, { data: conversas }] = await Promise.all([
    // limpezas a fazer: previstas para hoje OU atrasadas (data no passado) que
    // ainda não saíram (pendente/agendado). Atrasada não some do radar.
    db.from("servicos").select("id,status,data_prevista").lte("data_prevista", hoje),
    // dinheiro que entrou hoje: crédito já confirmado, com data de hoje
    db.from("movimentos").select("valor").eq("tipo", "credito").eq("status_conc", "confirmado").eq("data", hoje),
    // conversas abertas em que a família falou por último — esperam resposta nossa
    db.from("conversas").select("ultimo_autor").eq("aberta", true),
  ]);

  const pendentes = (servHoje || []).filter(
    (s: any) => s.status === "pendente" || s.status === "agendado"
  );
  const limpezasAFazer = pendentes.length;
  const atrasadas = pendentes.filter((s: any) => (s.data_prevista as string) < hoje).length;

  let entrouHoje = 0;
  for (const m of credHoje || []) entrouHoje += Number((m as any).valor) || 0;

  const aguardando = (conversas || []).filter((c: any) => c.ultimo_autor === "cliente").length;

  return NextResponse.json({
    ok: true,
    dia: hoje,
    limpezasAFazer,
    atrasadas,
    entrouHoje: Math.round(entrouHoje * 100) / 100,
    aguardando,
  });
}
