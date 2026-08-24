"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cartao, Selo, dinheiro } from "./pecas";
import PainelDoMes from "./financeiro/PainelDoMes";
import SinaisDeVida from "./SinaisDeVida";

/**
 * O MÊS — a tela inicial.
 *
 * Responde de cima para baixo a única pergunta que importa no dia a dia:
 * QUEM FOI LIMPO E QUEM PAGOU.
 *
 * O que havia aqui antes: capacidade do dia, rascunhos da IA, leads novos do
 * site e indicadores de gestão — números de um sistema que saiu de escopo, e
 * nenhum deles dizia se o mês estava fechando.
 *
 * A TELA TEM DUAS METADES, e a ordem entre elas é a decisão.
 *
 *   em cima   O PAINEL DO MÊS (0105) — como o mês está: receita, recebido,
 *             em aberto com aging, entrega, custos, carteira.
 *   embaixo   A LISTA DE TRABALHO — quem falta limpar e quem falta pagar,
 *             família por família, para clicar e resolver.
 *
 * O painel nasceu como aba do Financeiro e foi um erro meu: o menu já tinha
 * "O mês" como primeira entrada, e era ali que se procurava. Ficaram três
 * portas para a mesma pergunta — o defeito que este projeto mais repete. O
 * painel subiu para cá, e o Financeiro ficou com o que é AÇÃO (fechar,
 * conferir, resultado por jazigo).
 *
 * Ler primeiro, agir depois: os números dizem se o mês vai fechar, a lista diz
 * em quem tocar para que feche.
 */

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

/** 2026-08-31 -> "31/08/2026". Sem `new Date`, que muda o dia por fuso. */
function dataCurta(iso: string) {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function Painel() {
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "pendentes">("pendentes");
  /** Quem escreveu pelo site e ainda espera — ver o comentário do bloco abaixo. */
  const [contatos, setContatos] = useState<{ total: number; atrasados: number } | null>(null);

  useEffect(() => {
    fetch("/api/contatos")
      .then((r) => r.json())
      .then((r) => { if (r?.ok) setContatos({ total: r.resumo.total, atrasados: r.resumo.atrasados }); })
      // Silencioso de propósito: esta tela é sobre o mês. Se a fila de contatos
      // não responder, o mês continua aparecendo — só o aviso não sai.
      .catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/mes?competencia=${competencia}`).then((x) => x.json());
      if (r?.ok) setDados(r);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const linhas = (dados?.linhas || []).filter((l: any) =>
    filtro === "todas" ? true : !l.limpezaOk || !l.pagamentoOk
  );
  const r = dados?.resumo;
  const mesNome = `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">O mês</h1>
        <input
          type="month"
          value={competencia.slice(0, 7)}
          onChange={(e) => setCompetencia(`${e.target.value}-01`)}
          className="rounded-lg border border-line bg-card px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
        />
      </div>

      {/* SINAIS DE VIDA vem antes de tudo. Uma família esperando resposta é
          urgente; um cano entupido é a razão pela qual não se sabe quantas
          estão esperando. */}
      <SinaisDeVida />

      {/* PRECISA DE VOCÊ — quem escreveu pelo site e ainda espera.
          Fica ACIMA dos números do mês porque é a única coisa desta tela com
          relógio correndo: o site promete "respondemos no mesmo dia".

          Existia um card assim e ele saiu quando esta tela virou "O mês" — sem
          que os avisos do formulário soubessem: eles continuaram apontando
          para /painel/leads, que o middleware devolve como 404. Um contato do
          site podia ficar no banco sem tela nenhuma em que aparecesse. */}
      {contatos && contatos.total > 0 && (
        <Link
          href="/painel/contatos"
          className={`mb-4 block rounded-xl2 border p-4 ${
            contatos.atrasados > 0
              ? "border-aviso/40 bg-aviso/10"
              : "border-line bg-card hover:bg-surface"}`}
        >
          <p className={`text-[16px] font-semibold ${contatos.atrasados > 0 ? "text-aviso" : "text-ink"}`}>
            {contatos.total} {contatos.total === 1 ? "pessoa escreveu" : "pessoas escreveram"} pelo site
            {contatos.atrasados > 0 && (
              <> — {contatos.atrasados} sem ninguém ter tentado falar</>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            Abrir a fila de contatos →
          </p>
        </Link>
      )}

      {/* ================= O PAINEL DO MÊS =================
          Mesmo componente do Financeiro — não uma segunda versão. Duas telas
          com contas diferentes sobre os mesmos fatos é o defeito que já mordeu
          a agenda (0092), o painel (0105) e a lista de famílias (0106). */}
      <PainelDoMes />

      <h2 className="mb-3 mt-6 text-[15px] font-bold tracking-[0.2px] text-ink">
        Quem falta limpar e quem falta pagar
      </h2>

      {/* Três números e nada mais no topo: o que falta fazer, o que falta
          entrar, e quanto isso soma.

          A LINHA DE BAIXO NÃO É ENFEITE. Os três números falavam de tempos
          diferentes sem dizer: "falta limpar" era o mês escolhido, "falta pagar"
          era hoje. A auditoria reprovou (CA-02) pedindo que a interface declare
          o momento. Agora os três são do mesmo instante, e a tela diz qual. */}
      {r && (
        <div className="mb-4 rounded-xl2 bg-brand p-4 text-sobre">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[26px] font-semibold leading-tight">{r.faltaLimpar}</p>
              <p className="text-[12px] opacity-75">falta limpar</p>
            </div>
            <div>
              <p className="text-[26px] font-semibold leading-tight">{r.faltaPagar}</p>
              <p className="text-[12px] opacity-75">falta pagar</p>
            </div>
            <Link href="/painel/financeiro" className="block">
              <p className="text-[26px] font-semibold leading-tight">{dinheiro(r.emAberto)}</p>
              <p className="text-[12px] opacity-75">em aberto →</p>
            </Link>
          </div>
          {dados?.saldoEm && (
            <p className="mt-3 border-t border-white/20 pt-2 text-[11px] opacity-70">
              {dados.mesFechado
                ? `Posição de ${dataCurta(dados.saldoEm)} — como a conta fechou em ${mesNome}.`
                : `Posição de hoje — ${mesNome} ainda está em andamento.`}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {(["pendentes", "todas"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${
              filtro === v
                ? "border-transparent bg-brand text-sobre"
                : "border-line bg-card text-ink hover:bg-surface"
            }`}
          >
            {v === "pendentes" ? "Só as pendentes" : "Todas as famílias"}
          </button>
        ))}
      </div>

      {carregando && <p className="text-[15px] text-ink-soft">Carregando {mesNome}…</p>}

      {!carregando && !linhas.length && (
        <Cartao>
          <p className="text-[16px] font-semibold text-positivo">
            {filtro === "pendentes"
              ? "Nenhuma pendência neste mês. 🌿"
              : "Nenhuma família cadastrada ainda."}
          </p>
          {filtro === "pendentes" && (
            <p className="mt-1 text-[14px] text-ink-soft">
              Todas limpas e todas em dia em {mesNome}.
            </p>
          )}
        </Cartao>
      )}

      {linhas.map((l: any) => (
        <Link
          key={l.familiaId}
          href={`/painel/clientes?familia=${l.familiaId}`}
          className="mb-2 block rounded-xl2 border border-line bg-card p-4 hover:bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-medium text-ink">{l.nome}</p>
              {l.local && <p className="text-[13px] text-ink-soft">{l.local}</p>}
            </div>

            {/* As duas colunas escritas por extenso: um ✓ e um ✗ sozinhos
                exigiriam decorar qual é qual. */}
            <div className="flex items-center gap-2">
              {l.semPlano ? (
                <Selo tom="neutro">avulso</Selo>
              ) : l.limpezaOk ? (
                <Selo tom="bom">limpa</Selo>
              ) : (
                <Selo tom="atencao">
                  {l.limpos > 0 ? `${l.limpos} de ${l.contratados}` : "falta limpar"}
                </Selo>
              )}
              {l.pagamentoOk ? (
                <Selo tom="bom">em dia</Selo>
              ) : (
                <Selo tom="atencao">{dinheiro(l.saldo)}</Selo>
              )}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
