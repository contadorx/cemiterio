'use client';
/* Abrir um chamado daqui, com o relatório técnico junto.
 *
 * Esta tela só LISTAVA chamados, e o texto dela mandava a pessoa abrir um "no
 * rodapé da ferramenta". Quem chega em `/conta/chamados` já está procurando o
 * lugar de contar um problema — mandá-la para outra tela é o mesmo defeito que
 * tirou o "abrir chamado" da sexta seção da página.
 *
 * ---- O QUE ESTE RELATÓRIO É, E O QUE ELE NÃO É ----
 *
 * Ele descreve o NAVEGADOR DESTA PÁGINA. Quadros na memória, degraus do modelo
 * de voz, espelho no disco e ritmo da transcrição vivem dentro da ferramenta e
 * não existem aqui — o relatório de lá é mais fundo, e é por isso que o botão
 * também está lá, no painel de chamados da própria ferramenta.
 *
 * O que ele responde daqui é justamente a família de problema que chega mais:
 * "não baixa o modelo", "trava no 0%", "não funciona no meu computador". As
 * sondagens de rede, o WebGPU e o isolamento entre origens são a resposta —
 * e nenhum deles depende de a ferramenta estar aberta.
 *
 * E ele é VISÍVEL antes de sair. Um relatório que a pessoa não pode ler antes
 * de mandar é coleta, não é diagnóstico.
 */
import { useRef, useState } from 'react';
import type { Textos } from '@/lib/conta/textos';

/** As mesmas sondagens que a ferramenta faz — o mesmo modelo, o mesmo CDN.
 *  Perguntar de outro endereço mediria outra coisa. */
const PESO = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx';
const CONFIG = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/config.json';
const WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort-wasm-simd-threaded.jsep.wasm';

async function coletar(): Promise<string> {
  const L: string[] = [];
  const say = (s: string) => L.push(s);
  const nav = typeof navigator === 'undefined' ? null : navigator;
  say('--- diagnóstico (painel da conta) ---');
  say('endereço      : ' + location.origin);
  say('navegador     : ' + (nav?.userAgent || '?').slice(0, 110));
  say('idioma        : ' + (nav?.language || '?'));
  say('WebGPU        : ' + ((nav as { gpu?: unknown } | null)?.gpu ? 'disponível' : 'ausente'));
  say('núcleos       : ' + (nav?.hardwareConcurrency ?? '?'));
  say('cache/isolam. : caches=' + (typeof caches !== 'undefined') +
      ' crossOriginIsolated=' + (window.crossOriginIsolated === true));

  /* O espaço em disco responde "por que o modelo baixa toda vez": um navegador
     apertado descarta o cache do modelo entre uma sessão e outra. */
  try {
    const e = await nav?.storage?.estimate?.();
    if (e) say('disco         : ' + ((e.usage || 0) / 1048576).toFixed(1) + ' MB usados de ' +
                                    ((e.quota || 0) / 1048576).toFixed(0) + ' MB');
    const p = await nav?.storage?.persisted?.();
    if (p !== undefined) say('guardado      : ' + (p ? 'sim' : 'não — o navegador pode apagar o modelo'));
  } catch { /* navegador sem a API: a linha some, e isso já é a resposta */ }

  const sondar = async (rotulo: string, url: string, range?: boolean) => {
    try {
      const r = await fetch(url, range ? { headers: { Range: 'bytes=0-64' } } : undefined);
      const len = r.headers.get('content-length');
      say(rotulo + ': HTTP ' + r.status + (r.ok || r.status === 206 ? ' OK' : ' <-- problema') +
          (len && !range ? ' (' + (Number(len) / 1048576).toFixed(1) + ' MB)' : ''));
    } catch (e) {
      say(rotulo + ': FALHOU -> ' + ((e as Error)?.message || e));
    }
  };
  await sondar('config modelo ', CONFIG);
  await sondar('peso c/ Range ', PESO, true);
  await sondar('wasm do runtime', WASM, true);

  if ((performance as { memory?: { usedJSHeapSize: number } }).memory) {
    const m = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
    say('memória       : ' + (m.usedJSHeapSize / 1048576).toFixed(0) + ' MB nesta aba');
  }
  say('--- fim ---');
  return L.join('\n');
}

export default function Abrir(
  { lang, t, acao }:
  { lang: string; t: Textos; acao: (form: FormData) => void | Promise<void> },
) {
  const [diag, setDiag] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  /* O relatório viaja num campo escondido, e não num estado que o servidor não
     vê: a ação é um formulário de verdade, e o que ela recebe é o que está no
     formulário na hora do envio. */
  const campo = useRef<HTMLInputElement>(null);

  const rodar = async () => {
    setIndo(true); setErro('');
    try {
      const txt = await coletar();
      setDiag(txt);
      if (campo.current) campo.current.value = txt;
    } catch {
      setErro(t.chamadoDiagFalhou);
    } finally { setIndo(false); }
  };

  return (
    <form action={acao} className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t.chamadoAbrirTitulo}</h2>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="diag" ref={campo} />

      <label className="small" htmlFor="chamadoTexto">{t.chamadoTextoLbl}</label>
      <textarea id="chamadoTexto" name="texto" rows={5} maxLength={2000} required
                style={{ width: '100%', margin: '4px 0 12px', padding: 9, font: 'inherit', fontSize: 14 }} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn ghost" type="button" onClick={rodar} disabled={indo}>
          {t.chamadoDiagBtn}
        </button>
        <span className="small muted">
          {indo ? t.chamadoDiagIndo : erro ? erro : diag ? t.chamadoDiagPronto : t.chamadoDiagVazio}
        </span>
      </div>

      {/* Aberto de verdade, e não uma promessa: quem manda um relatório técnico
          sobre a própria máquina tem o direito de ler o que está mandando. */}
      {diag && (
        <details style={{ margin: '12px 0 0' }}>
          <summary className="small">{t.chamadoDiagVer}</summary>
          <pre style={{ maxHeight: 210, overflow: 'auto', fontSize: 11.5, whiteSpace: 'pre-wrap',
                        margin: '8px 0 0' }}>{diag}</pre>
        </details>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
        <button className="btn" type="submit">{t.chamadoEnviar}</button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>{t.chamadoDiagNota}</p>
    </form>
  );
}
