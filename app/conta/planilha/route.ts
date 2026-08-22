/* A planilha de volta.
 *
 * O roteiro entrou como planilha e sai como planilha, com as colunas do que foi
 * feito acrescentadas: situação, quando, quem, arquivo e impressão. É o formato
 * em que a informação circula na empresa — quem coordena cola isso num relatório
 * e acabou.
 *
 * A rota é estática (`/conta/planilha`) de propósito: rota estática ganha da
 * dinâmica `/conta/[lang]` no Next, então ela não precisa de ponte no
 * `next.config` para existir em três idiomas. O idioma vem na busca e decide só
 * o nome das colunas.
 */
import { NextResponse } from 'next/server';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { verRoteiro } from '@/lib/conta/roteiro';
import { montarXlsx } from '@/lib/planilha';
import { ehLang, textos } from '@/lib/conta/textos';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const lang = ehLang(u.searchParams.get('lang') || '') ? u.searchParams.get('lang')! as 'pt' | 'en' | 'es' : 'pt';
  const t = textos(lang);
  const id = Number(u.searchParams.get('id'));

  const email = await emailDaSessao();
  if (!email) return new NextResponse(t.erroEntrePrimeiro, { status: 401 });
  if (!id) return new NextResponse(t.rotErroSumiu, { status: 400 });

  const r = await verRoteiro(email, id).catch(() => null);
  /* Quem não pode ver não pode baixar, e a recusa é a mesma dos dois lados:
     o banco já respondeu `sem_acesso` antes de a linha chegar aqui. */
  if (!r || r.erro) return new NextResponse(t.rotErroSemAcesso, { status: 403 });

  const cab = [
    t.rotCampoCaso, t.rotCampoTitulo, t.rotCampoSistema, t.rotCampoChamado,
    t.rotCampoResponsavel, t.rotColSit, t.rotColQuando, t.rotColQuem,
    t.rotColArq, t.rotColImp, t.rotObservacao,
  ];
  const linhas = [cab].concat(r.casos.map((c) => [
    c.caso, c.titulo || '', c.sistema || '', c.chamado || '', c.responsavel || '',
    c.feito_em ? t.rotFeitoSit : '',
    c.feito_em ? c.feito_em.slice(0, 16).replace('T', ' ') : '',
    c.feito_por || '', c.arquivo || '', c.impressao || '', c.observacao || '',
  ]));

  /* O nome do arquivo vai duas vezes, e isso não é redundância. Um cabeçalho
     HTTP só carrega ASCII: "Regressão de agosto" com o "ã" cru faz o navegador
     descartar o cabeçalho inteiro e salvar o arquivo como "download", sem
     extensão. O `filename=` leva a versão sem acento, para quem for velho, e o
     `filename*=` leva a de verdade, em UTF-8. */
  const limpo = (r.nome || 'roteiro').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 60) || 'roteiro';
  const ascii = limpo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '') || 'roteiro';
  const bytes = montarXlsx(linhas, r.nome);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}.xlsx"; ` +
        `filename*=UTF-8''${encodeURIComponent(limpo + '.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  });
}
