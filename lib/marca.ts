/* A identidade, e só ela.
 *
 * Está num arquivo separado do resto do site por um motivo concreto: o
 * `middleware` roda no Edge, onde não existe sistema de arquivos. Se `marca`
 * viesse do mesmo módulo que lê os corpos das páginas em disco, importar o nome
 * da marca arrastaria o `fs` junto e o build quebrava.
 *
 * `src/marca.json` é escrito pelo `build.py`, que continua sendo o dono do nome,
 * do domínio e das chaves públicas. Aqui é importação estática — o valor entra
 * no pacote na hora do build, sem ler disco em tempo de execução.
 */
import dados from '@/src/marca.json';

export const marca: {
  marca: string; marcaA: string; marcaB: string; site: string; iconV: string;
  empresa: string; cnpj: string; contato: string; encarregado: string;
  supaUrl: string; supaKey: string; analytics: string;
  licPub: string; licPubAuto: string;
} = dados;

/* O endereço do serviço de autenticação.
 *
 * Em produção é sempre o do `marca.json`, e não há como não ser. A exceção
 * existe para os testes: eles sobem um Supabase de mentira e precisam que a
 * sessão do servidor fale com ele, e não com o projeto de verdade — sem isso, a
 * área do cliente só é testável deslogada.
 *
 * A trava é o formato do valor: **só um endereço local é aceito**. Uma variável
 * mal configurada em produção não consegue apontar para um servidor de
 * terceiro; no máximo aponta para o próprio processo, e aí quebra na hora e à
 * vista, que é o jeito certo de uma configuração errada falhar.
 *
 * Mora aqui, e não em `lib/supabase/servidor.ts`, porque o `middleware` também
 * precisa dela e roda no Edge, onde `next/headers` não existe. As duas pontas
 * lendo endereços diferentes seria pior do que não ter override nenhum: o
 * middleware derruba a sessão que a página acabou de aceitar, porque a chave do
 * cookie sai do endereço e as duas deixariam de bater.
 */
export function enderecoDaSessao(): string {
  const teste = process.env.WALKSTAMP_SUPA_TESTE || '';
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(teste) ? teste : marca.supaUrl;
}
