/* As peças do back-office: os números, as tabelas e as barras.
 *
 * Elas ficam separadas das páginas pelo mesmo motivo que as seções da conta
 * ficaram: uma página é sobre CARREGAR e DECIDIR (quem é, pode ver, redireciona
 * se não); uma peça é sobre DESENHAR. Misturadas, mexer no desenho de uma
 * tabela obriga a reler a checagem de permissão que está logo acima dela.
 *
 * Nenhuma peça faz consulta. Todas recebem o mesmo objeto — a leitura única do
 * `walkstamp_negocio_painel`. É o que impede o radar dizer "3 clientes ativos"
 * enquanto a lista ao lado mostra 4 porque foram lidos em segundos diferentes.
 */
import type { Painel } from '@/lib/supabase/servico';
import type { Lang } from '@/lib/conta/textos';
import { responder } from './acoes';

/* ---------------------------------------------------------------- formatos */

/** Dinheiro sai do banco em centavos, inteiro, de propósito — quem guarda
 *  dinheiro em `float` acaba com R$ 149,00 virando 148,99999999999997. */
export function dinheiro(centavos: number, moeda = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: (moeda || 'BRL').toUpperCase(),
  }).format((centavos || 0) / 100);
}

export function data(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "há 3 dias". O número cru de uma data ISO não responde a pergunta que se faz
 *  olhando um chamado aberto, que é há quanto tempo ele está assim. */
export function faz(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const d = Math.floor(ms / 86400000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? 'há 1 mês' : `há ${m} meses`;
}

/* ------------------------------------------------------------------ número */

export function Num({ rotulo, valor, nota, alerta }: {
  rotulo: string; valor: string; nota?: string; alerta?: boolean;
}) {
  return (
    <div className={alerta ? 'negNum alerta' : 'negNum'}>
      <span className="negNumRot">{rotulo}</span>
      <strong>{valor}</strong>
      {nota && <span className="negNumNota">{nota}</span>}
    </div>
  );
}

/** Uma barra por linha, proporcional ao maior. Um gráfico de verdade custaria
 *  uma biblioteca e JavaScript numa área que hoje não manda nenhum. */
export function Barras({ titulo, itens, vazio }: {
  titulo: string; itens: Array<{ chave: string; n: number }>; vazio: string;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.n));
  return (
    <div>
      <p className="subTit">{titulo}</p>
      {itens.length === 0 ? (
        <p className="small muted">{vazio}</p>
      ) : (
        <ul className="negBarras">
          {itens.map((i) => (
            <li key={i.chave}>
              <span className="negBarraNome">{i.chave}</span>
              <span className="negBarraTrilho">
                <span className="negBarraCheia" style={{ width: `${(i.n / maior) * 100}%` }} />
              </span>
              <span className="negBarraN">{i.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- radar */

export function Radar({ d }: { d: Painel; lang?: Lang }) {
  const r = d.resumo;
  /* O assento pago e parado é a conversa mais útil que este painel puxa: é
     dinheiro que já entrou e valor que não está sendo entregue — o que aparece
     depois como não-renovação, e aí é tarde. */
  const parados = Math.max(0, (r.assentosVendidos || 0) - (r.assentosUsados || 0));

  /* A lista de atenção é montada aqui, e não escrita: um aviso que depende de
     alguém lembrar de escrevê-lo é um aviso que não vai existir no dia em que
     importar. */
  const atencao: string[] = [];
  if (r.nVencidas > 0) {
    atencao.push(`${r.nVencidas} fatura(s) vencida(s), somando ${dinheiro(r.vencido)}.`);
  }
  if (r.chamadosParados > 0) {
    atencao.push(`${r.chamadosParados} chamado(s) sem resposta há mais de 3 dias.`);
  }
  if (parados > 0) {
    atencao.push(`${parados} assento(s) pagos e sem ninguém dentro.`);
  }
  if (r.interesse30 > 0) {
    atencao.push(`${r.interesse30} pessoa(s) pediram aviso nos últimos 30 dias e ainda não viraram conta.`);
  }
  if (d.nps.total >= 10 && d.nps.nps !== null && d.nps.nps < 0) {
    atencao.push(`NPS negativo (${d.nps.nps}) em ${d.nps.total} respostas — há mais detratores que promotores.`);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Dinheiro</h2>
        <div className="negNums">
          <Num rotulo="Recebido" valor={dinheiro(r.pago)} />
          <Num rotulo="Em aberto" valor={dinheiro(r.aberto)} />
          <Num rotulo="Vencido" valor={dinheiro(r.vencido)}
               nota={`${r.nVencidas} fatura(s)`} alerta={r.nVencidas > 0} />
          <Num rotulo="Assentos" valor={`${r.assentosUsados} / ${r.assentosVendidos}`}
               nota={parados > 0 ? `${parados} parado(s)` : 'todos ocupados'}
               alerta={parados > 0} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Gente</h2>
        <div className="negNums">
          <Num rotulo="Contas" valor={String(r.contas)} nota={`${r.contas30} nos últimos 30 dias`} />
          <Num rotulo="Clientes ativos" valor={String(r.clientesAtivos)} nota={`${r.clientes} no total`} />
          <Num rotulo="Chamados abertos" valor={String(r.chamadosAbertos)}
               nota={`${r.chamadosTotal} desde sempre`} alerta={r.chamadosParados > 0} />
          <Num rotulo="Pediram aviso" valor={String(r.interesse)} nota={`${r.interesse30} nos últimos 30 dias`} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Uso</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          O que as pessoas realmente geram. É o número que decide o roteiro do
          produto — que formato paga a própria manutenção, e em que idioma.
        </p>
        <div className="negNums" style={{ marginBottom: 18 }}>
          <Num rotulo="Documentos (30 dias)" valor={String(r.eventos30)} />
          <Num rotulo="Licenças emitidas (30 dias)" valor={String(r.emissoes30)} />
        </div>
        <div className="negTrio">
          <Barras titulo="Por formato (90 dias)" itens={d.uso.formato} vazio="Nada gerado ainda." />
          <Barras titulo="Por idioma (90 dias)" itens={d.uso.idioma} vazio="Nada gerado ainda." />
          <Barras titulo="Por origem (90 dias)" itens={d.uso.origem} vazio="Nada gerado ainda." />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>NPS</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Sai das notas de 0 a 10 que a caixinha do site coleta — que já é a
          escala do NPS de verdade, e não uma de 1 a 5 travestida. Promotores são
          9 e 10, detratores 0 a 6; quem está em 7 e 8 não entra na conta, e é
          assim que o índice foi definido.
        </p>
        {d.nps.total === 0 ? (
          <p className="small muted">Nenhuma nota ainda.</p>
        ) : (
          <>
            <div className="negNums">
              <Num rotulo="NPS" valor={d.nps.nps === null ? '—' : String(d.nps.nps)}
                   nota={`${d.nps.total} resposta(s)`}
                   alerta={d.nps.nps !== null && d.nps.nps < 0} />
              <Num rotulo="Nota média" valor={d.nps.media === null ? '—' : String(d.nps.media)} />
              <Num rotulo="Promotores" valor={String(d.nps.promotores)} nota="9 e 10" />
              <Num rotulo="Detratores" valor={String(d.nps.detratores)} nota="0 a 6"
                   alerta={d.nps.detratores > d.nps.promotores} />
            </div>
            {/* Com menos de dez respostas o índice não diz nada, e mostrá-lo sem
                esta ressalva é convidar a decidir roteiro de produto em cima de
                três pessoas. */}
            {d.nps.total < 10 && (
              <p className="small muted" style={{ marginTop: 12 }}>
                São {d.nps.total} respostas. Abaixo de umas dez, este número
                oscila muito com uma nota só — olhe a distribuição, não o índice.
              </p>
            )}
            <div style={{ marginTop: 16 }}>
              <Barras titulo="Distribuição das notas" itens={d.nps.faixas} vazio="—" />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Precisa de você</h2>
        {atencao.length === 0 ? (
          <p className="small muted">
            Nada vencido, nada parado, nenhum assento ocioso. Esta caixa fica
            vazia quando está tudo em dia — e é para ficar mesmo.
          </p>
        ) : (
          <ul className="lista">
            {atencao.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ contas */

export function Contas({ d }: { d: Painel; lang?: Lang }) {
  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Clientes</h2>
        {d.clientes.length === 0 ? (
          <p className="small muted">Nenhum cliente ainda.</p>
        ) : (
          <table className="legal">
            <thead>
              <tr><th>Cliente</th><th>Plano</th><th>Assentos</th><th>Recebido</th><th>Em aberto</th><th>Desde</th></tr>
            </thead>
            <tbody>
              {d.clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.nome || '—'}
                    {!c.ativo && <span className="muted small"> · encerrado</span>}
                    {c.stripe && <span className="muted small"> · Stripe</span>}
                  </td>
                  <td>{c.plano || '—'}</td>
                  <td>{c.usados} / {c.assentos ?? '—'}</td>
                  <td>{dinheiro(c.pago)}</td>
                  <td>{c.aberto > 0 ? dinheiro(c.aberto) : '—'}</td>
                  <td>{data(c.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Contas</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Uma linha por e-mail que já entrou. `Último uso` é o que separa uma
          conta viva de um cadastro — e é a coluna que diz para quem vale a pena
          escrever antes de a licença vencer.
        </p>
        {d.contas.length === 0 ? (
          <p className="small muted">Nenhuma conta ainda.</p>
        ) : (
          <table className="legal">
            <thead>
              <tr><th>E-mail</th><th>Plano</th><th>Cliente</th><th>Documentos</th><th>Último uso</th><th>Vence</th></tr>
            </thead>
            <tbody>
              {d.contas.map((c) => (
                <tr key={c.email}>
                  <td>
                    {c.email}
                    {!c.ativo && <span className="muted small"> · inativa</span>}
                  </td>
                  <td>{c.plano || '—'}</td>
                  <td>{c.cliente || '—'}</td>
                  <td>{c.emissoes ?? 0}</td>
                  <td>{faz(c.ultima_em)}</td>
                  <td>{data(c.vence_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- cobranças */

export function Cobrancas({ d }: { d: Painel; lang?: Lang }) {
  /* Vencidas primeiro. Ordenar por data seria o padrão e estaria errado: a
     razão de abrir esta tela é achar o que não foi pago, e ele estaria no meio
     da lista, indistinguível. */
  const linhas = [...d.faturas].sort((a, b) => Number(b.atrasada) - Number(a.atrasada));
  const r = d.resumo;
  return (
    <div className="card">
      <h2>Cobranças</h2>
      <div className="negNums" style={{ marginBottom: 18 }}>
        <Num rotulo="Recebido" valor={dinheiro(r.pago)} />
        <Num rotulo="Em aberto" valor={dinheiro(r.aberto)} />
        <Num rotulo="Vencido" valor={dinheiro(r.vencido)} nota={`${r.nVencidas} fatura(s)`}
             alerta={r.nVencidas > 0} />
      </div>
      {linhas.length === 0 ? (
        <p className="small muted">Nenhuma fatura emitida ainda.</p>
      ) : (
        <table className="legal">
          <thead>
            <tr><th>Fatura</th><th>Cliente</th><th>Valor</th><th>Situação</th><th>Vence</th><th>Nota fiscal</th></tr>
          </thead>
          <tbody>
            {linhas.map((f, i) => (
              <tr key={f.numero || i}>
                <td>{f.numero || '—'}</td>
                <td>{f.cliente || '—'}</td>
                <td>{dinheiro(f.valor, f.moeda)}</td>
                <td>
                  {f.status === 'paga'
                    ? <>paga <span className="muted small">· {data(f.pago_em)}</span></>
                    : f.atrasada
                      ? <b style={{ color: 'var(--vermelho, #C0392B)' }}>vencida</b>
                      : f.status}
                </td>
                <td>{data(f.vence_em)}</td>
                <td>
                  {f.nf_url
                    ? <a href={f.nf_url} target="_blank" rel="noreferrer">{f.nf_numero || 'abrir'}</a>
                    : (f.nf_numero || '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- chamados */

export function Chamados({ d, lang }: { d: Painel; lang: Lang }) {
  /* Sem resposta primeiro, e dentro disso o mais velho no topo: a fila que
     importa é a de quem está esperando há mais tempo, não a do que chegou
     por último. */
  const linhas = [...d.chamados].sort((a, b) => {
    const abertoA = a.resposta ? 1 : 0;
    const abertoB = b.resposta ? 1 : 0;
    if (abertoA !== abertoB) return abertoA - abertoB;
    return abertoA === 0
      ? new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
      : new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });
  return (
    <div className="card">
      <h2>Chamados</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Tudo que chegou pela ferramenta e pelo site: erro, elogio, dúvida e nota.
        Os sem resposta ficam no topo, do mais antigo para o mais novo.
      </p>
      {linhas.length === 0 ? (
        <p className="small muted">Nenhum chamado ainda.</p>
      ) : (
        <ul className="negLista">
          {linhas.map((c, i) => (
            <li key={c.numero || i} className={c.resposta ? undefined : 'aberto'}>
              <div className="negListaTopo">
                <b>{c.numero || '—'}</b>
                <span className="badge">{c.tipo || 'recado'}</span>
                {typeof c.nota === 'number' && <span className="badge">nota {c.nota}</span>}
                {c.idioma && <span className="muted small">{c.idioma}</span>}
                {c.cenario && <span className="muted small">· {c.cenario}</span>}
                <span className="muted small">· {faz(c.criado_em)}</span>
                {!c.resposta && <span className="badge alerta">sem resposta</span>}
              </div>
              {c.texto && <p className="small" style={{ margin: '6px 0 0' }}>{c.texto}</p>}
              {c.email && (
                <p className="small muted" style={{ margin: '4px 0 0' }}>
                  <a href={`mailto:${c.email}`}>{c.email}</a>
                </p>
              )}
              {c.diagnostico && (
                <details style={{ marginTop: 6 }}>
                  <summary className="small muted">Diagnóstico</summary>
                  <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{c.diagnostico}</pre>
                </details>
              )}
              {c.resposta && (
                <p className="small" style={{ margin: '8px 0 0', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                  <span className="muted">respondido {faz(c.respondido_em)}:</span> {c.resposta}
                </p>
              )}
              {/* Responder aqui dentro, e não pelo e-mail.
                  Pelo e-mail a resposta existe na caixa de duas pessoas e em
                  lugar nenhum do produto: a própria pessoa, que abre
                  `/conta/chamados` para ver, continua vendo "sem resposta".
                  Gravar aqui é o que faz o chamado ficar respondido dos dois
                  lados. O e-mail continua sendo um link, para quando a conversa
                  precisar de ida e volta. */}
              {!c.resposta && c.numero && (
                <form action={responder} style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="numero" value={c.numero} />
                  {/* O idioma de quem ESCREVEU, para o aviso sair na língua
                      dele — e não na do painel, que é sempre português. */}
                  <input type="hidden" name="idioma" value={c.idioma || 'pt'} />
                  <textarea name="texto" rows={3} required
                            placeholder="Responder a este chamado"
                            aria-label={`Responder ao chamado ${c.numero}`} />
                  <div><button className="btn" type="submit">Responder</button></div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- interesse */

export function Interesse({ d }: { d: Painel; lang?: Lang }) {
  /* Quem já virou conta some da lista: um "pediu aviso" que já entrou não é
     conversão pendente, é ruído — e ruído numa lista de contato é o jeito mais
     rápido de escrever para a pessoa errada. */
  const jaTem = new Set(d.contas.map((c) => c.email.trim().toLowerCase()));
  const esperando = d.interesse.filter((i) => !jaTem.has(i.email.trim().toLowerCase()));
  const viraram = d.interesse.length - esperando.length;
  return (
    <div className="card">
      <h2>Interesse</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Quem pediu para ser avisado. {viraram > 0
          ? `${viraram} já viraram conta e saíram desta lista.`
          : 'Ninguém desta lista virou conta ainda.'}
      </p>
      {esperando.length === 0 ? (
        <p className="small muted">Ninguém esperando.</p>
      ) : (
        <>
          <table className="legal">
            <thead><tr><th>E-mail</th><th>Idioma</th><th>Quando</th></tr></thead>
            <tbody>
              {esperando.map((i) => (
                <tr key={i.email}>
                  <td><a href={`mailto:${i.email}`}>{i.email}</a></td>
                  <td>{i.idioma || '—'}</td>
                  <td>{faz(i.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Um `mailto` com todo mundo em cópia oculta é o único jeito de
              escrever para esta lista sem construir um disparador — e um
              disparador que ninguém pediu é a próxima coisa a apodrecer. */}
          <p style={{ marginTop: 14 }}>
            <a className="btn ghost"
               href={`mailto:?bcc=${encodeURIComponent(esperando.map((i) => i.email).join(','))}`}>
              Escrever para os {esperando.length} em cópia oculta
            </a>
          </p>
        </>
      )}
    </div>
  );
}
