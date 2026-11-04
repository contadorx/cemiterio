import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinarVarios } from "@/lib/storage";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AS FOTOS QUE SAÍRAM E AINDA NÃO VIRARAM LAVAGEM.
 *
 * MEDIDO EM 04/11/2026: 7 serviços executados, 3 com foto. Não é que a Nina
 * não fotografe — é que a foto saía do celular dela e o sistema guardava
 * apenas a frase "[foto enviada pelo celular]". A 0160 passou a guardar o
 * arquivo; esta fila é o que falta para ele virar registro.
 *
 * POR QUE É UMA FILA, E NÃO AUTOMÁTICO. Uma família pode ter três jazigos, e
 * a foto não diz qual. Adivinhar pelo "único jazigo dela" acerta na maioria e
 * erra exatamente nas famílias grandes, que são as que mais pagam — e um
 * serviço lançado no jazigo errado vira cobrança no jazigo errado. Quem
 * escolhe é gente; o sistema traz a foto, a família e os jazigos dela.
 */
export async function GET(_req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data: msgs, error } = await db
    .from("mensagens")
    .select("id,cliente_id,conversa_id,texto,midia_url,created_at,clientes(nome,familia_id)")
    .eq("direcao", "saida")
    .not("midia_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const linhas = (msgs as any[]) || [];

  // JÁ VIROU LAVAGEM? A marca é a própria URL gravada no serviço: se a foto
  // desta mensagem já está num `servicos.foto_depois_url`, ela sai da fila.
  // Guardar um "já tratei" numa coluna nova seria uma segunda verdade sobre
  // o mesmo fato.
  const urls = linhas.map((m) => m.midia_url).filter(Boolean);
  const { data: jaUsadas } = urls.length
    ? await db.from("servicos").select("foto_depois_url").in("foto_depois_url", urls)
    : { data: [] as any[] };
  const usadas = new Set(((jaUsadas as any[]) || []).map((s) => s.foto_depois_url));

  const pendentes = linhas.filter((m) => !usadas.has(m.midia_url));

  // Os jazigos de cada família, para a tela oferecer a escolha sem uma
  // segunda ida ao servidor.
  const famIds = [...new Set(pendentes.map((m) => m.clientes?.familia_id).filter(Boolean))];
  const { data: tums } = famIds.length
    ? await db.from("tumulos")
        .select("id,identificacao,codigo,familia_id,quadras(codigo,cemiterios(nome))")
        .in("familia_id", famIds)
    : { data: [] as any[] };

  const porFamilia = new Map<string, any[]>();
  for (const t of ((tums as any[]) || [])) {
    const lista = porFamilia.get(t.familia_id) || [];
    lista.push({
      id: t.id,
      identificacao: t.identificacao || t.codigo || "sem nome",
      quadra: t.quadras?.codigo || null,
      cemiterio: t.quadras?.cemiterios?.nome || null,
    });
    porFamilia.set(t.familia_id, lista);
  }

  const links = await assinarVarios(supabaseAdmin(), urls);

  return NextResponse.json({
    ok: true,
    hoje: diaOperacao(),
    fila: pendentes.map((m) => ({
      mensagemId: m.id,
      clienteId: m.cliente_id,
      conversaId: m.conversa_id,
      familia: m.clientes?.nome || "—",
      quando: m.created_at,
      legenda: (m.texto || "").startsWith("[") ? null : m.texto,
      // `null` é "não consegui abrir", e a tela diz isso — nunca mostra uma
      // imagem quebrada nem some com a linha.
      foto: links.get(m.midia_url) ?? null,
      // O ENDEREÇO GUARDADO vai junto: é ele que a tela devolve ao registrar.
      // Mandar de volta o link assinado faria o registro falhar meia hora
      // depois, quando ele expirasse.
      fotoOriginal: m.midia_url,
      jazigos: porFamilia.get(m.clientes?.familia_id) || [],
    })),
  });
}
