"use client";

import { useState } from "react";
import { useBusca, horaCurta } from "@/lib/buscar";
import { Falhou, Desde } from "../pecas";
import { useConfirmar, useRecado } from "@/components/Dialogos";
import { painel, cor } from "../ui";

/**
 * TRABALHO FEITO QUE NÃO DEIXOU MARCA (0137).
 *
 * O QUE ESTA TELA MOSTRA, E POR QUE ELA EXISTE
 *
 * Uma limpeza concluída deixa quatro marcas: o preço congelado, a baixa do
 * material, o pagamento da equipe e — quando há foto — a linha na fila da
 * família. Medido em produção: das cinco limpezas executadas, duas não tinham
 * preço nenhum e nenhuma tinha o pagamento da equipe.
 *
 * A causa das duas sem preço era uma porta que criava a limpeza já executada
 * sem passar pela transação de conclusão. Essa porta foi fechada na 0137 —
 * agora as quatro portas chamam a mesma transação. Esta tela é para o que JÁ
 * ficou para trás, e para ver na hora se alguma nova escapar.
 *
 * O CONSERTO NÃO INVENTA NADA. Ele chama a mesma
 * `sureya_concluir_lavagem` que a conclusão normal chama; ela foi escrita
 * para ser chamada duas vezes e devolve o que carimbou. Repetir o toque não
 * muda o resultado, e nada aqui se perde: só preenche o que estava vazio.
 *
 * A FOTO ANTIGA NÃO ENTRA NA FILA. Consertar número não mexe no que vai ser
 * dito à família — uma foto de três semanas atrás aparecendo na fila hoje é
 * decisão sua, pela tela de Conversas, não efeito de um botão de manutenção.
 */
export default function Manutencao() {
  const perguntar = useConfirmar();
  const recado = useRecado();
  const { fase, dados, erro, atualizadoEm, recarregar } =
    useBusca<any>("/api/manutencao/lavagens-incompletas");
  const [ocupado, setOcupado] = useState(false);

  async function consertar(servicoId?: string) {
    const quantas = servicoId ? 1 : lavagens.length;
    const ok = await perguntar({
      oQue: servicoId ? "Completar esta limpeza?" : `Completar ${quantas} limpezas?`,
      efeito:
        "O sistema vai preencher o preço, a baixa do material e o pagamento da equipe " +
        "usando as mesmas regras da conclusão normal. Nada é apagado e nenhuma mensagem " +
        "é enviada.",
      confirmar: "Completar",
    });
    if (!ok) return;

    setOcupado(true);
    const r = await fetch("/api/manutencao/lavagens-incompletas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(servicoId ? { servicoId } : {}),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);

    if (!r?.ok) {
      recado.erro(r?.mensagem || r?.erro || "Não consegui completar.");
      return;
    }

    // O QUE SOBROU FAZ PARTE DO RESULTADO.
    //
    // Dizer "2 completadas" e calar que 2 continuam na lista seria anunciar um
    // resultado que não aconteceu — e é exatamente o que acontece enquanto não
    // houver regra de pagamento cadastrada: a transação não tem com o que
    // calcular, e ela está certa em não inventar.
    const feitas = (r.consertadas || []).length;
    const sobrou = Number(r.aindaIncompletas) || 0;
    if (sobrou > 0) {
      recado.aviso(
        `${feitas} ${feitas === 1 ? "completada" : "completadas"}, mas ${sobrou} ` +
        `${sobrou === 1 ? "continua" : "continuam"} na lista. Veja o que falta em cada uma.`);
    } else {
      recado.ok(`${feitas} ${feitas === 1 ? "limpeza completada" : "limpezas completadas"}.`);
    }
    recarregar();
  }

  if (fase === "carregando" && !dados) {
    return <p style={{ color: cor.cinza }}>Lendo as limpezas…</p>;
  }
  if (fase === "erro" && !dados) {
    return <Falhou mensagem={erro || "Não consegui ler as limpezas."} aoTentar={recarregar} />;
  }
  if (!dados) return null;

  const lavagens: any[] = dados.lavagens || [];
  const resumo = dados.resumo;

  return (
    <div>
      <section style={painel.card}>
        <strong style={{ color: cor.navy, fontSize: 17 }}>Limpezas feitas pela metade</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "8px 0 0", lineHeight: 1.55 }}>
          Uma limpeza concluída deixa quatro marcas: o <b>preço</b> congelado dela, a{" "}
          <b>baixa do material</b>, o <b>pagamento da equipe</b> e, quando há foto, a{" "}
          <b>linha na fila</b> da família. Aqui ficam as que não deixaram alguma delas.
        </p>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "10px 0 0", lineHeight: 1.5 }}>
          Isto <b>não</b> é cobrança em falta: quem gera a dívida da família é a competência do
          mês, não a limpeza. O que falta aqui é o registro interno — o preço no histórico, o
          sabão no estoque, o valor da Nina.
        </p>
      </section>

      {fase === "erro" && (
        <Falhou mensagem={erro || "Não consegui atualizar."} aoTentar={recarregar}
                parcial desde={horaCurta(atualizadoEm)} />
      )}

      {/* NÃO É UMA LIMPEZA COM DEFEITO: É UMA CONFIGURAÇÃO QUE FALTA.
          Enquanto não houver regra nenhuma, a transação não carimba pagamento —
          e está certa: não dá para inventar quanto alguém ganha. Por isso o
          recado aparece uma vez, aqui, em vez de virar um alarme por limpeza. */}
      {resumo?.sem_regra_equipe && (
        <section style={{ ...painel.card, borderLeft: `4px solid ${cor.aviso}` }}>
          <strong style={{ color: cor.aviso, fontSize: 15.5 }}>
            Não há regra de pagamento cadastrada
          </strong>
          <p style={{ color: cor.cinza, fontSize: 14.5, margin: "6px 0 0", lineHeight: 1.5 }}>
            Enquanto não existir uma, toda limpeza fica sem o valor da equipe — e completar
            aqui não resolve essa parte, porque não há com o que calcular. Defina quanto se
            paga por jazigo em <b>Financeiro → Pagamento da equipe</b>. Depois volte aqui.
          </p>
        </section>
      )}

      {/* VAZIO NÃO É ZERO. Resumo que não veio não vira "está tudo em dia". */}
      {resumo === null && (
        <p style={{ ...painel.card, color: cor.aviso, fontSize: 15 }}>
          Não consegui ler o resumo. A lista abaixo pode estar incompleta.
        </p>
      )}

      {!lavagens.length ? (
        <p style={{ ...painel.card, color: cor.teal, fontSize: 15.5 }}>
          Toda limpeza feita deixou suas marcas. 🌿
        </p>
      ) : (
        <>
          <section style={painel.card}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <strong style={{ color: cor.navy, fontSize: 16, flex: 1, minWidth: 200 }}>
                {lavagens.length} {lavagens.length === 1 ? "limpeza" : "limpezas"} para completar
              </strong>
              <button style={painel.botao} disabled={ocupado} onClick={() => consertar()}>
                {ocupado ? "Completando…" : "Completar todas"}
              </button>
            </div>
          </section>

          {lavagens.map((l: any) => (
            <section key={l.servico_id} style={painel.card}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong style={{ color: cor.navy, fontSize: 16 }}>
                    {l.familia_nome || "Família não identificada"}
                  </strong>
                  <p style={{ color: cor.cinza, fontSize: 14, margin: "3px 0 0" }}>
                    {l.tumulo_codigo || "jazigo sem código"} · limpa em{" "}
                    {l.data_executada
                      ? new Date(l.data_executada).toLocaleDateString("pt-BR")
                      : "data não registrada"}
                    {" · "}
                    {Number(l.valor) > 0
                      ? `R$ ${Number(l.valor).toFixed(2).replace(".", ",")}`
                      : "sem preço"}
                  </p>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {(l.faltando || []).map((f: string) => (
                      <li key={f} style={{ color: cor.aviso, fontSize: 14.5, lineHeight: 1.5 }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  style={painel.botaoMiniSec}
                  disabled={ocupado}
                  onClick={() => consertar(l.servico_id)}
                >
                  Completar
                </button>
              </div>
            </section>
          ))}
        </>
      )}

      <Desde hora={horaCurta(atualizadoEm)} />
    </div>
  );
}
