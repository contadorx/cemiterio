/* O MENU DA CONTA, para a ferramenta desenhar.
 *
 * ---- o problema ----
 *
 * A ferramenta é UM arquivo estático (`public/app.html`) que precisa abrir do
 * `file://`. Ela não tem servidor, não lê cookie de sessão e não pode chamar as
 * funções da conta — elas recebem um e-mail e devolvem faturas daquele e-mail,
 * e por isso só o `service_role` as chama. Ou seja: ela não tem como saber
 * sozinha quem está logado nem quais itens de menu essa pessoa vê.
 *
 * Escrever a lista de novo dentro dela resolveria a tela e criaria o defeito:
 * dois menus escritos à mão divergem, e o sintoma é a pessoa jurando que viu um
 * link que "sumiu". Este projeto já perdeu o `hreflang` do alemão exatamente
 * assim.
 *
 * ---- o que este endereço é ----
 *
 * A MESMA função que monta a barra do painel (`menuDe`), servida como JSON. A
 * ferramenta pergunta, desenha o que vier, e pronto: um menu só, com uma fonte
 * só, em dois lugares.
 *
 * ---- o que ele NÃO devolve ----
 *
 * Nada além do que a pessoa já está vendo na própria conta: o e-mail da sessão
 * dela, rótulos traduzidos e endereços públicos. Nenhum dado de fatura, de
 * chamado ou de outra conta passa por aqui. Sem sessão, ele responde 204 e a
 * ferramenta simplesmente não desenha barra nenhuma.
 *
 * E é ADITIVO, nunca requisito: se este endereço cair, sumir ou for bloqueado
 * pela rede do cliente, a ferramenta continua gravando, transcrevendo e gerando
 * documento. Some só a barra. É a mesma regra que vale para o resto da conta
 * dentro da ferramenta, e é ela que permite continuar dizendo que o produto
 * roda onde o concorrente não roda.
 */
import { NextResponse } from 'next/server';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { contaDe, temChaveDeServico } from '@/lib/supabase/servico';
import { ehLang, preencher, textos, CAMINHO } from '@/lib/conta/textos';
import { menuDe } from '@/lib/conta/nav';

export const dynamic = 'force-dynamic';

const DONO = (process.env.WALKSTAMP_DONO || '').trim().toLowerCase();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bruto = (url.searchParams.get('lang') || 'pt').toLowerCase();
  const lang = ehLang(bruto) ? bruto : 'pt';

  const email = await emailDaSessao();

  /* O MENU EXISTE MESMO SEM SESSAO.
   *
   * Ele respondia 204 para quem nao estava logado, e a ferramenta ficava sem
   * barra nenhuma. Estava alinhado com "a conta e opcional" e desalinhado com a
   * estrategia: o menu e a unica peca da tela que diz O QUE EXISTE alem da
   * ferramenta gratuita. Sem ele, quem usa o produto de graca — que e quase
   * todo mundo — nunca ve que ha roteiro de casos, time, faturas.
   *
   * Deslogado, o menu vem com todos os itens visiveis e os pagos marcados, e a
   * primeira linha convida a entrar. Nada da conta e lido: sem sessao nao ha o
   * que ler. */
  let tem = { time: false, plano: false, dono: false };
  /* O NOME DO PLANO, para a barra da ferramenta escrever debaixo do e-mail.
     Ele vem daqui, e não da licença guardada no navegador: a chave diz o que
     foi ATIVADO naquela máquina; a conta diz o que a pessoa TEM. Quando os dois
     discordam — chave velha, plano cancelado —, quem manda é o servidor. */
  let plano: string | null = null;
  if (email && temChaveDeServico) try {
    const conta = await contaDe(email);
    tem = {
      time: Boolean(conta.time),
      plano: Boolean(conta.plano) && conta.motivo !== 'suspensa',
      dono: Boolean(DONO) && email.trim().toLowerCase() === DONO,
    };
    /* A MESMA regra do painel (`secoes.tsx`), com as mesmas palavras: duas
       telas que chamam o mesmo plano de dois nomes é a marca gaguejando. */
    const tt = textos(lang);
    plano = conta.plano === 'time' ? tt.planoTeam : conta.plano ? tt.planoPersonal : tt.planoFree;
  } catch {
    /* O banco mudo não apaga a barra: os itens que não dependem de plano
       continuam valendo, e mandar a pessoa para uma tela que explica é melhor
       do que sumir com o caminho até ela. */
  }

  const t = textos(lang);
  return NextResponse.json(
    {
      /* `null` deslogado, e a barra troca o nome de quem e por um convite a
         entrar — o mesmo que o painel faz. */
      email: email || null,
      /* Já pronto para a tela: "Plano Team", e não `{plano:'time'}`. Quem
         desenha é um arquivo estático que não tem dicionário da conta, e
         mandá-lo montar a frase seria mandar traduzir de novo do outro lado. */
      plano: plano ? preencher(t.menuPlano, { 0: plano }) : null,
      entrar: email ? null : t.painelEntrar,
      raiz: CAMINHO[lang],
      itens: menuDe(lang, tem).map((i) => ({
        slug: i.slug, rotulo: t[i.rotulo], href: i.href, icone: i.icone,
        /* O cadeado viaja junto. Sem ele, a barra da ferramenta mostraria como
           aberto o que o painel mostra como pago — e a pessoa descobriria a
           diferença clicando. */
        bloqueado: i.bloqueado, selo: i.bloqueado ? t.menuTrancado : null,
      })),
      /* A própria ferramenta, com o mesmo rótulo que o painel usa no link de
         volta. Ela entra na lista dos dois lados: no painel como saída, aqui
         como o lugar onde a pessoa está. Um menu que não mostra onde você está
         é um menu que faz você procurar. */
      ferramenta: { rotulo: t.painelFerramenta, href: `/app?lang=${lang}` },
    },
    /* Sem cache em lugar nenhum: o menu depende de quem está logado, e um menu
       de outra pessoa servido do cache de um intermediário é vazamento. */
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
