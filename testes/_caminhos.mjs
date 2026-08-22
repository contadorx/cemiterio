/* ONDE ESTÃO AS COISAS — descoberto, não escrito à mão.
 *
 * Todo arquivo desta pasta trazia dois caminhos absolutos: `/root/walkstamp` e
 * um executável do Chromium com o número da versão dentro. Os dois valiam numa
 * máquina só — a que estava aberta no dia em que foram escritos.
 *
 * O `preparar.sh` existia para consertar isso na chegada, e não consertava:
 * procurava `/root/cc/walkstamp`, um caminho ANTERIOR, enquanto os arquivos já
 * carregavam `/root/walkstamp`. Ele relatava "0 arquivos ajustados" e ninguém
 * lia o zero. A promessa do LEIA-ME — preparar o projeto onde ele estiver —
 * era falsa havia tempo, e só não doía porque só uma máquina rodava a régua.
 *
 * ---- por que o Chromium não é só `executablePath: undefined` ----
 *
 * Deixar o Playwright resolver sozinho é o certo numa instalação normal. Aqui
 * não resolve: a versão instalada da biblioteca procura
 * `chromium_headless_shell-1234`, e o que existe no disco é `chromium-1194`.
 * O caminho fixo era um remendo para essa diferença — remendo real, resolvendo
 * um problema real, no lugar errado.
 *
 * Então a ordem é: o que a pessoa mandou, depois o que a biblioteca acha, e só
 * então o que estiver no disco. Nenhum número de versão escrito à mão.
 */
import fs from 'fs';
import path from 'path';

/** A raiz do projeto, deduzida de onde ESTE arquivo está. Sem barra no fim:
 *  quem concatena `+ '/public'` não deve produzir `//public`. */
export const RAIZ_WS = process.env.RAIZ ||
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Onde o Playwright guarda os navegadores nesta máquina. */
const VIVEIRO = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

/** Procura um executável de Chromium dentro do viveiro, seja qual for a versão.
 *  Devolve `undefined` quando não acha — e `undefined` é a resposta certa:
 *  é ele que faz o Playwright usar a própria resolução. */
function procurar() {
  const nomes = [
    ['chrome-linux', 'chrome'],
    ['chrome-linux64', 'chrome'],
    ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
    ['chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'],
  ];
  let pastas;
  try { pastas = fs.readdirSync(VIVEIRO); } catch (e) { return undefined; }
  /* O maior número de build primeiro: quando há duas versões instaladas, a
     nova é a que combina com a biblioteca mais recente. */
  const ordem = pastas
    .filter(d => /^chromium/.test(d))
    .sort((a, b) => (parseInt(b.split('-').pop(), 10) || 0) -
                    (parseInt(a.split('-').pop(), 10) || 0));
  for (const d of ordem) {
    for (const [sub, bin] of nomes) {
      const p = path.join(VIVEIRO, d, sub, bin);
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {}
    }
  }
  return undefined;
}

/** O executável do navegador, ou `undefined` para o Playwright decidir. */
export const CHROME_WS = process.env.CHROME || procurar();

/** Atalho para quem só quer abrir: `chromium.launch(await opcoes({...}))`. */
export const comChrome = (extra) =>
  Object.assign({ executablePath: CHROME_WS }, extra || {});
