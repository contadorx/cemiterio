/* A faxina: os prazos que a política de privacidade promete, cumpridos.
 *
 * Ela faz duas coisas, e as duas eram promessas escritas sem código atrás:
 *
 *   1. EXPURGO — apaga o conteúdo das contas encerradas há mais de 90 dias, o
 *      e-mail da lista de aviso com mais de 24 meses e os marcos de uso com mais
 *      de 18. A fatura NÃO é apagada: nota fiscal tem prazo de guarda maior, e
 *      isso não é escolha nossa. O cliente sobrevive reduzido ao que descreve a
 *      venda, sem nome nem documento.
 *
 *   2. BALDE — tira do armazenamento os anexos de casos que deixaram de
 *      existir. O banco enfileira o caminho dentro da transação que apaga a
 *      linha; aqui é onde a fila é drenada de verdade.
 *
 * Quem a chama é o cron da Vercel, uma vez por dia. Ela também roda sozinha
 * depois de salvar ou apagar um roteiro — mas aquilo depende de alguém mexer na
 * tela, e um prazo que só corre quando alguém aparece não é um prazo.
 *
 * A TRANCA. Este endereço apaga dado de cliente. Ele exige `CRON_SECRET` no
 * cabeçalho, e **recusa quando o segredo não está configurado** — porque um
 * endpoint destrutivo que fica aberto quando falta uma variável de ambiente é
 * exatamente o tipo de porta que ninguém percebe estar aberta. Sem segredo, ele
 * responde 503 e não toca em nada.
 */
import { NextResponse } from 'next/server';
import { rpc, temChaveDeServico } from '@/lib/supabase/servico';
import { apagarAnexo } from '@/lib/supabase/arquivo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Relatorio = Record<string, unknown> & { faxina?: Array<{ id: number; caminho: string }> };

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET || '';
  if (!segredo) return false;
  const veio = req.headers.get('authorization') || '';
  /* Comparação de tamanho constante não faz diferença prática aqui — o segredo
     não é adivinhado byte a byte por um endpoint que responde uma vez por dia —
     mas o `===` sobre strings de tamanhos diferentes é o suficiente e é claro. */
  return veio === `Bearer ${segredo}`;
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ erro: 'falta CRON_SECRET' }, { status: 503 });
  }
  if (!autorizado(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  if (!temChaveDeServico) {
    return NextResponse.json({ erro: 'falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  /* `?seco=1` conta sem apagar. É como se confere o que a próxima faxina FARIA,
     e é o primeiro comando a rodar depois de subir isto para produção. */
  const seco = new URL(req.url).searchParams.get('seco') === '1';

  let rel: Relatorio;
  try {
    rel = await rpc<Relatorio>('walkstamp_expurgo', { p_seco: seco });
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e).slice(0, 300) }, { status: 502 });
  }

  /* Os arquivos do balde. Um por um, e o que falhar continua na fila com o
     motivo — uma fila que apaga o que não conseguiu apagar é uma fila que
     mente, e aqui ela está apagando conteúdo de cliente. */
  const orfaos = rel.faxina || [];
  const limpos: number[] = [];
  const falhas: Array<{ caminho: string; erro: string }> = [];
  for (const o of orfaos) {
    try { await apagarAnexo(o.caminho); limpos.push(o.id); }
    catch (e) {
      const erro = String((e as Error)?.message || e).slice(0, 200);
      falhas.push({ caminho: o.caminho, erro });
      await rpc('walkstamp_anexo_faxinado', { p_ids: [o.id], p_erro: erro }).catch(() => {});
    }
  }
  if (limpos.length) {
    await rpc('walkstamp_anexo_faxinado', { p_ids: limpos, p_erro: null }).catch(() => {});
  }

  /* O relatório volta sem a lista de caminhos: ela é endereço de arquivo de
     cliente, e não tem por que aparecer num log de execução. */
  const { faxina: _lista, ...resumo } = rel;
  void _lista;
  return NextResponse.json({
    ...resumo,
    arquivos_apagados: limpos.length,
    arquivos_que_falharam: falhas.length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
