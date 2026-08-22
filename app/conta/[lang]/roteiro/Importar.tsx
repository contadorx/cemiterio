'use client';
/* A entrada da planilha, e a conferência do que foi entendido dela.
 *
 * Por que esta parte tem JavaScript, sendo que o resto da área do cliente não
 * tem: adivinhar qual coluna é o código do caso ERRA. Salvar primeiro e
 * descobrir depois é quarenta casos com o nome trocado e um roteiro para
 * refazer. Aqui a pessoa vê o que foi entendido, troca a coluna se precisar, e
 * só então grava. Trocar um menu e esperar a página inteira voltar do servidor
 * para conferir a mesma tabela seria pior por três motivos, e nenhum deles é
 * técnico.
 *
 * O resto da tela — a lista, o link, o "feito", o atribuir — é formulário puro
 * e funciona sem nada disto.
 */
import { useActionState, useState } from 'react';
import { lerPlanilha, salvarRoteiro } from '../../roteiro-acoes';
import type { Lido } from '../../roteiro-acoes';

type Textos = Record<string, string>;

const CAMPOS = ['caso', 'titulo', 'sistema', 'chamado', 'responsavel'] as const;
type Campo = (typeof CAMPOS)[number];

export default function Importar(
  { lang, t, podeTime }: { lang: string; t: Textos; podeTime: boolean },
) {
  const [lido, ler, lendo] = useActionState<Lido | null, FormData>(lerPlanilha, null);
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.rotImportarTitulo}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t.rotImportarTexto}</p>

      <form action={ler} style={{ display: 'grid', gap: 12 }}>
        <input type="hidden" name="lang" value={lang} />
        <label className="small">{t.rotArquivo}
          <input type="file" name="arquivo" accept=".xlsx,.csv,.tsv,.txt" style={{ display: 'block', marginTop: 4 }} />
        </label>
        <label className="small">{t.rotColar}
          <textarea name="colado" rows={3} placeholder={t.rotColarPlaceholder}
                    style={{ width: '100%', marginTop: 4 }} />
        </label>
        <div>
          <button className="btn ghost" type="submit" disabled={lendo}>
            {lendo ? t.rotLendo : t.rotLerBotao}
          </button>
        </div>
      </form>

      {lido?.erro && <p className="aviso err" style={{ marginTop: 14 }}>{lido.erro}</p>}
      {lido && !lido.erro && lido.cab && lido.corpo && (
        <Conferir lang={lang} t={t} podeTime={podeTime}
                  nome={lido.nome || ''} cab={lido.cab} corpo={lido.corpo}
                  mapaInicial={lido.mapa || {}} />
      )}
    </div>
  );
}

function Conferir(
  { lang, t, podeTime, nome, cab, corpo, mapaInicial }:
  {
    lang: string; t: Textos; podeTime: boolean; nome: string;
    cab: string[]; corpo: string[][]; mapaInicial: Record<string, number | null>;
  },
) {
  const [mapa, setMapa] = useState(mapaInicial);
  const [titulo, setTitulo] = useState(nome);

  /* Aplicar o mapa é pegar a coluna pelo índice. Isto vive aqui, e só aqui,
     porque é aqui que a pessoa mexe no menu e precisa ver a tabela mudar na
     hora — o servidor adivinha o mapa inicial e não faz mais nada com ele. */
  const val = (l: string[], k: Campo) =>
    mapa[k] == null ? '' : String(l[mapa[k] as number] || '').trim();
  const casos = corpo.map((l, i) => ({
    caso: val(l, 'caso') || `#${i + 1}`,
    titulo: val(l, 'titulo'),
    sistema: val(l, 'sistema'),
    chamado: val(l, 'chamado'),
    responsavel: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val(l, 'responsavel'))
      ? val(l, 'responsavel').toLowerCase() : '',
  }));

  const repetidos = new Set(
    casos.map((c) => c.caso.toLowerCase())
      .filter((c, i, a) => a.indexOf(c) !== i),
  );

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <p className="small" style={{ margin: '0 0 8px' }}><b>{t.rotConferirTitulo}</b></p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {CAMPOS.map((k) => (
          <label key={k} className="small" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            {t['rotCampo' + k[0].toUpperCase() + k.slice(1)]}
            <select value={mapa[k] == null ? '' : String(mapa[k])}
                    onChange={(e) => setMapa({ ...mapa, [k]: e.target.value === '' ? null : Number(e.target.value) })}
                    style={{ padding: '4px 6px' }}>
              <option value="">—</option>
              {cab.map((c, i) => <option key={i} value={i}>{c || `${t.rotColuna} ${i + 1}`}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginTop: 12 }}>
        <table className="legal" style={{ margin: 0 }}>
          <thead><tr>
            <th>{t.rotCampoCaso}</th><th>{t.rotCampoTitulo}</th>
            <th>{t.rotCampoSistema}</th><th>{t.rotCampoChamado}</th><th>{t.rotCampoResponsavel}</th>
          </tr></thead>
          <tbody>
            {casos.slice(0, 60).map((c, i) => (
              <tr key={i}>
                <td style={repetidos.has(c.caso.toLowerCase()) ? { color: 'var(--err, #b4232a)' } : undefined}>
                  {c.caso}
                </td>
                <td>{c.titulo}</td><td>{c.sistema}</td><td>{c.chamado}</td><td>{c.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        {casos.length} {t.rotCasos}{casos.length > 60 ? ` · ${t.rotMostrando60}` : ''}
      </p>
      {/* Código repetido não é erro de digitação inocente: a volta da planilha
          casa pelo código, e dois casos com o mesmo código viram um só. */}
      {repetidos.size > 0 && <p className="aviso err">{t.rotRepetidos}</p>}

      <form action={salvarRoteiro} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="casos" value={JSON.stringify(casos)} />
        <input name="nome" value={titulo} onChange={(e) => setTitulo(e.target.value)}
               placeholder={t.rotNomePlaceholder} aria-label={t.rotNome} style={{ minWidth: 220 }} />
        <select name="escopo" defaultValue={podeTime ? 'time' : 'personal'}>
          <option value="personal">{t.rotEscopoPersonal}</option>
          {podeTime && <option value="time">{t.rotEscopoTime}</option>}
        </select>
        <button className="btn" type="submit">{t.rotSalvarBotao}</button>
      </form>
    </div>
  );
}
