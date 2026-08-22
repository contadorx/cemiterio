/* As seções do painel da conta.
 *
 * Elas viviam empilhadas numa página só, de 484 linhas: plano, licença,
 * roteiro, faturas, chamados, time, modelos e emissões, todas abertas ao mesmo
 * tempo. Agora cada uma tem a sua rota, e o que estava lá dentro está aqui —
 * MOVIDO, e não reescrito. Uma reorganização de tela que reescreve a lógica
 * junto é duas mudanças disfarçadas de uma, e quando algo quebra não se sabe
 * qual delas foi.
 *
 * O que guarda e o que deliberadamente NÃO guarda continua igual:
 *
 *   guarda      chamado, fatura, assento, licença, logotipo e modelos
 *   não guarda  vídeo, áudio, transcrição e documento
 */
import type { Conta } from '@/lib/supabase/servico';
import { PLANOS, temStripe } from '@/lib/stripe';
import { type Lang, type Textos, preencher } from '@/lib/conta/textos';
import { CAMINHO_ROTEIRO } from '@/lib/conta/roteiro';
import { ajustar, apagarModelo, bloquear, comprar, configurar, convidar, gerenciar } from '../acoes';
import Licenca from './Licenca';

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES',
                                      de: 'de-DE', fr: 'fr-FR' };

const dinheiro = (lang: Lang, centavos: number, moeda: string) =>
  new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: moeda || 'BRL' }).format(centavos / 100);

const data = (lang: Lang, iso: string | null) =>
  iso ? new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'medium' }).format(new Date(iso)) : '—';

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function Plano({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  /* O motivo importa mais que o nome do plano: "teste" e "conta" mostram o
     mesmo `time` e são situações completamente diferentes para quem lê. */
  const legenda: Record<string, string> = {
    conta: t.motivoConta, dominio: t.motivoDominio, teste: t.motivoTeste,
    teste_usado: t.motivoTesteUsado, suspensa: t.motivoSuspensa,
  };
  const nome = conta.plano === 'time' ? t.planoTeam : conta.plano ? t.planoPersonal : t.planoFree;
  const semVenda = !temStripe || !PLANOS.personal.preco();
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.planoTitulo}</h2>
      <p style={{ margin: '6px 0' }}>
        <b>{nome}</b>
        {conta.cliente ? ` · ${conta.cliente}` : ''}
        {conta.assentos > 1 ? ` · ${conta.assentos} ${t.assentos}` : ''}
      </p>
      <p className="small muted">{legenda[conta.motivo] || conta.motivo}</p>
      {conta.motivo === 'teste' && <p className="small muted">{t.degustacao}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {conta.assinante ? (
          <form action={gerenciar}>
            <input type="hidden" name="lang" value={lang} />
            <button className="btn" type="submit">{t.gerenciar}</button>
          </form>
        ) : (
          <>
            <form action={comprar}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="plano" value="personal" />
              <button className="btn" type="submit" disabled={semVenda}>{t.assinarPersonal}</button>
            </form>
            <form action={comprar} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="plano" value="time" />
              <input type="number" name="assentos" min={5} max={500} defaultValue={5}
                     aria-label={t.pessoasAria} style={{ width: 78 }} />
              <button className="btn ghost" type="submit"
                      disabled={!temStripe || !PLANOS.time.preco()}>{t.assinarTeam}</button>
            </form>
          </>
        )}
      </div>
      {semVenda && !conta.assinante && (
        <p className="small muted" style={{ marginTop: 10 }}>{t.vendaDesligada}</p>
      )}
    </div>
  );
}

/* O roteiro de casos tem tela própria, e uma tela própria que ninguém acha é
   uma tela que não existe. Este cartão é o caminho: quem entra na conta vê que
   ela está aqui, e vê o que ela faz antes de clicar. */
export function RoteiroAtalho({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  const pago = Boolean(conta.plano) && conta.motivo !== 'suspensa';
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.rotTitulo}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t.rotImportarTexto}</p>
      <p style={{ marginBottom: 0 }}>
        <a className="btn ghost" href={CAMINHO_ROTEIRO[lang]}>
          {pago ? t.rotTitulo : t.rotVerPlanos}
        </a>
      </p>
    </div>
  );
}

export function Faturas({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.faturasTitulo}</h2>
      {conta.faturas.length === 0 ? (
        <p className="small muted">{t.faturasVazio}</p>
      ) : (
        <table className="legal">
          <thead><tr>
            <th>{t.colNumero}</th><th>{t.colValor}</th><th>{t.colSituacao}</th>
            <th>{t.colData}</th><th>{t.colNota}</th>
          </tr></thead>
          <tbody>
            {conta.faturas.map((f, i) => (
              <tr key={f.numero || i}>
                <td>{f.numero || '—'}</td>
                <td>{dinheiro(lang, f.valor, f.moeda)}</td>
                <td>{f.status}</td>
                <td>{data(lang, f.pago_em || f.criado_em)}</td>
                <td>{f.nf_url ? <a href={f.nf_url}>{f.nf_numero || t.notaBaixar}</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>{t.faturasRodape}</p>
    </div>
  );
}

export function Chamados({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  /* O tempo de resposta só aparece com histórico, e é a média REAL das últimas
     vinte respostas. Um "SLA de 24h" numa operação de uma pessoa fabrica a
     decepção para o dia em que não for cumprido. Três respostas é o mínimo:
     com uma, o número é a última resposta com cara de estatística. */
  const r = conta.resposta;
  const temNumero = !!r && r.quantos >= 3;
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.chamadosTitulo}</h2>
      {temNumero && (
        <p className="small muted">
          {preencher(r!.horas >= 1 ? t.tempoResposta : t.tempoRespostaRapido,
                     { horas: r!.horas, quantos: r!.quantos })}
        </p>
      )}
      {conta.chamados.length === 0 ? (
        <p className="small muted">{t.chamadosVazio}</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {conta.chamados.map((c) => (
            <li key={c.numero} style={{ marginBottom: 12 }}>
              <b>{c.numero}</b> · {c.status} · {data(lang, c.criado_em)}
              <div className="small muted">{c.texto?.slice(0, 220)}</div>
              {c.resposta && (
                <div className="small" style={{ marginTop: 4 }}>
                  <b>{t.chamadoResposta}</b> {c.resposta}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- time */

export function Time({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  const p = conta.time!;
  const cfg = p.config || {};
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.timeTitulo}</h2>
      <p className="small muted">
        {preencher(t.timeUsados, { usados: p.usados ?? 0, assentos: p.assentos ?? conta.assentos })}
        {(p.dominios || []).length ? ` · ${(p.dominios || []).join(', ')}` : ''}
      </p>

      <table className="legal" style={{ marginTop: 12 }}>
        <thead><tr><th>{t.timePessoa}</th><th>{t.timePediu}</th><th>{t.timeVence}</th><th /></tr></thead>
        <tbody>
          {(p.pessoas || []).map((x) => (
            <tr key={x.email}>
              <td style={x.ativo ? undefined : { opacity: 0.55, textDecoration: 'line-through' }}>
                {x.email}
                {x.papel === 'admin' && <span className="muted small"> · {t.timePapelAdmin}</span>}
              </td>
              <td>{data(lang, x.ultima_em)}</td>
              <td>{x.vence_em || '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {/* quem administra não pode se bloquear: a conta ficaria sem
                    dono e sem ninguém que a destrave. O banco recusa também. */}
                {!x.admin && (
                  <form action={bloquear}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="email" value={x.email} />
                    <input type="hidden" name="bloquear" value={x.ativo ? '1' : '0'} />
                    <button className="btn ghost" type="submit" style={{ padding: '4px 10px', fontSize: 13 }}>
                      {x.ativo ? t.timeBloquear : t.timeDesbloquear}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={convidar} style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        <input type="hidden" name="lang" value={lang} />
        <input type="email" name="email" placeholder={t.timeConvidarPlaceholder}
               aria-label={t.timeConvidar} style={{ minWidth: 230 }} />
        <button className="btn ghost" type="submit">{t.timeConvidar}</button>
      </form>

      <form action={ajustar} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        <input type="hidden" name="lang" value={lang} />
        <label className="small" htmlFor="dias">{t.timePrazo}</label>
        <input id="dias" name="dias" type="number" min={1} max={90} defaultValue={p.dias ?? 90} style={{ width: 78 }} />
        <span className="small muted">{t.timeDias}</span>
        <label className="small" htmlFor="assentos">{t.timeAssentos}</label>
        <input id="assentos" name="assentos" type="number" min={1} max={500}
               defaultValue={p.assentos ?? conta.assentos} style={{ width: 78 }} />
        <button className="btn ghost" type="submit">{t.timeSalvar}</button>
      </form>
      <p className="small muted" style={{ marginTop: 14 }}>{t.timeAviso}</p>

      {/* Os PADRÕES do documento saíram daqui e viraram a aba `Modelos`.

          Eles estavam no fim de uma tela cujo assunto é assento: quem entra em
          `Time` vem bloquear alguém ou convidar alguém, e o logotipo da empresa
          ficava depois de tudo isso, onde ninguém rola. São dois assuntos e dois
          momentos — um se mexe quando entra gente, o outro se mexe uma vez e
          vale para sempre. */}
      <Emissoes p={p} lang={lang} t={t} />

      {/* A frase que existia na /time e não podia se perder na mudança: o que
          esta área tem, e o que ela continua não tendo. É a tese do produto
          dita no lugar onde alguém poderia duvidar dela. */}
      <p className="small muted" style={{ marginTop: 18 }}>{t.timeNada}</p>
    </div>
  );
}

/* ---------------------------------------------------------- os PADRÕES ----

   O nome da empresa, o logotipo e a forma de cada saída — aplicados a todo
   mundo do time, sem ninguém ter que lembrar.

   Eles vivem numa aba própria porque são de outro momento: assento se mexe
   quando entra ou sai gente; padrão se acerta uma vez e vale para sempre. No
   fim da tela de assentos, esse acerto ficava abaixo da dobra de uma página que
   ninguém termina de ler. */
export function Padroes({ conta, lang, t }: { conta: Conta; lang: Lang; t: Textos }) {
  const p = conta.time!;
  const cfg = p.config || {};
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 4 }}>{t.timeConfigTitulo}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>{t.timeConfigTexto}</p>
      <Modelos p={p} lang={lang} t={t} />
      <Emissoes p={p} lang={lang} t={t} />

      {/* A frase que existia na /time e não podia se perder na mudança: o que
          esta área tem, e o que ela continua não tendo. É a tese do produto
          dita no lugar onde alguém poderia duvidar dela. */}
      <p className="small muted" style={{ marginTop: 18 }}>{t.timeNada}</p>

      <form action={configurar} style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
        <input type="hidden" name="lang" value={lang} />
        <label className="small">{t.timeEmpresa}
          <input name="empresa" defaultValue={cfg.empresa || ''} style={{ width: '100%' }} />
        </label>
        <label className="small">{t.timeLogo}
          <input name="logo_url" type="url" defaultValue={cfg.logo_url || ''} style={{ width: '100%' }} />
        </label>
        <label className="small">{t.timeRotulo}
          <input name="rotulo" defaultValue={cfg.rotulo || ''} style={{ width: '100%' }} />
        </label>
        <label className="small">{t.timeAmbiente}
          <input name="ambiente" defaultValue={cfg.ambiente || ''} style={{ width: '100%' }} />
        </label>
        <label className="small">{t.timeCenario}
          <select name="cenario" defaultValue={cfg.cenario || ''} style={{ width: '100%' }}>
            <option value="">{t.timeCenarioNenhum}</option>
            <option value="evidencia">evidência</option>
            <option value="instrucao">instrução</option>
            <option value="ata">ata</option>
            <option value="usabilidade">usabilidade</option>
            <option value="ia">contexto para IA</option>
          </select>
        </label>

        {/* O FORMATO. Os campos acima dizem com que cara o documento sai; estes
            dizem com que forma. É a forma que uma empresa padroniza — e é a que
            some no meio de quarenta arquivos quando não está padronizada.
            Continua sendo padrão, e não trava: a ferramenta preenche, e quem
            está com o caso na mão troca se aquele caso pedir outra coisa. */}
        <h4 style={{ margin: '10px 0 0', fontSize: 15 }}>{t.timeFormatoTit}</h4>
        <p className="small muted" style={{ margin: 0 }}>{t.timeFormatoTexto}</p>

        <label className="small">{t.timePapel}
          <select name="papel" defaultValue={cfg.papel || ''} style={{ width: '100%' }}>
            <option value="">{t.timePapelNada}</option>
            <option value="a4">A4</option>
            <option value="letter">Carta / Letter</option>
          </select>
        </label>
        <label className="small">{t.timeLayout}
          <select name="layout" defaultValue={cfg.layout || ''} style={{ width: '100%' }}>
            <option value="">{t.timePapelNada}</option>
            <option value="auto">{t.timeLayoutAuto}</option>
            <option value="full">{t.timeLayoutFull}</option>
            <option value="grid">{t.timeLayoutGrid}</option>
          </select>
        </label>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" name="hash" value="1" defaultChecked={Boolean(cfg.hash)} />
          <span>{t.timeHash}</span>
        </label>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" name="numerar" value="1" defaultChecked={Boolean(cfg.numerar)} />
          <span>{t.timeNumerar}</span>
        </label>

        <div><button className="btn ghost" type="submit">{t.timeSalvar}</button></div>
      </form>
    </div>
  );
}

/* ---- o que só existia na /time ---------------------------------------- */

export function Modelos({ p, lang, t }: { p: NonNullable<Conta['time']>; lang: Lang; t: Textos }) {
  const ms = p.modelos || [];
  return (
    <>
      <h3 style={{ marginBottom: 4 }}>{t.timeModelosTit}</h3>
      {/* Onde eles NASCEM é a informação que falta a quem chega aqui procurando
          um botão de criar. Ele não existe nesta tela de propósito: cenário,
          rótulo, sistema e papel já estão preenchidos é dentro da ferramenta. */}
      <p className="small muted" style={{ marginTop: 0 }}
         dangerouslySetInnerHTML={{ __html: t.timeModelosOnde }} />
      {ms.length === 0 ? (
        <p className="small muted">{t.timeModelosVazio}</p>
      ) : (
        <table className="legal">
          <thead><tr><th>{t.timeModelosTit}</th><th>{t.timeConfigTitulo}</th><th /></tr></thead>
          <tbody>
            {ms.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td>{m.escopo === 'time' ? t.timeModeloTime : t.timeModeloMeu}</td>
                <td style={{ textAlign: 'right' }}>
                  <form action={apagarModelo}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn ghost" type="submit" style={{ padding: '4px 10px', fontSize: 13 }}>
                      {t.timeModeloApagar}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function Emissoes({ p, lang, t }: { p: NonNullable<Conta['time']>; lang: Lang; t: Textos }) {
  const hs = p.emissoes || [];
  return (
    <>
      <h3 style={{ marginBottom: 4 }}>{t.timeHistTit}</h3>
      {hs.length === 0 ? (
        <p className="small muted" style={{ marginTop: 0 }}>{t.timeHistVazio}</p>
      ) : (
        <table className="legal">
          <thead><tr>
            <th>{t.timeHistQuando}</th><th>{t.timePessoa}</th>
            <th>{t.timeVence}</th><th>{t.timeHistDias}</th>
          </tr></thead>
          <tbody>
            {hs.map((h, i) => (
              <tr key={`${h.email}-${i}`}>
                <td>{data(lang, h.criado_em)}</td>
                <td>{h.email}</td>
                <td>{h.vence_em || '—'}</td>
                <td>{h.dias ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
