import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { conversarCampo } from "@/lib/assistente-campo";
import { montarBriefing } from "@/lib/briefing";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { historico: [{papel:'ajudante'|'sistema', texto}] }
// A ajudante conversa; a IA responde e registra ocorrência quando é o caso.
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const historico = Array.isArray(body?.historico) ? body.historico : [];
  if (!historico.length) return NextResponse.json({ ok: false, erro: "vazio" }, { status: 400 });

  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data: membro } = await auth.db.from("membros").select("nome,papel").limit(1).maybeSingle();
  const executoraId = (membro as any)?.papel === "campo" ? auth.userId : null;
  const nome = ((membro as any)?.nome || "").split(" ")[0];

  const b = await montarBriefing(executoraId, nome);
  const contexto = [
    `Faltam ${b.totalHoje} túmulos hoje.`,
    b.quadras.length ? `Quadras: ${b.quadras.join(", ")}.` : "",
    b.materiais.length ? `Materiais acabando: ${b.materiais.join(", ")}.` : "",
    b.pendencias ? `Há ${b.pendencias} túmulos represados de outros dias.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const out = await conversarCampo(historico, contexto);
    const adm = supabaseAdmin();
    const hoje = new Date().toISOString().slice(0, 10);

    // acha (ou cria) o dia de campo
    const { data: dia } = await adm
      .from("dias_campo")
      .select("id")
      .eq("org_id", org)
      .eq("data", hoje)
      .eq("executora_id", executoraId as any)
      .maybeSingle();

    // registra a ocorrência quando houver
    if (out.tipo_ocorrencia) {
      await adm.from("ocorrencias").insert({
        org_id: org,
        dia_campo_id: (dia as any)?.id || null,
        tipo: out.tipo_ocorrencia,
        descricao: out.descricao || historico[historico.length - 1]?.texto || null,
        impacto: Math.max(0, Number(out.impacto) || 0),
        registrada_por: auth.userId,
      });
    }

    // material acabando: cria/atualiza o alerta
    if (out.material) {
      const nomeMat = out.material.trim().toLowerCase();
      const { data: existe } = await adm
        .from("materiais")
        .select("id")
        .eq("org_id", org)
        .eq("nome", nomeMat)
        .maybeSingle();
      if (existe) {
        await adm.from("materiais").update({ estoque: 0, atualizado_em: new Date().toISOString() }).eq("id", (existe as any).id);
      } else {
        await adm.from("materiais").insert({ org_id: org, nome: nomeMat, estoque: 0, alerta_minimo: 1 });
      }
    }

    // o recado da equipe vai para a MESMA caixa de entrada das famílias,
  // fixado no topo — quem está no campo agora pode estar precisando de resposta
  try {
    const adm = supabaseAdmin();
    const { data: conversaId } = await auth.db.rpc("sureya_conversa_equipe", {
      p_membro: auth.userId,
    });
    if (conversaId) {
      await adm.from("mensagens").insert([
        { org_id: env.orgId(), conversa_id: conversaId, cliente_id: null,
          direcao: "entrada", autor: "campo",
          texto: `${nome || "Campo"}: ${String(historico[historico.length - 1]?.texto || "")}`, processada: true },
        { org_id: env.orgId(), conversa_id: conversaId, cliente_id: null,
          direcao: "saida", autor: "ia", texto: out.resposta, processada: true },
      ]);
      await adm.from("conversas")
        .update({ updated_at: new Date().toISOString(), aberta: true, resolvida: false })
        .eq("id", conversaId);
    }
  } catch { /* o recado não pode derrubar o assistente */ }

  return NextResponse.json({
      ok: true,
      resposta: out.resposta,
      registrou: !!out.tipo_ocorrencia,
      avisarDono: out.avisar_dono,
      encerrarDia: out.encerrar_dia,
    });
  } catch (e: any) {
    await registrarErro("assistente_campo", e);
    return NextResponse.json({ ok: false, erro: "falha_ia" }, { status: 500 });
  }
}
