'use server';
/* O que a tela de controle do roteiro sabe fazer.
 *
 * A mesma regra do resto da área do cliente, e ela não tem exceção aqui: **o
 * e-mail de quem age vem da sessão, nunca do formulário**. As funções do banco
 * recebem o e-mail por parâmetro — se o navegador pudesse chamá-las, trocar um
 * campo escondido daria o roteiro de outra empresa. Por isso elas foram
 * revogadas de `anon` e `authenticated`, e só a chave de serviço abre.
 */
import { redirect } from 'next/navigation';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { contaDe, rpc } from '@/lib/supabase/servico';
import { type Lang, type Textos, ehLang, textos } from '@/lib/conta/textos';
import { CAMINHO_ROTEIRO } from '@/lib/conta/roteiro';
import { lerRecibo } from '@/lib/conta/recibo';
import { TETO_ANEXO, apagarAnexo, subirAnexo } from '@/lib/supabase/arquivo';
import { type CasoCru, adivinharMapa, separar, textoParaLinhas, xlsxParaLinhas } from '@/lib/planilha';

/* O que toda função do roteiro devolve: ou uma recusa, ou o roteiro salvo com
   o id — que é para onde a tela volta. O tipo é escrito uma vez porque o
   `.catch` de cada chamada precisa devolver a mesma forma; sem ele, o
   TypeScript passa a achar que `id` não existe no caminho do erro. */
type Resposta = { erro?: string; id?: number; faxina?: Array<{ id: number; caminho: string }> };

function idioma(form: FormData): Lang {
  const v = String(form.get('lang') || 'pt');
  return ehLang(v) ? v : 'pt';
}

const volta = (lang: Lang, par: string, valor: string, id?: number) =>
  redirect(`${CAMINHO_ROTEIRO[lang]}?${id ? `id=${id}&` : ''}${par}=${encodeURIComponent(valor)}`);

function recusa(lang: Lang, erro: string): string {
  const t = textos(lang);
  return ({
    sem_acesso: t.rotErroSemAcesso,
    nao_admin: t.rotErroNaoAdmin,
    so_o_dono: t.rotErroSoDono,
    fora_do_time: t.rotErroForaDoTime,
    sem_casos: t.rotErroSemCasos,
    sem_nome: t.rotErroSemNome,
    sem_caso: t.rotErroSumiu,
    sem_roteiro: t.rotErroSumiu,
  } as Record<string, string>)[erro] || t.erroLeitura;
}

/** Quem pode ter roteiro. É recurso de plano pago, e a razão é de fluxo, não de
 *  capacidade: quem grava um vídeo não precisa disto; quem roda quarenta casos
 *  economiza uma tarde. O teste de 14 dias entra — é o plano pago por 14 dias,
 *  e esconder metade dele faria o teste medir a coisa errada. */
export async function podeRoteiro(email: string): Promise<boolean> {
  try {
    const c = await contaDe(email);
    return Boolean(c.plano) && c.motivo !== 'suspensa';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- a faxina ---
 *
 * O arquivo no balde não some por cascata. Quando um caso deixa de existir —
 * porque a planilha foi reenviada sem ele, ou porque o roteiro inteiro foi
 * apagado — o banco põe o caminho numa FILA, dentro da mesma transação que
 * apaga a linha. Aqui é onde ela é drenada.
 *
 * A fila existe porque apagar um arquivo é uma chamada de rede que pode falhar,
 * e ela acontece depois do commit. Sem a fila, uma falha deixaria conteúdo de
 * cliente no balde sem nada apontando para ele: invisível na tela, impossível
 * de apagar pela tela, e contra a frase que a política de privacidade promete
 * com todas as letras. Com a fila, uma falha é só uma tentativa a mais.
 */
async function faxinar(orfaos: Array<{ id: number; caminho: string }> | undefined) {
  if (!orfaos?.length) return;
  const feitos: number[] = [];
  for (const o of orfaos) {
    try { await apagarAnexo(o.caminho); feitos.push(o.id); }
    catch (e) {
      /* Contar a tentativa e guardar o motivo. Uma fila que apaga o que não
         conseguiu apagar é uma fila que mente. */
      await rpc('walkstamp_anexo_faxinado', {
        p_ids: [o.id], p_erro: String((e as Error)?.message || e).slice(0, 200),
      }).catch(() => {});
    }
  }
  if (feitos.length) {
    await rpc('walkstamp_anexo_faxinado', { p_ids: feitos, p_erro: null }).catch(() => {});
  }
}

/* ------------------------------------------------------------ ler planilha */

export type Lido = {
  erro?: string;
  nome?: string;
  cab?: string[];
  corpo?: string[][];
  mapa?: Record<string, number | null>;
};

const LIMITE_BYTES = 4 * 1024 * 1024;
const LIMITE_LINHAS = 2000;

/** Lê a planilha e DEVOLVE o que leu, sem gravar nada. A conferência do que foi
 *  adivinhado acontece na tela, antes de salvar: adivinhar coluna erra, e um
 *  roteiro salvo com a coluna errada é quarenta casos com o nome trocado. */
export async function lerPlanilha(_antes: Lido | null, form: FormData): Promise<Lido> {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return { erro: t.erroEntrePrimeiro };
  if (!(await podeRoteiro(email))) return { erro: t.rotSoPago };

  const colado = String(form.get('colado') || '').trim();
  const arq = form.get('arquivo');
  let linhas: string[][];
  let nome = '';

  try {
    if (arq && typeof arq === 'object' && 'arrayBuffer' in arq && (arq as File).size > 0) {
      const f = arq as File;
      if (f.size > LIMITE_BYTES) return { erro: t.rotErroGrande };
      const buf = Buffer.from(await f.arrayBuffer());
      nome = f.name.replace(/\.(xlsx|csv|tsv|txt)$/i, '');
      linhas = /\.xlsx$/i.test(f.name) ? xlsxParaLinhas(buf) : textoParaLinhas(buf.toString('utf8'));
    } else if (colado) {
      linhas = textoParaLinhas(colado);
      nome = t.rotColado;
    } else {
      return { erro: t.rotErroVazio };
    }
  } catch (e) {
    return { erro: `${t.rotErroLer} ${String((e as Error)?.message || e).slice(0, 120)}` };
  }

  const sep = separar(linhas);
  if (!sep) return { erro: t.rotErroVazio };
  if (sep.corpo.length > LIMITE_LINHAS) return { erro: t.rotErroMuitas };

  return { nome, cab: sep.cab, corpo: sep.corpo, mapa: adivinharMapa(sep.cab) };
}

/* -------------------------------------------------------------- gravar --- */

export async function salvarRoteiro(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);
  if (!(await podeRoteiro(email))) return volta(lang, 'erro', t.rotSoPago);

  let casos: CasoCru[];
  try {
    const cru = JSON.parse(String(form.get('casos') || '[]'));
    /* O que vem do formulário é reconstruído campo a campo. Confiar no JSON
       inteiro deixaria passar chave que a função do banco não espera — e a
       lista de campos é curta o bastante para ser escrita à mão. */
    casos = (Array.isArray(cru) ? cru : []).slice(0, LIMITE_LINHAS).map((c: Record<string, unknown>) => ({
      caso: String(c?.caso ?? '').slice(0, 120),
      titulo: String(c?.titulo ?? '').slice(0, 300),
      sistema: String(c?.sistema ?? '').slice(0, 120),
      chamado: String(c?.chamado ?? '').slice(0, 120),
      responsavel: String(c?.responsavel ?? '').slice(0, 160),
    }));
  } catch {
    return volta(lang, 'erro', t.rotErroLer);
  }
  if (!casos.length) return volta(lang, 'erro', t.rotErroSemCasos);

  const idAntigo = Number(form.get('id')) || null;
  const r = await rpc<Resposta>('walkstamp_roteiro_salvar', {
    p_email: email,
    p_nome: String(form.get('nome') || '').trim().slice(0, 120) || t.rotSemNome,
    p_escopo: String(form.get('escopo') || 'personal') === 'time' ? 'time' : 'personal',
    p_casos: casos,
    p_id: idAntigo,
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) return volta(lang, 'erro', recusa(lang, r.erro));
  /* Um caso que sumiu da planilha nova levou o anexo dele para a fila. */
  await faxinar(r?.faxina);
  volta(lang, 'feito', t.rotSalvo, r?.id);
}

export async function marcarFeito(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);
  const casoId = Number(form.get('caso_id'));
  if (!casoId) return volta(lang, 'erro', t.rotErroSumiu);
  const desfazendo = String(form.get('desfazer') || '') === '1';

  /* O recibo veio dentro do link da volta, comprimido. É aberto, conferido e
     limpo antes de virar `jsonb` — ver `lib/conta/recibo.ts` para o porquê de
     cada limite. Recibo ilegível não recusa o trabalho de ninguém: o caso é
     marcado do mesmo jeito, só sem a ficha. */
  const recibo = desfazendo ? null : lerRecibo(String(form.get('recibo') || '') || null);

  const r = await rpc<Resposta>('walkstamp_roteiro_feito', {
    p_email: email,
    p_caso_id: casoId,
    p_arquivo: String(form.get('arquivo') || '').slice(0, 200) || null,
    p_impressao: String(form.get('impressao') || '').slice(0, 64) || null,
    p_observacao: String(form.get('observacao') || '').slice(0, 500) || null,
    p_desfazer: desfazendo,
    p_recibo: recibo,
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) return volta(lang, 'erro', recusa(lang, r.erro));

  /* O anexo é opcional e vem no mesmo formulário. Ele é tratado DEPOIS de
     marcar: se o arquivo falhar, o caso continua feito — perder o "concluído"
     porque um upload de 8 MB caiu seria trocar o principal pelo acessório. */
  if (!desfazendo) {
    const erroAnexo = await guardarAnexo(email, casoId, form.get('anexo'), t);
    if (erroAnexo) return volta(lang, 'erro', erroAnexo, r?.id);
  }
  volta(lang, 'feito', desfazendo ? t.rotDesfeito : t.rotMarcado, r?.id);
}

/* ------------------------------------------------------ o .json completo --
 *
 * Este é o único lugar do produto onde um quadro do cliente passa a existir do
 * nosso lado. Ele só chega aqui porque alguém escolheu o arquivo num campo que
 * diz, ao lado, exatamente o que vai acontecer com ele.
 */

/** Devolve a mensagem de erro, ou null quando deu certo (ou quando não havia
 *  arquivo nenhum — que é o caso normal). */
async function guardarAnexo(
  email: string, casoId: number, campo: FormDataEntryValue | null, t: Textos,
): Promise<string | null> {
  if (!campo || typeof campo !== 'object' || !('arrayBuffer' in campo)) return null;
  const f = campo as File;
  if (!f.size) return null;
  if (f.size > TETO_ANEXO) return t.rotErroAnexoGrande;
  if (!/\.json$/i.test(f.name)) return t.rotErroAnexoTipo;

  let corpo: ArrayBuffer;
  try {
    corpo = await f.arrayBuffer();
    /* Que seja mesmo um `.json`, e nosso. Guardar um arquivo qualquer com
       extensão trocada é guardar o que a pessoa não quis guardar. */
    const espia = Buffer.from(corpo.slice(0, 4096)).toString('utf8').trimStart();
    if (!espia.startsWith('{')) return t.rotErroAnexoTipo;
  } catch {
    return t.rotErroAnexoTipo;
  }

  const caminho = `${casoId}/${Date.now()}.json`;
  try {
    await subirAnexo(caminho, corpo);
  } catch {
    return t.rotErroAnexoSubir;
  }

  const r = await rpc<Resposta>('walkstamp_roteiro_anexo', {
    p_email: email, p_caso_id: casoId, p_caminho: caminho,
    p_nome: f.name.slice(0, 160), p_bytes: f.size,
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) {
    /* O banco recusou depois de o arquivo já estar lá. Tirar o arquivo é
       obrigatório: um anexo no balde que nenhuma linha aponta é conteúdo de
       cliente guardado sem ninguém saber, e sem botão para apagar. */
    await apagarAnexo(caminho).catch(() => {});
    return t.rotErroAnexoSubir;
  }
  return null;
}

/* A forma única do que a porta do anexo devolve. Sem ela, o `.catch` faz o
   TypeScript achar que `caminho` só existe num dos dois caminhos. */
type Onde = { erro?: string; caminho?: string };

export async function apagarAnexoDoCaso(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);
  const casoId = Number(form.get('caso_id')) || 0;

  const onde = await rpc<Onde>(
    'walkstamp_roteiro_anexo_de', { p_email: email, p_caso_id: casoId },
  ).catch(() => ({ erro: 'leitura' }) as Onde);
  if (onde?.erro) return volta(lang, 'erro', recusa(lang, onde.erro));

  /* O arquivo primeiro, a linha depois. Na ordem inversa, um erro no meio
     deixaria o arquivo no balde sem nada apontando para ele — invisível na
     tela e impossível de apagar pela tela. */
  try {
    if (onde?.caminho) await apagarAnexo(onde.caminho);
  } catch {
    return volta(lang, 'erro', t.rotErroAnexoApagar);
  }
  const r = await rpc<Resposta>('walkstamp_roteiro_anexo', {
    p_email: email, p_caso_id: casoId, p_caminho: null, p_nome: null, p_bytes: null,
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) return volta(lang, 'erro', recusa(lang, r.erro));
  volta(lang, 'feito', t.rotAnexoApagado, r?.id);
}

export async function atribuirCaso(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);

  const r = await rpc<Resposta>('walkstamp_roteiro_atribuir', {
    p_admin: email,
    p_caso_id: Number(form.get('caso_id')) || 0,
    p_para: String(form.get('para') || '').trim().toLowerCase(),
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) return volta(lang, 'erro', recusa(lang, r.erro));
  volta(lang, 'feito', t.rotAtribuido, r?.id);
}

export async function apagarRoteiro(form: FormData) {
  const lang = idioma(form);
  const t = textos(lang);
  const email = await emailDaSessao();
  if (!email) return volta(lang, 'erro', t.erroEntrePrimeiro);

  const r = await rpc<Resposta>('walkstamp_roteiro_apagar', {
    p_email: email, p_id: Number(form.get('id')) || 0,
  }).catch(() => ({ erro: 'leitura' }) as Resposta);
  if (r?.erro) return volta(lang, 'erro', recusa(lang, r.erro));
  /* Apagar o roteiro apaga os arquivos dos casos dele. Sem esta linha, a
     política de privacidade estaria mentindo na frase mais importante dela. */
  await faxinar(r?.faxina);
  volta(lang, 'feito', t.rotApagado);
}
