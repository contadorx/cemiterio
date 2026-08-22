/* A tela de controle do roteiro de casos — uma rota do PAINEL da conta.
 *
 * Ela nasceu como página inteira, com largura própria, título próprio e um
 * "← Sua conta" no alto para voltar. Era o desenho certo enquanto a conta era
 * uma página só; virou o errado no dia em que a conta ganhou barra lateral.
 * O sintoma: clicar em `Casos de teste` no menu fazia o menu SUMIR. A pessoa
 * saía do painel sem ter pedido para sair, e o único caminho de volta era um
 * link de texto que ela precisava achar.
 *
 * Agora ela mora dentro da casca, como faturas, chamados e time. Com isso
 * sumiram daqui três coisas que o `carga.tsx` já fazia melhor: a tela de
 * "entre na sua conta", a de "falta a chave de serviço" e o `try/catch` da
 * leitura. Cada uma delas escrita duas vezes é uma que um dia responde
 * diferente da outra.
 *
 * A ferramenta continua sendo página inteira, e isso é de propósito: lá a
 * pessoa está GRAVANDO, e uma barra de menu ao lado de uma captura de tela é
 * distração no momento em que menos cabe.
 *
 * Ela é separada da ferramenta de propósito. A ferramenta é de quem EXECUTA:
 * grava, revisa, baixa. O roteiro é de quem ORGANIZA — e as duas coisas quase
 * nunca acontecem na mesma hora, muitas vezes nem na mesma pessoa. Enfiar a
 * fila dentro do `/app` obrigava quem só ia gravar um vídeo a passar por um
 * bloco que não é dele.
 *
 * O que liga as duas é um LINK: a tela entrega um endereço com o caso já
 * dentro. Quem executa clica, grava, baixa — e volta com um clique que marca o
 * caso como feito. A ferramenta não precisou saber o que é um roteiro.
 *
 * O que esta tela guarda, e o que ela deliberadamente não guarda:
 *
 *   guarda      o caso, o título, o sistema, o chamado, o responsável,
 *               a data, o nome do arquivo e a impressão digital dele
 *   não guarda  o vídeo, os quadros, a transcrição, o documento
 */
import { notFound, redirect } from 'next/navigation';
import type { Conta } from '@/lib/supabase/servico';
import { type Lang, type Textos, CAMINHO, ehLang, preencher, textos } from '@/lib/conta/textos';
import { Envolver, Porta, carregar } from '../carga';
import { type Caso, type Resumo, type Roteiro, CAMINHO_ROTEIRO, linkDoCaso, meusRoteiros, verRoteiro } from '@/lib/conta/roteiro';
import { apagarAnexoDoCaso, apagarRoteiro, atribuirCaso, marcarFeito } from '../../roteiro-acoes';
import { lerRecibo, resumoDoRecibo } from '@/lib/conta/recibo';
import Importar from './Importar';
import Copiar from './Copiar';

export const dynamic = 'force-dynamic';

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES',
                                      de: 'de-DE', fr: 'fr-FR' };
const quando = (lang: Lang, iso: string | null) =>
  iso ? new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

export default async function Pagina({ params, searchParams }: PageProps<'/conta/[lang]/roteiro'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const q = await searchParams;
  const um = (n: string) => (typeof q[n] === 'string' ? (q[n] as string) : null);

  /* Sem sessão, sem chave ou com o banco mudo, quem sabe explicar é a raiz do
     painel — e ela já explica, com as mesmas palavras para as cinco rotas.
     Repetir as três telas de recusa aqui era ter uma quarta versão delas.
     
     COM UMA EXCEÇÃO, e ela tem motivo. Quando a pessoa volta da ferramenta com
     `?marcar=…`, o endereço carrega coisas que não existem em nenhum outro
     lugar: o nome do arquivo que ela acabou de gerar, a impressão digital das
     telas e o recibo. Mandá-la para a raiz do painel jogaria tudo isso fora, e
     a única forma de recuperar seria gerar o documento de novo. Então aqui o
     endereço FICA de pé, dizendo o que falta — e recarregar depois de entrar
     retoma exatamente de onde parou. */
  const carga = await carregar();
  const marcar = Number(um('marcar')) || null;
  if (carga.estado === 'semChave' || carga.estado === 'erro') redirect(CAMINHO[lang]);
  if (carga.estado !== 'ok') {
    /* Sem sessão, a tela mostra o MENU e o que este item faz — e não some. Um
       recurso que a pessoa nunca viu não é desejado, e mandá-la para uma caixa
       de e-mail sem dizer o que ela ganha ao entrar é o mesmo que escondê-lo. */
    if (!marcar) {
      return (
        <Envolver lang={lang} t={t} slug="roteiro" carga={carga}>
          <h1 className="soLeitor">{t.rotTitulo}</h1>
          <Porta lang={lang} t={t} motivo="fora" titulo={t.rotTitulo} texto={t.pitchRoteiro} />
        </Envolver>
      );
    }
    return (
      <section style={{ paddingTop: 40 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <h1>{t.rotTitulo}</h1>
          <p className="lead">{t.rotEntreLead}</p>
          {/* "Não feche esta aba" não é frescura: é a instrução que salva o
              recibo. Entrar abre outra aba; esta é a que tem o endereço. */}
          <p className="small muted">{t.rotVoltaGuarde}</p>
          <p><a className="btn" href={CAMINHO[lang]} target="_blank" rel="noreferrer">{t.entrarBotao}</a></p>
        </div>
      </section>
    );
  }

  return (
    <Envolver lang={lang} t={t} slug="roteiro" carga={carga}>
      {/* O título visível é o do bloco de conteúdo. Mas a página precisa de um
          `h1`: sem ele, quem navega por cabeçalhos com leitor de tela cai num
          documento que começa no meio. */}
      <h1 className="soLeitor">{t.rotTitulo}</h1>
      {um('erro') && <p className="aviso err">{um('erro')}</p>}
      {um('feito') && <p className="aviso ok">{um('feito')}</p>}
      <Tela conta={carga.conta} email={carga.email} lang={lang} t={t}
            id={Number(um('id')) || null}
            marcar={marcar}
            arq={um('arq')} imp={um('imp')} rec={um('rec')} />
    </Envolver>
  );
}

/* ------------------------------------------------------------------- tela */

async function Tela(
  { conta, email, lang, t, id, marcar, arq, imp, rec }:
  { conta: Conta; email: string; lang: Lang; t: Textos; id: number | null; marcar: number | null;
    arq: string | null; imp: string | null; rec: string | null },
) {
  /* A conta chega pronta, lida uma vez pelo `carga.tsx` que a barra lateral já
     usou para montar o menu. Ler de novo aqui seria a segunda viagem ao banco
     na mesma tela — e as duas leituras podendo discordar sobre o plano, que é
     justamente o que decide o que aparece logo abaixo. */

  /* A trava do plano é uma PORTA, não um muro: a tela existe, diz o que o
     recurso faz e onde ele mora. Tela em branco com um cadeado é
     indistinguível de defeito. */
  if (!conta.plano || conta.motivo === 'suspensa') {
    return (
      <>
        <p className="lead">{t.rotVendaLead}</p>
        <ul>
          {[t.rotVenda1, t.rotVenda2, t.rotVenda3].map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p><a className="btn" href={lang === 'pt' ? '/precos' : `/${lang}/${lang === 'en' ? 'pricing' : 'precios'}`}>
          {t.rotVerPlanos}
        </a></p>
      </>
    );
  }

  const ehAdmin = conta.papel === 'admin' && Boolean(conta.time);
  const pessoas = (conta.time?.pessoas || []).filter((p) => p.ativo).map((p) => p.email);

  let lista: Resumo[] = [];
  try {
    lista = (await meusRoteiros(email)).roteiros || [];
  } catch { /* a lista vazia já diz o suficiente; o erro real aparece ao salvar */ }

  const escolhido = id ?? lista[0]?.id ?? null;
  let atual: Roteiro | null = null;
  if (escolhido) {
    try {
      const r = await verRoteiro(email, escolhido);
      if (!r?.erro) atual = r;
    } catch { /* idem */ }
  }

  return (
    <>
      {/* A volta da ferramenta: o caso foi executado, o documento baixou, e o
          link de retorno trouxe o nome do arquivo e a impressão das telas.
          Marcar é um POST, e não o próprio link — endereço que muda dado é
          endereço que o histórico do navegador reexecuta sozinho. */}
      {marcar && <Voltando lang={lang} t={t} casoId={marcar} arq={arq} imp={imp} rec={rec} />}

      <Listas lista={lista} escolhido={escolhido} lang={lang} t={t} />
      {atual && <Detalhe r={atual} email={email} lang={lang} t={t} ehAdmin={ehAdmin} pessoas={pessoas} />}
      <Importar lang={lang} t={t} podeTime={ehAdmin} />
      <p className="small muted">{t.rotPrivacidade}</p>
    </>
  );
}

function Voltando(
  { lang, t, casoId, arq, imp, rec }:
  { lang: Lang; t: Textos; casoId: number; arq: string | null; imp: string | null; rec: string | null },
) {
  /* O recibo já veio no link. Mostrar o que ele contém ANTES de gravar é o que
     transforma "clique aqui" numa escolha: a pessoa vê que são números e não
     imagens, e vê a diferença para o anexo logo abaixo. */
  const r = resumoDoRecibo(lerRecibo(rec));
  return (
    <div className="card" style={{ marginBottom: 24, borderColor: 'var(--brand, #3b5bdb)' }}>
      <h2 style={{ marginTop: 0 }}>{t.rotVoltandoTitulo}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        {arq ? preencher(t.rotVoltandoArq, { arquivo: arq }) : t.rotVoltandoSemArq}
        {imp ? ` · ${t.rotImpressao} ${imp}` : ''}
      </p>
      {r && (
        <p className="small" style={{ margin: '0 0 12px' }}>
          <b>{t.rotRecibo}:</b>{' '}
          {preencher(t.rotReciboDe, { quadros: r.quadros, impressao: r.impressao || '—' })}
          {r.hashes > 0 && ` · ${preencher(t.rotReciboHashes, { quantos: r.hashes })}`}
        </p>
      )}
      <form action={marcarFeito} encType="multipart/form-data" style={{ display: 'grid', gap: 12 }}>
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="caso_id" value={casoId} />
        <input type="hidden" name="arquivo" value={arq || ''} />
        <input type="hidden" name="impressao" value={imp || ''} />
        <input type="hidden" name="recibo" value={rec || ''} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input name="observacao" placeholder={t.rotObservacaoPlaceholder}
                 aria-label={t.rotObservacao} style={{ minWidth: 240 }} />
        </div>

        {/* O anexo é a única coisa deste produto que guarda conteúdo do cliente
            num servidor nosso. Por isso ele é opcional, vem desmarcado, e o
            aviso do que ele significa está do lado do campo — e não numa página
            de termos que ninguém abre no meio de uma rodada de testes. */}
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>{t.rotAnexoCampo}</summary>
          <p className="small muted" style={{ margin: '8px 0' }}>{t.rotAnexoAviso}</p>
          <input type="file" name="anexo" accept=".json,application/json" />
        </details>

        <div><button className="btn" type="submit">{t.rotMarcarBotao}</button></div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------ personal vs time */

function Listas({ lista, escolhido, lang, t }: { lista: Resumo[]; escolhido: number | null; lang: Lang; t: Textos }) {
  /* Os dois grupos são separados na tela porque são duas coisas diferentes, e
     misturá-las é o que fazia ninguém saber quem enxerga o quê: um roteiro
     "só meu" não aparece para o time, e um "do time" aparece para todo mundo
     que tem assento. Ver os dois numa lista só é ver a mesma linha significar
     duas coisas. */
  const meus = lista.filter((r) => r.escopo === 'personal');
  const time = lista.filter((r) => r.escopo === 'time');
  if (!lista.length) {
    return <p className="lead" style={{ marginBottom: 24 }}>{t.rotVazio}</p>;
  }
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <Grupo tit={t.rotGrupoMeus} sub={t.rotGrupoMeusSub} itens={meus} escolhido={escolhido} lang={lang} t={t} />
      <Grupo tit={t.rotGrupoTime} sub={t.rotGrupoTimeSub} itens={time} escolhido={escolhido} lang={lang} t={t} />
    </div>
  );
}

function Grupo(
  { tit, sub, itens, escolhido, lang, t }:
  { tit: string; sub: string; itens: Resumo[]; escolhido: number | null; lang: Lang; t: Textos },
) {
  if (!itens.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 19 }}>{tit}</h2>
      <p className="small muted" style={{ margin: '0 0 8px' }}>{sub}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {itens.map((r) => (
          <li key={r.id} style={{
            padding: '7px 10px', borderRadius: 8,
            background: r.id === escolhido ? 'var(--panel, #f4f4f8)' : undefined,
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline',
          }}>
            <a href={`${CAMINHO_ROTEIRO[lang]}?id=${r.id}`}><b>{r.nome}</b></a>
            <span className="small muted">
              {preencher(t.rotContagem, { feitos: r.feitos, total: r.total })}
              {r.escopo === 'time' && r.meus > 0 ? ` · ${preencher(t.rotSeus, { quantos: r.meus })}` : ''}
              {!r.meu ? ` · ${preencher(t.rotDe, { dono: r.dono })}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- detalhe */

function Detalhe(
  { r, email, lang, t, ehAdmin, pessoas }:
  { r: Roteiro; email: string; lang: Lang; t: Textos; ehAdmin: boolean; pessoas: string[] },
) {
  const feitos = r.casos.filter((c) => c.feito_em).length;
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{r.nome}</h2>
        <span className="small muted">
          {r.escopo === 'time' ? t.rotEscopoTime : t.rotEscopoPersonal}
          {' · '}{preencher(t.rotContagem, { feitos, total: r.casos.length })}
        </span>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        {/* As larguras são declaradas. Sem elas o navegador dá à coluna do caso a
            sobra do que os botões não usaram, e "Emitir a segunda via da fatura"
            — que é o texto que a pessoa lê para saber o que fazer — quebra em
            três linhas ao lado de espaço vazio. */}
        <table className="legal" style={{ tableLayout: 'fixed', minWidth: 860 }}>
          <colgroup>
            <col style={{ width: r.escopo === 'time' ? '26%' : '34%' }} />
            {r.escopo === 'time' && <col style={{ width: '18%' }} />}
            <col style={{ width: '18%' }} />
            <col style={{ width: r.escopo === 'time' ? '20%' : '28%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead><tr>
            <th>{t.rotCampoCaso}</th>
            {r.escopo === 'time' && <th>{t.rotCampoResponsavel}</th>}
            <th>{t.rotColSit}</th>
            <th>{t.rotProva}</th>
            <th style={{ textAlign: 'right' }}>{t.rotAcoes}</th>
          </tr></thead>
          <tbody>
            {r.casos.map((c) => (
              <Linha key={c.id} c={c} r={r} email={email} lang={lang} t={t}
                     ehAdmin={ehAdmin} pessoas={pessoas} />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <a className="btn ghost" href={`/conta/planilha?id=${r.id}&lang=${lang}`}>{t.rotBaixarPlanilha}</a>
        {/* Apagar é do dono, e o botão só existe para ele: oferecer e recusar
            depois é ensinar que os botões daqui mentem. */}
        {r.meu && (
          <form action={apagarRoteiro}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="id" value={r.id} />
            <button className="btn ghost" type="submit">{t.rotApagarBotao}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/* Uma linha do roteiro.
 *
 * A tabela é `table-layout: fixed`, e isso muda a regra de quem não cabe: em
 * vez de empurrar a coluna, o que sobra VAZA por cima da vizinha. Foi assim que
 * o botão "Atribuir" apareceu escrito em cima da data de execução do caso ao
 * lado. Por isso tudo aqui dentro quebra linha em vez de esticar. */
function tamanho(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Prova({ c, lang, t }: { c: Caso; lang: Lang; t: Textos }) {
  const r = resumoDoRecibo(c.recibo as Parameters<typeof resumoDoRecibo>[0]);
  if (!r && !c.anexo) return <span className="muted small">—</span>;
  return (
    <div className="small">
      {r ? (
        <div style={{ marginBottom: c.anexo ? 8 : 0 }}>
          <b>{t.rotRecibo}</b>
          <div className="muted" style={{ wordBreak: 'break-all' }}>
            {preencher(t.rotReciboDe, { quadros: r.quadros, impressao: r.impressao || '—' })}
          </div>
          {r.hashes > 0 && (
            <div className="muted">{preencher(t.rotReciboHashes, { quantos: r.hashes })}</div>
          )}
        </div>
      ) : (
        <div className="muted" style={{ marginBottom: c.anexo ? 8 : 0 }}>{t.rotSemRecibo}</div>
      )}

      {c.anexo && (
        <div>
          <b>{t.rotAnexo}</b>
          <div className="muted" style={{ wordBreak: 'break-all' }}>
            {c.anexo.nome} · {tamanho(c.anexo.bytes)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <a className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }}
               href={`/conta/anexo?caso=${c.id}&lang=${lang}`}>{t.rotAnexoBaixar}</a>
            <form action={apagarAnexoDoCaso}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="caso_id" value={c.id} />
              <button className="btn ghost" type="submit" style={{ padding: '2px 8px', fontSize: 12 }}>
                {t.rotAnexoApagarBtn}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha(
  { c, r, email, lang, t, ehAdmin, pessoas }:
  { c: Caso; r: Roteiro; email: string; lang: Lang; t: Textos; ehAdmin: boolean; pessoas: string[] },
) {
  const meu = (c.responsavel || '').toLowerCase() === email;
  return (
    <tr style={meu && r.escopo === 'time' ? { background: 'var(--panel, #f4f4f8)' } : undefined}>
      <td>
        <b>{c.caso}</b>
        {c.titulo && <div className="small muted">{c.titulo}</div>}
        {(c.sistema || c.chamado) && (
          <div className="small muted">{[c.sistema, c.chamado].filter(Boolean).join(' · ')}</div>
        )}
      </td>

      {r.escopo === 'time' && (
        <td>
          {ehAdmin ? (
            <form action={atribuirCaso}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="caso_id" value={c.id} />
              <select name="para" defaultValue={c.responsavel || ''}
                      style={{ padding: '3px 6px', fontSize: 12.5, width: '100%', minWidth: 0 }}>
                <option value="">{t.rotSemResponsavel}</option>
                {pessoas.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="btn ghost" type="submit" style={{ padding: '3px 9px', fontSize: 12.5 }}>
                {t.rotAtribuirBotao}
              </button>
            </form>
          ) : (
            <span className="small">{c.responsavel || <span className="muted">{t.rotSemResponsavel}</span>}</span>
          )}
        </td>
      )}

      <td>
        {c.feito_em ? (
          <span style={{ color: 'var(--ok, #1f9d55)' }}>
            <span style={{ whiteSpace: 'nowrap' }}>✓ {quando(lang, c.feito_em)}</span>
            {c.feito_por && c.feito_por.toLowerCase() !== email && <div className="small muted">{c.feito_por}</div>}
            {c.arquivo && <div className="small muted" style={{ wordBreak: 'break-all' }}>{c.arquivo}</div>}
            {c.impressao && <div className="small muted" style={{ wordBreak: 'break-all' }}>{t.rotImpressao} {c.impressao}</div>}
          </span>
        ) : <span className="muted">—</span>}
      </td>

      {/* A prova: o recibo (números, sem imagem) e o anexo (o .json completo,
          com os quadros dentro). Os dois aparecem descritos, e o anexo tem o
          botão que o apaga de verdade — do balde, não só da linha. */}
      <td>
        <Prova c={c} lang={lang} t={t} />
      </td>

      <td style={{ textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!c.feito_em && (
            <Copiar href={linkDoCaso(c, lang)} abrir={t.rotAbrirCaso}
                    copiar={t.rotCopiar} copiado={t.rotCopiado} />
          )}
          <form action={marcarFeito}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="caso_id" value={c.id} />
            <input type="hidden" name="desfazer" value={c.feito_em ? '1' : '0'} />
            <button className="btn ghost" type="submit" style={{ padding: '3px 9px', fontSize: 12.5 }}>
              {c.feito_em ? t.rotDesfazerBotao : t.rotFeitoBotao}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
