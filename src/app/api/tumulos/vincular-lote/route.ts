import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { criarPlanoSeFaltar, explicarErroJazigo, vincularJazigoAFamilia } from "@/lib/jazigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/tumulos/vincular-lote — dar dono aos jazigos capturados no campo.
 *
 * Corpo:
 *   { itens: [{
 *       tumuloId,
 *       familiaId?,                       // família já cadastrada
 *       novaFamilia?: { nome, telefone? }, // ou cria a família na hora
 *       plano?: { cadencia, lavagensPorCiclo, valorMensal, inicio },
 *   }] }
 *
 * ⚠ O QUE MUDOU NA 0091, E POR QUÊ
 * Isto pedia `clienteId` e, para família nova, exigia **nome e telefone** —
 * "Família nova precisa de nome e telefone." era a mensagem. Era a parede onde
 * o cadastro batia: 81 dos 204 jazigos capturados no campo são de famílias de
 * quem ainda não se tem telefone nenhum.
 *
 * Agora o vínculo é com a FAMÍLIA, e o telefone é opcional. Uma família sem
 * contato é estado legítimo — e a lavagem dela vira cobrança do mesmo jeito,
 * porque a dívida sempre foi da família (D-01).
 *
 * `clienteId` continua aceito, para link antigo e chamada guardada não
 * quebrarem: vira a família daquele contato.
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

  // Cache das famílias novas do lote. Duas linhas com a MESMA família precisam
  // cair na mesma — senão dois jazigos irmãos viram duas famílias homônimas, e
  // a conta da casa fica partida ao meio sem ninguém perceber.
  //
  // A chave é o telefone quando ele existe (é o identificador forte, com unique
  // no banco) e o nome em minúsculas quando não — que é o melhor disponível
  // para quem não tem número.
  const porChave = new Map<string, string>();

  const resultados: {
    tumuloId: string;
    ok: boolean;
    mensagem: string;
    familiaId?: string;
    planoCriado?: boolean;
  }[] = [];

  /** Ressalva do contato desta linha, quando a família entrou mas ele não. */
  let ressalvaContato = "";

  for (const it of itens) {
    const tumuloId = String(it?.tumuloId || "").trim();
    if (!tumuloId) {
      resultados.push({ tumuloId: "", ok: false, mensagem: "Item sem jazigo." });
      continue;
    }

    try {
      // --- 1. de quem é este jazigo? ---
      let familiaId = String(it?.familiaId || "").trim() || "";

      // Compatibilidade: chamada antiga mandava o contato. Vira a família dele.
      if (!familiaId && it?.clienteId) {
        const { data: c } = await db
          .from("clientes").select("familia_id").eq("id", String(it.clienteId)).maybeSingle();
        familiaId = (c as any)?.familia_id || "";
      }

      if (!familiaId && it?.novaFamilia) {
        const nome = String(it.novaFamilia?.nome || "").trim();
        const telefone = normalizarTelefone(String(it.novaFamilia?.telefone || ""));
        if (!nome) {
          resultados.push({ tumuloId, ok: false, mensagem: "Família nova precisa de um nome." });
          continue;
        }

        const chave = telefone || `nome:${nome.toLowerCase()}`;
        const emCache = porChave.get(chave);
        if (emCache) familiaId = emCache;
        else {
          // Telefone conhecido que já está no sistema? Usa a família DELE, em
          // vez de criar uma segunda ficha da mesma gente.
          if (telefone) {
            const { data: ja } = await db
              .from("clientes").select("familia_id").eq("telefone", telefone).maybeSingle();
            if ((ja as any)?.familia_id) familiaId = (ja as any).familia_id;
          }

          if (!familiaId) {
            const { data: nova, error } = await db
              .from("familias").insert({ org_id: org, nome }).select("id").single();
            if (error) {
              resultados.push({ tumuloId, ok: false, mensagem: `Não criei a família: ${error.message}` });
              continue;
            }
            familiaId = (nova as any).id;

            // O contato só entra quando veio telefone. Sem ele a família fica
            // sem contato — que é o caso inteiro desta mudança, e não um erro.
            if (telefone) {
              const { error: eC } = await db.from("clientes").insert({
                org_id: org, nome, telefone, familia_id: familiaId,
                modo: "copiloto", ativo_ia: true,
              });
              // A família JÁ existe e o jazigo vai ser vinculado a ela de todo
              // jeito: um telefone repetido não custa o vínculo.
              if (eC) ressalvaContato = ` (contato não criado: ${eC.message})`;
            }
          }
          porChave.set(chave, familiaId);
        }
      }

      if (!familiaId) {
        resultados.push({ tumuloId, ok: false, mensagem: "Sem família escolhida." });
        continue;
      }

      // a família precisa existir e ser visível sob RLS (não aceita id de fora)
      const { data: fam } = await db
        .from("familias").select("id,nome,responsavel_id").eq("id", familiaId).maybeSingle();
      if (!fam) {
        resultados.push({ tumuloId, ok: false, mensagem: "Família não encontrada. Recarregue a página." });
        continue;
      }
      const clienteId = (fam as any).responsavel_id || undefined;

      // --- 2. o vínculo ---
      const r = await vincularJazigoAFamilia(db, org, familiaId, tumuloId);
      if (!r.ok) {
        resultados.push({
          tumuloId, ok: false, familiaId,
          mensagem: explicarErroJazigo(r.erro, r.detalhe),
        });
        continue;
      }

      // --- 3. plano opcional ---
      let planoCriado = false;
      let ressalva = ressalvaContato;
      ressalvaContato = "";
      const pl = it?.plano || null;
      // PLANO SÓ COM CONTATO. `criarPlanoSeFaltar` pendura o plano numa pessoa,
      // e família sem contato não tem em quem pendurar. Dizer isso é melhor que
      // criar o vínculo e deixar a Sureya achando que o plano entrou.
      if (pl?.cadencia && pl.cadencia !== "avulso" && !clienteId) {
        ressalva += " (sem plano: esta família ainda não tem contato)";
      } else if (pl?.cadencia && pl.cadencia !== "avulso" && clienteId) {
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
        tumuloId, ok: true, familiaId, planoCriado,
        mensagem:
          `Vinculado a ${(fam as any).nome}` +
          (planoCriado ? " com plano." : ".") +
          (clienteId ? "" : " Família ainda sem contato.") + ressalva,
      });
    } catch (e: any) {
      resultados.push({ tumuloId, ok: false, mensagem: String(e?.message || e).slice(0, 200) });
    }
  }

  const feitos = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, feitos, total: itens.length, resultados });
}
