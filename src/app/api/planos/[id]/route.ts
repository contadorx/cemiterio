import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao, valorMensalDoPlano } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0, por_data: 0,
};

// PATCH — edita o plano do jazigo, incluindo os campos da migração.
// Só mexe no que o corpo manda (a tela envia apenas os campos tocados), para um
// Salvar de data não reescrever dinheiro nem desfazer o que o servidor mudou.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  for (const c of ["pago_ate", "proxima_cobranca", "proximo_servico"]) {
    if (b[c] !== undefined) patch[c] = b[c] || null;
  }
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (b.momento_cobranca && ["antes", "depois", "contra_foto"].includes(b.momento_cobranca)) {
    patch.momento_cobranca = b.momento_cobranca;
  }
  // quantas lavagens dentro do período (mensal + 2 = a cada 15 dias)
  const lav = b.lavagens_por_ciclo ?? b.qtd_por_passagem;
  if (lav !== undefined) {
    const n = Math.max(1, Math.min(12, Number(lav) || 1));
    patch.lavagens_por_ciclo = n;
    patch.qtd_por_passagem = n;
  }

  // DINHEIRO — a regra e conservadora de proposito.
  //
  // valor_vigente tem significado em disputa no sistema (preco por limpeza em
  // migrations/0001 e em src/lib/agenda.ts; valor do ciclo no codigo novo, ver
  // src/lib/vencimento.ts). Enquanto a decisao nao vier, esta rota:
  //  - recalcula valor_vigente = mensal x meses SO quando o mensal e CONHECIDO
  //    (veio no corpo, ou ja esta gravado na coluna valor_mensal);
  //  - em plano antigo (valor_mensal NULL) e salvamento que nao mexeu no
  //    dinheiro, NAO toca em valor_vigente nem inventa um valor_mensal. Antes
  //    disso, salvar a data de um plano bimestral importado por R$ 45 gravava
  //    valor_vigente = 90 e dobrava o valor debitado em cada lavagem.
  if (b.cadencia !== undefined || b.valor_mensal !== undefined) {
    const a = (await db.from("planos")
      .select("cadencia,valor_mensal,valor_vigente,data_valor_vigente")
      .eq("id", params.id).maybeSingle()).data as any;
    const cadencia = b.cadencia ?? a?.cadencia;
    if (b.cadencia !== undefined) patch.cadencia = cadencia;

    const mensal = b.valor_mensal !== undefined
      ? Number(b.valor_mensal) || 0
      : (a?.valor_mensal != null ? Number(a.valor_mensal) : null);

    if (mensal != null) {
      const meses = MESES[cadencia] ?? 1;
      patch.valor_mensal = Math.round(mensal * 100) / 100;
      patch.valor_vigente = meses > 0
        ? Math.round(mensal * meses * 100) / 100
        : Math.round(mensal * 100) / 100;

      // PRECO NOVO = DATA NOVA. data_valor_vigente e o "desde quando este preco
      // vale", e a Temperatura de reajuste (src/lib/reajuste.ts) mede a
      // defasagem a partir dela. So o RPC de reajuste atualizava essa data:
      // quem aumentava o honorario aqui, na Gestao, mexia no valor e deixava a
      // data de 2023 — a familia ficava no topo da fila de reajuste com
      // sugestao calculada sobre 3 anos de IPCA ja aplicados.
      // A data so muda quando o MENSAL muda: trocar mensal->anual altera o
      // valor do ciclo sem mudar o preco, e nao e aumento nenhum. A comparacao
      // e contra o que a tela mostrava (valorMensalDoPlano), para plano antigo
      // reenviando o mesmo numero nao contar como reajuste.
      const antes = valorMensalDoPlano(a?.cadencia, a?.valor_mensal, a?.valor_vigente);
      if (Math.abs(mensal - antes) > 0.005) patch.data_valor_vigente = diaOperacao();
    }
  }

  // "conferido" é a data da PRIMEIRA conferência e não se repete: a tela mandava
  // migrado:true em todo Salvar, então cada correção de data reescrevia
  // migrado_em e o histórico de "quando esta carteira foi conferida" virava
  // "quando alguém mexeu por último". Desmarcar (migrado:false) continua limpando.
  if (b.migrado === false) patch.migrado_em = null;
  if (b.migrado === true) {
    const { data: jaTem } = await db
      .from("planos").select("migrado_em").eq("id", params.id).maybeSingle();
    if (!(jaTem as any)?.migrado_em) patch.migrado_em = new Date().toISOString();
  }

  if (!Object.keys(patch).length) {
    // nada mudou de fato (ex.: Salvar sem editar nada num plano já conferido).
    // Não é erro — devolver 400 fazia a tela gritar "Falhou" por um clique inócuo.
    return NextResponse.json({ ok: true, semMudanca: true });
  }
  const { error } = await db.from("planos").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, valorCiclo: patch.valor_vigente });
}
