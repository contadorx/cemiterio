'use server';
/* O que a área do cliente sabe fazer. Tudo aqui roda no servidor: o navegador
 * manda um formulário e recebe um redirecionamento, sem JavaScript nenhum.
 *
 * A regra que atravessa este arquivo: **o e-mail de quem age nunca vem do
 * formulário.** Ele vem da sessão verificada. A única exceção é o `entrar`, onde
 * o e-mail é o destinatário de um link, não uma identidade — e o `convidar`,
 * onde ele é o convidado, e quem convida continua sendo a sessão.
 *
 * Se fosse do formulário, um campo escondido trocado bastaria para operar a
 * conta de outra pessoa. É o mesmo buraco que estava aberto no banco e que a
 * migração `fechar_de_verdade_as_funcoes_de_servidor` fechou.
 */
import { redirect } from 'next/navigation';
import { clienteDoServidor, emailDaSessao } from '@/lib/supabase/servidor';
import { contaDe, rpc } from '@/lib/supabase/servico';
import { PLANOS, ehPlano, stripe, temStripe } from '@/lib/stripe';
import { marca } from '@/lib/marca';
import { CAMINHO, type Lang, ehLang, preencher, textos } from '@/lib/conta/textos';
import { enderecoDoItem } from '@/lib/conta/nav';
import { type Chave, emitirChave } from '@/lib/conta/licenca';

/** O idioma vem do formulário de propósito: ele decide só em que língua a
 *  resposta é escrita, e não dá acesso a nada. */
function idioma(form: FormData): Lang {
  const v = String(form.get('lang') || 'pt');
  return ehLang(v) ? v : 'pt';
}

const volta = (lang: Lang, par: string, valor: string) =>
  redirect(`${CAMINHO[lang]}?${par}=${encodeURIComponent(valor)}`);

/* A resposta volta para a TELA DE CHAMADOS, e não para a raiz da conta. Mandar
   quem acabou de abrir um chamado para outra página é fazê-la procurar o
   número que ela precisa anotar. */
const voltaChamados = (lang: Lang, par: string, valor: string) =>
  redirect(`${enderecoDoItem('chamados', lang)}?${par}=${encodeURIComponent(valor)}`);

/** Traduz a recusa que veio do banco. Um `nao_admin` cru na tela não é um
 *  recado, é um vazamento de nome de variável. */
function recusa(lang: Lang, erro: string): string {
  const t = textos(lang);
  return ({
    nao_admin: t.erroNaoAdmin,
    email_invalido: t.erroEmailInvalido,
    ja_de_outro: t.erroJaDeOutro,
    sem_assento: t.erroSemAssento,
    nao_a_si: t.erroNaoASi,
  } as Record<string, string>)[erro] || t.erroLeitura;
}

/* ------------------------------------------------------------------ entrar */

/** Manda o link de entrada. Não diz se o e-mail existe — e não existe mesmo:
 *  qualquer e-mail pode receber um link, e quem não tem conta ganha uma ao
 *  clicar. Não há senha para vazar nem cadastro para aprovar. */
export async function entrar(form: FormData) {
  const lang = idioma(form);
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return volta(lang, 'erro', textos(lang).erroEmail);

  const supa = await clienteDoServidor();
  const { error } = await supa.auth.signInWithOtp({
    email,
    // o idioma viaja no link: quem pediu em espanhol volta em espanhol
    options: { emailRedirectTo: `${marca.site}/conta/confirmar?lang=${lang}` },
  });
  if (error) return volta(lang, 'erro', textos(lang).erroEnvio);
  volta(lang, 'enviado', email);
}

export async function sair(form: FormData) {
  const lang = idioma(form);
  const supa = await clienteDoServidor();
  await supa.auth.signOut();
  redirect(CAMINHO[lang]);
}

/* ------------------------------------------------------------------ vender */

/** Leva para o checkout. O e-mail vai preenchido a partir da sessão, então a
 *  compra cai na conta certa mesmo que a pessoa digite outro na Stripe. */
export async function comprar(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);

  const plano = String(form.get('plano') || '');
  if (!ehPlano(plano)) return volta(lang, 'erro', t.erroPlano);
  if (!temStripe || !PLANOS[plano].preco()) return volta(lang, 'erro', t.erroVendaDesligada);

  const conta = await contaDe(email).catch(() => null);
  if (conta?.assinante) {
    /* Já é assinante: um segundo checkout criaria uma segunda assinatura e uma
       segunda cobrança. A conferência vem ANTES de abrir a sessão — depois já
       teria nascido uma sessão de pagamento órfã, e ela é pagável. */
    return volta(lang, 'erro', t.erroJaAssinante);
  }

  const quantidade = Math.max(1, Math.min(500, Number(form.get('assentos') || PLANOS[plano].assentos)));
  const sessao = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PLANOS[plano].preco(), quantity: plano === 'time' ? quantidade : 1 }],
    customer_email: email,
    /* O e-mail vai também nos metadados porque o webhook precisa saber de quem
       é a compra mesmo quando o evento chega sem `customer_details`. */
    subscription_data: { metadata: { email, plano } },
    metadata: { email, plano },
    allow_promotion_codes: true,
    success_url: `${marca.site}${CAMINHO[lang]}?comprou=1`,
    cancel_url: `${marca.site}${CAMINHO[lang]}?cancelou=1`,
    locale: lang === 'pt' ? 'pt-BR' : lang,
  });
  redirect(sessao.url!);
}

/** O portal da própria Stripe: trocar cartão, ver recibos, cancelar. Construir
 *  isso à mão seria refazer, pior, uma tela que já existe e é a de quem cobra. */
export async function gerenciar(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);
  if (!temStripe) return volta(lang, 'erro', t.erroVendaDesligada);

  const clientes = await stripe().customers.list({ email, limit: 1 });
  const cli = clientes.data[0];
  if (!cli) return volta(lang, 'erro', t.erroSemAssinatura);

  const portal = await stripe().billingPortal.sessions.create({
    customer: cli.id,
    return_url: `${marca.site}${CAMINHO[lang]}`,
  });
  redirect(portal.url);
}

/* ----------------------------------------------------------------- licença */

/** Emite a chave e devolve o link. É uma Server Action com retorno (e não um
 *  redirecionamento) porque o link é longo demais para caber num endereço, e
 *  porque ele não deveria ficar no histórico do navegador. */
export async function emitirLicenca(_antes: Chave | null, form: FormData): Promise<Chave> {
  const lang = idioma(form);
  const email = await emailDaSessao();
  if (!email) return { erro: 'sem_sessao' };
  void lang;
  return emitirChave();
}

/* -------------------------------------------------------------------- time */

/** Chama uma função de time com o administrador vindo da sessão. As quatro
 *  ações abaixo passam por aqui, e é aqui que fica a única cópia da regra. */
async function comoAdmin(lang: Lang, funcao: string, args: Record<string, unknown>) {
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', textos(lang).erroEntrePrimeiro);
  let r: { erro?: string } | null;
  try {
    r = await rpc<{ erro?: string } | null>(funcao, { p_admin: email, ...args });
  } catch {
    return volta(lang, 'erro', textos(lang).erroLeitura);
  }
  if (r && r.erro) return volta(lang, 'erro', recusa(lang, r.erro));
  return volta(lang, 'feito', textos(lang).timeSalvo);
}

export async function convidar(form: FormData) {
  const lang = idioma(form);
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!email) return volta(lang, 'erro', textos(lang).erroEmailInvalido);
  return comoAdmin(lang, 'walkstamp_time_convidar', { p_email: email });
}

export async function bloquear(form: FormData) {
  const lang = idioma(form);
  return comoAdmin(lang, 'walkstamp_time_bloquear', {
    p_email: String(form.get('email') || '').trim().toLowerCase(),
    p_bloquear: String(form.get('bloquear') || '') === '1',
  });
}

export async function ajustar(form: FormData) {
  const lang = idioma(form);
  /* Os limites são conferidos aqui E no banco. Não é redundância inútil: aqui
     é para o recado sair legível, lá é porque a função é chamável por outro
     caminho amanhã e a regra não pode morar só na tela. */
  return comoAdmin(lang, 'walkstamp_time_ajustar', {
    p_dias: Math.max(1, Math.min(90, Number(form.get('dias')) || 90)),
    p_assentos: Math.max(1, Math.min(500, Number(form.get('assentos')) || 25)),
  });
}

/* Apagar um modelo do time. Ele NASCE dentro da ferramenta, no botão "salvar
   como meu modelo" — é lá que cenário, rótulo, sistema e papel já estão
   preenchidos. Aqui é onde ele se vê e se apaga, e era a única função que ainda
   só existia na `/time`. */
export async function apagarModelo(form: FormData) {
  const lang = idioma(form);
  return comoAdmin(lang, 'walkstamp_time_modelo', {
    p_id: Number(form.get('id')) || 0,
    p_nome: null, p_escopo: null, p_dados: null, p_apagar: true,
  });
}

/* ------------------------------------------------------------- chamados */

/** Abrir um chamado daqui, e não "no rodapé da ferramenta".
 *
 *  O e-mail vem da SESSÃO, como em todo o resto deste arquivo — e aqui isso
 *  vale o dobro: na ferramenta o e-mail é digitado, e um chamado com o e-mail
 *  errado é um chamado que nunca chega de volta a quem o abriu.
 *
 *  O relatório vem do formulário porque ele é do NAVEGADOR de quem está lá: o
 *  servidor não tem como saber se aquela máquina tem WebGPU. Ele é opcional e
 *  a pessoa o vê antes de mandar; o que ele não pode é decidir quem é ela. */
export async function abrirChamado(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return voltaChamados(lang, 'erro', t.erroEntrePrimeiro);

  const texto = String(form.get('texto') || '').trim();
  if (!texto) return voltaChamados(lang, 'erro', t.chamadoSemTexto);
  /* O relatório é cortado no servidor, e não confiado ao tamanho do campo: ele
     chega de um formulário, e um formulário é o que qualquer um pode montar. */
  const diag = String(form.get('diag') || '').trim().slice(0, 20000) || null;

  let numero: string | null;
  try {
    numero = await rpc<string>('walkstamp_recado', {
      p_tipo: 'problema', p_texto: texto.slice(0, 2000), p_email: email,
      p_idioma: lang, p_cenario: null, p_origem: 'conta', p_diag: diag,
    });
  } catch {
    return voltaChamados(lang, 'erro', t.chamadoErro);
  }
  if (!numero || numero === 'vazio' || numero === 'muitos') {
    return voltaChamados(lang, 'erro', numero === 'muitos' ? t.chamadoMuitos : t.chamadoErro);
  }
  return voltaChamados(lang, 'feito', preencher(t.chamadoAberto, { numero }));
}

export async function configurar(form: FormData) {
  const lang = idioma(form);
  const campo = (n: string) => String(form.get(n) || '').trim() || null;
  /* Uma caixa desmarcada não aparece no formulário — ela some, e `null` no
     banco significa "não decidi". Aqui a ausência vira `false` de propósito:
     quem desmarcou decidiu que não quer, e isso é diferente de nunca ter
     configurado. */
  const marcado = (n: string) => form.get(n) === '1';
  return comoAdmin(lang, 'walkstamp_time_config', {
    p_config: {
      empresa: campo('empresa'),
      logo_url: campo('logo_url'),
      cenario: campo('cenario'),
      rotulo: campo('rotulo'),
      ambiente: campo('ambiente'),
      papel: campo('papel'),
      layout: campo('layout'),
      hash: marcado('hash'),
      numerar: marcado('numerar'),
    },
  });
}
