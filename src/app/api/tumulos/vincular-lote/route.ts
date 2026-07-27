import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { anexarJazigo, criarPlanoSeFaltar, explicarErroJazigo } from "@/lib/jazigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/tumulos/vincular-lote — dar dono aos jazigos capturados no campo.
 *
 * Corpo:
 *   { itens: [{
 *       tumuloId,
 *       clienteId?,                      // família já cadastrada
 *       novaFamilia?: { nome, telefone },// ou cria a família na hora
 *       plano?: { cadencia, lavagensPorCiclo, valorMensal, inicio },
 *   }] }
 *
 * Cada item responde por si: um erro numa linha NÃO derruba o lote, e nenhuma
 * linha responde "ok" sem ter acontecido. O vínculo em si passa pela mesma
 * função de sempre (src/lib/jazigo.ts), então a regra vale aqui também: jazigo
 * de outra família não é roubado, é recusado com o nome de quem é.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) {
    return NextResponse.json(
      { ok: false, erro: "sem_org", mensagem: explicarErroJazigo("sem_org") },
      { status: 400 },
    );
  }

  const b = await req.json().catch(() => ({}));
  const itens = Array.isArray(b?.itens) ? b.itens : [];
  if (!itens.length) return NextResponse.json({ ok: false, erro: "lote_vazio" }, { status: 400 });
  if (itens.length > 200) return NextResponse.json({ ok: false, erro: "max_200_por_vez" }, { status: 400 });

  // Cache por telefone: duas linhas do lote com a MESMA família nova precisam
  // cair na mesma família — sem isto, a segunda linha estouraria na unique
  // (org_id, telefone) ou, pior, criaria uma segunda ficha da mesma pessoa.
  const porTelefone = new Map<string, string>();

  const resultados: {
    tumuloId: string;
    ok: boolean;
    mensagem: string;
    clienteId?: string;
    planoCriado?: boolean;
  }[] = [];

  for (const it of itens) {
    const tumuloId = String(it?.tumuloId || "").trim();
    if (!tumuloId) {
      resultados.push({ tumuloId: "", ok: false, mensagem: "Item sem jazigo." });
      continue;
    }

    try {
      // --- 1. de quem é este jazigo? ---
      let clienteId = String(it?.clienteId || "").trim() || "";

      if (!clienteId && it?.novaFamilia) {
        const nome = String(it.novaFamilia?.nome || "").trim();
        const telefone = normalizarTelefone(String(it.novaFamilia?.telefone || ""));
        if (!nome || !telefone) {
          resultados.push({
            tumuloId, ok: false,
            mensagem: "Família nova precisa de nome e telefone.",
          });
          continue;
        }
        const emCache = porTelefone.get(telefone);
        if (emCache) clienteId = emCache;
        else {
          // já existe alguém com esse telefone? reaproveita em vez de duplicar
          const { data: ja } = await db
            .from("clientes").select("id").eq("telefone", telefone).maybeSingle();
          if (ja) clienteId = (ja as any).id;
          else {
            const { data: novo, error } = await db.from("clientes").insert({
              org_id: org, nome, telefone, modo: "copiloto", ativo_ia: true,
            }).select("id").single();
            if (error) {
              resultados.push({ tumuloId, ok: false, mensagem: `Não criei a família: ${error.message}` });
              continue;
            }
            clienteId = (novo as any).id;
          }
          porTelefone.set(telefone, clienteId);
        }
      }

      if (!clienteId) {
        resultados.push({ tumuloId, ok: false, mensagem: "Sem família escolhida." });
        continue;
      }

      // a família precisa existir e ser visível sob RLS (não aceita id de fora)
      const { data: cli } = await db
        .from("clientes").select("id,nome").eq("id", clienteId).maybeSingle();
      if (!cli) {
        resultados.push({ tumuloId, ok: false, mensagem: "Família não encontrada. Recarregue a página." });
        continue;
      }

      // --- 2. o vínculo (mesma função da ficha e do cadastro) ---
      const r = await anexarJazigo(db, org, clienteId, { vincularTumuloId: tumuloId });
      if (!r.ok) {
        resultados.push({
          tumuloId, ok: false, clienteId,
          mensagem: explicarErroJazigo(r.erro, r.detalhe),
        });
        continue;
      }

      // --- 3. plano opcional ---
      let planoCriado = false;
      let ressalva = "";
      const pl = it?.plano || null;
      if (pl?.cadencia && pl.cadencia !== "avulso") {
        const rp = await criarPlanoSeFaltar(db, org, clienteId, r.tumuloId, {
          cadencia: pl.cadencia,
          lavagensPorCiclo: pl.lavagensPorCiclo ?? null,
          valorMensal: pl.valorMensal ?? null,
          inicio: pl.inicio ?? null,
        });
        // o jazigo JÁ está vinculado: falha de plano é ressalva, não fracasso
        if (rp.ok) planoCriado = rp.criado;
        else ressalva = ` (sem plano: ${explicarErroJazigo(rp.erro)})`;
      }

      resultados.push({
        tumuloId, ok: true, clienteId, planoCriado,
        mensagem:
          `Vinculado a ${(cli as any).nome}` +
          (planoCriado ? " com plano." : ".") + ressalva,
      });
    } catch (e: any) {
      resultados.push({ tumuloId, ok: false, mensagem: String(e?.message || e).slice(0, 200) });
    }
  }

  const feitos = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, feitos, total: itens.length, resultados });
}
