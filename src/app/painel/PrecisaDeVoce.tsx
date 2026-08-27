"use client";

import Link from "next/link";
import { useBusca, horaCurta } from "@/lib/buscar";
import { Falhou, Desde } from "./pecas";

/**
 * PRECISA DE VOCÊ — o bloco que faltava na tela inicial (CA-01).
 *
 * A tela inicial responde "quem falta limpar e quem falta pagar". Não responde
 * o que espera decisão dela FORA do mês: mensagem pronta na fila de liberação,
 * comprovante para conferir, família que escreveu e não teve resposta, contato
 * do site. Nada disso tem marcador no menu. Dava para encerrar o dia numa tela
 * verde com quatro mensagens paradas esperando o toque dela.
 *
 * ONDE ELE FICA, E POR QUÊ
 *
 *   Sinais de vida    um cano entupido — a razão de não se saber quanta gente
 *                     está esperando. Vem antes de tudo.
 *   Precisa de você   as filas com gente do outro lado.
 *   O painel do mês   os números.
 *   A lista           em quem tocar.
 *
 * O que quebrou vem antes do que espera, que vem antes do que se lê.
 *
 * SUMIR QUANDO ESTÁ TUDO EM DIA É DE PROPÓSITO. Bloco que fica sempre na tela
 * com quatro zeros vira moldura, e moldura ninguém lê — foi a lição da faixa
 * de Sinais de vida. Mas ele NÃO some quando a busca falha: aí ele fica e diz
 * que não conseguiu saber, porque esse é o caso inteiro da CA-13.
 */

interface Fila {
  chave: string;
  n: number | null;
  href: string;
  um: string;
  varios: string;
  rodape: string;
}

/** "3 mensagens esperando" / "1 mensagem esperando". */
function frase(f: Fila): string {
  return `${f.n} ${f.n === 1 ? f.um : f.varios}`;
}

export default function PrecisaDeVoce() {
  const { fase, dados, erro, atualizadoEm, recarregar } = useBusca<any>("/api/precisa-de-voce");

  // Enquanto nunca deu certo, o bloco não existe: mostrar um esqueleto acima
  // do mês empurraria os números para baixo a cada abertura de tela.
  if (fase === "carregando" && !dados) return null;

  if (fase === "erro" && !dados) {
    return (
      <Falhou
        mensagem={erro || "Não consegui ver o que está esperando você."}
        aoTentar={recarregar}
      />
    );
  }
  if (!dados) return null;

  const a = dados.agora || {};
  const filas: Fila[] = [
    { chave: "liberacao", n: a.liberacao, href: "/painel/conversas",
      um: "mensagem pronta esperando você liberar",
      varios: "mensagens prontas esperando você liberar",
      rodape: "Nenhuma sai sozinha — só com o seu toque." },
    { chave: "conversas", n: a.conversas, href: "/painel/conversas?aba=conversas",
      um: "conversa precisa de você", varios: "conversas precisam de você",
      rodape: "Família sem resposta, rascunho da IA ou caixa da equipe." },
    { chave: "comprovantes", n: a.comprovantes, href: "/painel/financeiro",
      um: "comprovante para conferir", varios: "comprovantes para conferir",
      rodape: "Só vira dinheiro no caixa depois que você confirma." },
    { chave: "contatos", n: a.contatos, href: "/painel/conversas?aba=site",
      um: "pessoa escreveu pelo site", varios: "pessoas escreveram pelo site",
      rodape: "O site promete resposta no mesmo dia." },
  ];

  const comTrabalho = filas.filter((f) => (f.n ?? 0) > 0);
  // FILA QUE NÃO RESPONDEU NÃO É FILA VAZIA. A rota devolve `null` quando a
  // consulta falhou, justamente para a tela não anunciar "nada aqui" sobre o
  // que ela não conseguiu ler.
  const naoSoube = filas.filter((f) => f.n === null);
  const semJazigo = dados.quandoDer?.semJazigo ?? 0;

  // TRABALHO FEITO PELA METADE. Vem da mesma função da tela de manutenção.
  // `null` = não consegui ler; aí o bloco não some, ele diz que não soube.
  const lav = dados.quandoDer?.lavagens;
  const incompletas = lav ? Number(lav.incompletas) || 0 : 0;
  const semRegraEquipe = !!lav?.semRegraEquipe;

  if (!comTrabalho.length && !naoSoube.length && !semJazigo
      && !incompletas && !semRegraEquipe && fase !== "erro") return null;

  return (
    <section className="mb-4 rounded-xl2 border border-line bg-card p-4">
      <h2 className="text-[15px] font-bold tracking-[0.2px] text-ink">Precisa de você</h2>

      {fase === "erro" && (
        <div className="mt-3">
          <Falhou
            mensagem={erro || "Não consegui atualizar."}
            aoTentar={recarregar}
            parcial
            desde={horaCurta(atualizadoEm)}
          />
        </div>
      )}

      {comTrabalho.length > 0 && (
        <ul className="mt-3 space-y-2">
          {comTrabalho.map((f) => (
            <li key={f.chave}>
              <Link
                href={f.href}
                className="block rounded-lg border border-aviso/40 bg-aviso/10 p-3 hover:bg-aviso/20"
              >
                <p className="text-[16px] font-semibold text-aviso">{frase(f)} →</p>
                <p className="mt-0.5 text-[13px] text-ink-soft">{f.rodape}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!comTrabalho.length && !naoSoube.length && (
        <p className="mt-2 text-[15px] text-positivo">
          Nada esperando por você agora. 🌿
        </p>
      )}

      {/* NÃO SOUBE ≠ ESTÁ VAZIO. */}
      {naoSoube.length > 0 && (
        <p className="mt-3 rounded-lg border border-perigo/40 bg-perigo/5 p-3 text-[14px] text-perigo">
          Não consegui ler {naoSoube.length === 1 ? "uma destas filas" : `${naoSoube.length} destas filas`}
          {" "}({naoSoube.map((f) => f.chave).join(", ")}). Pode ter trabalho ali que não estou mostrando.
        </p>
      )}

      {/* LAVAGEM FEITA QUE NÃO DEIXOU MARCA (0137).
          Fica no "quando der" porque o trabalho JÁ foi entregue: ninguém está
          esperando do outro lado. Mas é dinheiro e estoque fora do lugar, e
          por isso vem antes do cadastro incompleto. */}
      {incompletas > 0 && (
        <Link
          href="/painel/config?aba=manutencao"
          className="mt-3 block border-t border-line pt-3 text-[13px] text-ink-soft hover:text-ink"
        >
          Quando der: {incompletas} {incompletas === 1 ? "limpeza feita" : "limpezas feitas"}
          {" "}não {incompletas === 1 ? "deixou" : "deixaram"} marca — sem preço, sem baixa
          de material ou sem o pagamento da equipe. →
        </Link>
      )}

      {/* NÃO É UMA LAVAGEM COM DEFEITO: É UMA CONFIGURAÇÃO QUE FALTA.
          Enquanto não houver regra de pagamento nenhuma, nenhuma lavagem é
          acusada de "pagamento não calculado" — não há com o que calcular. Um
          recado só, no lugar de um alarme por limpeza. */}
      {semRegraEquipe && (
        <Link
          href="/painel/financeiro?aba=pagamento"
          className="mt-3 block border-t border-line pt-3 text-[13px] text-ink-soft hover:text-ink"
        >
          Quando der: não há regra de pagamento cadastrada. As limpezas já feitas
          ficam sem o valor da equipe até você definir quanto se paga por jazigo. →
        </Link>
      )}

      {/* QUANDO DER — trabalho de verdade, sem relógio correndo. Fica embaixo e
          em cinza: 122 famílias sem jazigo é um número que não se mexe há
          meses, e número parado no meio dos alarmes ensina a ignorar alarme. */}
      {semJazigo > 0 && (
        <Link
          href="/painel/clientes"
          className="mt-3 block border-t border-line pt-3 text-[13px] text-ink-soft hover:text-ink"
        >
          Quando der: {semJazigo} {semJazigo === 1 ? "família está" : "famílias estão"} sem
          nenhum jazigo cadastrado — não dá para lavar nem cobrar. →
        </Link>
      )}

      <Desde hora={horaCurta(atualizadoEm)} />
    </section>
  );
}
