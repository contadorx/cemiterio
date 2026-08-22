/* O NAVEGADOR DA RÉGUA — o Chromium de sempre, com uma diferença só.
 *
 * O passo 3 tem quatro painéis, e dois deles passaram a nascer RECOLHIDOS: a
 * fala e a identificação. É o que a proposta de UX pede — a etapa de conferir
 * abre curta, com o resumo e a grade, e o que quase ninguém mexe fica a um
 * clique, com o estado dito na linha do título ("118 trechos", "3 campos
 * preenchidos"). Nada foi escondido: foi recolhido, que é outra coisa.
 *
 * Só que trinta e três arquivos desta régua DIRIGEM controles que moram lá
 * dentro — `#tr`, `#evBox`, `#hesitar`, `#multiBox`. Para o Playwright, um
 * elemento dentro de um `<details>` fechado não é invisível por opinião: ele
 * não tem caixa, e `fill()` recusa com "element is not visible". Medido: seis
 * arquivos caindo só na pista curta, todos por esse motivo e nenhum por
 * defeito do produto.
 *
 * A resposta poderia ser trinta e três edições, uma por arquivo, cada uma num
 * ponto diferente — e trinta e três chances de errar uma. Em vez disso, o
 * ponto de entrada é um só: os arquivos importam o Chromium DAQUI, e daqui ele
 * sai com um `addInitScript` que abre os painéis antes de a página carregar.
 *
 * O QUE ISTO NÃO PODE VIRAR: um jeito de a régua não ver a tela que a pessoa
 * vê. Ele abre painéis e a gaveta das saídas, e mais nada — não mexe em estado, não preenche campo,
 * não muda o produto. E o estado recolhido continua sendo cobrado, em
 * `testes/perna.mjs`, que importa o Playwright direto justamente para
 * enxergá-lo. Um atalho que apagasse a única régua do próprio atalho seria o
 * atalho se autoaprovando.
 */
import { chromium as verdadeiro } from 'playwright';

/* Roda dentro da página, a cada navegação. `DOMContentLoaded` porque o
   `addInitScript` executa antes de existir corpo nenhum para consultar. */
function abrirPaineis(){
  const abre = () => {
    document.querySelectorAll('details.sub').forEach((d) => { d.open = true; });
    /* E a gaveta das saídas, pelo mesmo argumento e no mesmo lugar. Onze
       botões com o mesmo peso eram onze decisões; agora a recomendação
       responde e o catálogo fica atrás de um clique. Trinta e nove arquivos
       desta régua clicam em `#pptx`, `#zip`, `#papel` — e um botão dentro de
       um `hide` não tem caixa, então `click()` recusa.

       Ela abre pelo BOTÃO da pessoa, e não mexendo na classe à mão: assim o
       `aria-expanded` e a memória em `localStorage` andam junto, e a régua não
       vê um estado que a tela nunca produz. */
    const cx = document.getElementById('saidasTodas');
    const bt = document.getElementById('recTodos');
    if (cx && bt && cx.classList.contains('hide')) bt.click();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', abre);
  } else {
    abre();
  }
}

/* `Object.create` e não espalhamento: o `chromium` é um objeto com métodos no
   protótipo (`connect`, `executablePath`, `launchServer`), e espalhar deixaria
   um objeto pelado que só tem `launch`. */
export const chromium = Object.create(verdadeiro);

chromium.launch = async function (opcoes) {
  const br = await verdadeiro.launch(opcoes);
  const contextoOriginal = br.newContext.bind(br);
  const paginaOriginal = br.newPage.bind(br);
  br.newContext = async (o) => {
    const ctx = await contextoOriginal(o);
    await ctx.addInitScript(abrirPaineis);
    return ctx;
  };
  /* `newPage` cria um contexto por dentro, e não passa pelo `newContext`
     remendado acima — por isso os dois. Aplicar duas vezes não faz mal: abrir
     um painel já aberto é abrir um painel já aberto. */
  br.newPage = async (o) => {
    const pg = await paginaOriginal(o);
    await pg.addInitScript(abrirPaineis);
    return pg;
  };
  return br;
};
