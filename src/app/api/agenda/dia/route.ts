import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { avisosDoJazigo } from "@/lib/briefing";
import { diaOperacao } from "@/lib/vencimento";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinarVarios } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?data=yyyy-mm-dd  (default: hoje) — lista ordenada dos túmulos do dia.
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  // O DIA E O DE SAO PAULO, NUNCA O DA MAQUINA.
  //
  // O alocador grava data_prevista com diaOperacao() (America/Sao_Paulo), mas
  // esta rota lia com toISOString() (UTC). A Vercel roda em UTC: das 21h a
  // meia-noite de Brasilia o app de campo pedia o dia de AMANHA e a lista da
  // Nina aparecia vazia. Uma funcao so para o sistema inteiro.
  const data = req.nextUrl.searchParams.get("data") || diaOperacao();

  let q = db
    .from("servicos")
    .select(
      "id,status,ordem_dia,tumulo_id,adiado_vezes,iniciado_em,foto_antes_url,tumulos(identificacao,numero,lat,lng,gps_precisao,gps_amostras,falecido_nome,rua,qr_token,datas_gatilho,foto_referencia_url,foto_enquadramento_url,familias(nome),quadras(codigo,ordem,cemiterios(nome))),clientes(nome)"
    )
    .eq("data_prevista", data)
    .in("status", ["pendente", "agendado", "executado"]);

  // D5: a ajudante vê só a própria rota; o dono vê tudo (ou filtra por ?executora=)
  // a ajudante vê a própria rota. O dono vê tudo — e pode se colocar no lugar
  // dela escolhendo ?executora=ID (é assim que ele testa e cobre uma falta).
  const exec = req.nextUrl.searchParams.get("executora");
  if (auth.papel === "campo") {
    q = q.or(`executora_id.eq.${auth.userId},executora_id.is.null`);
  } else if (exec === "eu") {
    q = q.or(`executora_id.eq.${auth.userId},executora_id.is.null`);
  } else if (exec) {
    q = q.eq("executora_id", exec);
  }

  const { data: servs, error } = await q.order("ordem_dia", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // O BALDE `servicos` FECHOU (0154): o endereço guardado não abre mais sozinho.
  // Um lote só para a lista inteira — assinar dentro do `map` faria uma ida ao
  // Storage por foto e devolveria Promise para a tela.
  const links154 = await assinarVarios(supabaseAdmin(), (servs || []).flatMap((s: any) => [s.foto_antes_url, s.tumulos?.foto_referencia_url, s.tumulos?.foto_enquadramento_url]));
  const abrir154 = (u: any) => (u ? links154.get(u) ?? null : null);

  const lista = (servs || []).map((s: any) => ({
    id: s.id,
    tumuloId: s.tumulo_id,
    status: s.status,
    ordem: s.ordem_dia,
    tumulo: s.tumulos?.identificacao || "",
    quadra: s.tumulos?.quadras?.codigo || "—",
    // 0044: com dois cemitérios, "Q-12" sozinho não diz onde a pessoa está
    cemiterio: s.tumulos?.quadras?.cemiterios?.nome || null,
    falecido: s.tumulos?.falecido_nome || null,
    // DE QUEM É ESTE JAZIGO.
    //
    // A família é a entidade do sistema desde a D-10 — é dela o contrato, é
    // ela que aparece na agenda do painel, na conferência e na cobrança. O app
    // de campo era o único lugar que não a mostrava: a Nina via o jazigo, a
    // quadra e o nome da lápide, e não sabia de quem estava cuidando.
    //
    // Vem do TÚMULO, não do serviço. `servicos.cliente_id` é quem PEDIU — faz
    // sentido num avulso e é nulo na lavagem de contrato, que é a maioria do
    // dia dela. Ler a família dali deixaria o cartão vazio justamente nas
    // lavagens de sempre.
    familia: s.tumulos?.familias?.nome || null,
    cliente: s.clientes?.nome || null,
    lat: s.tumulos?.lat ?? null,
    lng: s.tumulos?.lng ?? null,
    gpsPrecisao: s.tumulos?.gps_precisao ?? null,
    gpsAmostras: s.tumulos?.gps_amostras ?? 0,
    fotoReferencia: abrir154(s.tumulos?.foto_referencia_url),
    // foto do "antes" DESTE servico (nao a do cadastro do jazigo): existe
    // quando a ajudante ja apertou Comecar e tirou a foto
    fotoAntes: abrir154(s.foto_antes_url),
    fotoEnquadramento: abrir154(s.tumulos?.foto_enquadramento_url),
    rua: s.tumulos?.rua || "",
    numero: s.tumulos?.numero || "",
    qrToken: s.tumulos?.qr_token || null,
    iniciadoEm: s.iniciado_em || null,
    adiadoVezes: s.adiado_vezes || 0,
    // os avisos vão no CARD do jazigo, não no resumo do dia
    avisos: avisosDoJazigo(s),
  }));

  const total = lista.length;
  const feitos = lista.filter((x) => x.status === "executado").length;

  return NextResponse.json({ ok: true, data, total, feitos, lista });
}
