'use client';
/* A chave de licença, na conta.
 *
 * Por que tem JavaScript: o link é longo e é para ser COPIADO. Um formulário
 * que redireciona teria que carregar a chave no endereço — que é o único lugar
 * onde ela não deveria estar, porque endereço fica no histórico do navegador e
 * vai junto no `Referer`. Aqui ela chega pela resposta da ação e some quando a
 * página fecha.
 *
 * O botão de copiar é a razão de existir da tela: ninguém digita à mão uma
 * linha de duzentos caracteres, e selecionar com o mouse é onde as pessoas
 * copiam pela metade.
 */
import { useActionState, useState } from 'react';
import { emitirLicenca } from '../acoes';
import type { Chave } from '@/lib/conta/licenca';

type Textos = Record<string, string>;

export default function Licenca({ lang, t }: { lang: string; t: Textos }) {
  const [chave, emitir, emitindo] = useActionState<Chave | null, FormData>(emitirLicenca, null);
  const [copiado, setCopiado] = useState(false);

  const motivo: Record<string, string> = {
    teste_usado: t.licTesteUsado,
    suspensa: t.licSuspensa,
    sem_segredo: t.licSemSegredo,
    sem_sessao: t.erroEntrePrimeiro,
  };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.licTit}</h2>
      <p className="small muted" style={{ marginTop: 0 }}
         dangerouslySetInnerHTML={{ __html: t.licTexto }} />

      {chave?.link ? (
        <>
          <p className="small" style={{ margin: '0 0 8px' }}>
            {(t.licVence || '')
              .replace('{vence}', chave.vence || '—')
              .replace('{assentos}', String(chave.assentos ?? 1))}
          </p>
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px',
                        wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace',
                        fontSize: 12.5, marginBottom: 12 }}>
            {chave.link}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a className="btn" href={chave.link}>{t.licAbrir}</a>
            <button type="button" className="btn ghost"
                    onClick={() => {
                      navigator.clipboard?.writeText(chave.link!).then(
                        () => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); },
                        () => {},
                      );
                    }}>
              {copiado ? t.rotCopiado : t.licCopiar}
            </button>
          </div>
        </>
      ) : (
        <form action={emitir}>
          <input type="hidden" name="lang" value={lang} />
          <button className="btn" type="submit" disabled={emitindo}>
            {emitindo ? t.rotLendo : t.licBotao}
          </button>
        </form>
      )}

      {chave?.erro && (
        <p className="aviso err" style={{ marginTop: 12 }}>{motivo[chave.erro] || t.licErro}</p>
      )}
    </div>
  );
}
