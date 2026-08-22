/* AS ABAS DO BACK-OFFICE.
 *
 * O `/negocio` é o escritório de uma pessoa só — o dono, checado pelo
 * `WALKSTAMP_DONO` no servidor. Por isso ele é o único canto do produto escrito
 * em português direto: traduzir "cobranças" para cinco idiomas que ninguém vai
 * abrir é manutenção paga em cinco lugares para uma tela com um leitor. O que é
 * traduzido é o ITEM DO MENU (`navNegocio`), porque ele divide a barra lateral
 * com itens que clientes leem.
 *
 * A lista de slugs vem do `rotas.json` — a mesma que o `next.config.mjs` usa
 * para montar a ponte de reescrita. Escrita nos dois lugares, seria uma aba que
 * aparece na faixa e dá 404 no clique; e este projeto já perdeu o `hreflang`
 * do alemão exatamente assim.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Lang } from '@/lib/conta/textos';
import { enderecoDoItem } from '@/lib/conta/nav';

const rotas = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'rotas.json'), 'utf8'),
) as { abasNegocio: string[] };

/** O rótulo de cada aba. A chave TEM que existir em `abasNegocio`; a conferência
 *  logo abaixo quebra o build se alguém acrescentar uma sem a outra. */
const ROTULO: Record<string, string> = {
  contas:    'Contas',
  cobrancas: 'Cobranças',
  chamados:  'Chamados',
  interesse: 'Interesse',
  blog:      'Blog',
};

for (const a of rotas.abasNegocio) {
  if (!ROTULO[a]) {
    throw new Error(
      `abasNegocio tem "${a}" no rotas.json e nenhum rótulo em lib/conta/negocio.ts — ` +
      'a aba apareceria na faixa sem nome',
    );
  }
}

export type Aba = { slug: string; rotulo: string; href: (lang: Lang) => string };

/** A raiz do back-office é a primeira aba, e ela não tem slug: é o radar. */
export const ABAS: Aba[] = [
  { slug: '', rotulo: 'Radar', href: (l) => enderecoDoItem('negocio', l) },
  ...rotas.abasNegocio.map((slug) => ({
    slug,
    rotulo: ROTULO[slug],
    href: (l: Lang) => `${enderecoDoItem('negocio', l)}/${slug}`,
  })),
];

/** Os slugs que precisam de arquivo de rota — o teste usa isto para conferir
 *  que nenhuma aba da faixa ficou sem página. */
export const SLUGS_NEGOCIO = rotas.abasNegocio;
