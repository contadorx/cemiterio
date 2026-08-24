"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";
import { mesOperacao } from "@/lib/vencimento";

/**
 * O PAINEL DO MÊS — financeiro e operacional na mesma tela.
 *
 * A ORDEM DOS BLOCOS é a ordem das perguntas de quem abre o mês:
 *
 *   1. o mês fechou quanto?        receita · recebido · em aberto
 *   2. quem não pagou, e há quanto tempo?      aging
 *   3. a casa entregou o que cobrou?           lavagens · cobrança sem entrega
 *   4. quanto custou?                          mão de obra · materiais
 *   5. do que vive o negócio?                  carteira
 *
 * TODO NÚMERO VEM DE `sureya_painel_do_mes` (0105), uma função só. Cada cartão
 * com a sua própria consulta é como o aviso da agenda ficou meses sem zerar: o
 * contador e o movedor usavam definições diferentes de "fora do lugar" (0092).
 * Um painel cujos números discordam entre si ensina a não confiar em nenhum.
 *
 * ⚠ VAZIO NÃO É ZERO.
 *
 * Medido em 23/08: `lancamentos` tem ZERO linhas. As onze categorias de
 * despesa existem desde sempre — "Materiais", "Pagamento da ajudante" — e
 * ninguém lançou uma. Mostrar "R$ 0,00 de material" seria apresentar ausência
 * de registro como medição, e a margem sairia inflada com cara de fato. Onde
 * não há registro, a tela diz que não há e mostra o caminho.
 */

const brl = (n: any) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mesPorExtenso = (m: string) => {
  if (!/^\d{4}-\d{2}$/.test(m || "")) return m;
  const [a, mm] = m.split("-");
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                 "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(mm) - 1]} de ${a}`;
};

export default function PainelDoMes() {
  const [mes, setMes] = useState(mesOperacao());
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  // O RELATÓRIO ABERTO. Um por vez: dois abertos empilham listas longas e a
  // pessoa perde de vista qual número gerou qual.
  const [aberto, setAberto] = useState<string>("");

  const carregar = useCallback(async () => {
    setErro("");
    const r = await fetch(`/api/financeiro/painel?mes=${mes}`)
      .then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); setD(null); return; }
    setD(r);
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return (
    <div style={painel.card}>
      <p style={{ color: cor.perigo }}>Não deu para carregar: {erro}</p>
      <button style={painel.botaoMiniSec} onClick={carregar}>Tentar de novo</button>
    </div>
  );
  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const rec = d.receita, reb = d.recebido, ina = d.inadimplencia;
  // O QUE JÁ FOI PRESTADO E AINDA NÃO VENCEU (0114). Nem receita do mês, nem
  // dívida: é o dinheiro reconhecido que ainda vai ser cobrado.
  const fut = d.a_vencer || { valor: 0, familias: 0 };
  const lav = d.lavagens, cus = d.custos, car = d.carteira, res = d.resultado;
  // OS BLOCOS DA AUDITORIA (0120). Coalesce porque um painel de mês antigo,
  // servido por cache, ainda pode vir sem eles.
  const cob = d.cobertura || {}, msg = d.mensagens || {}, ia = d.ia || {}, flo = d.flores || {};

  const abrir = (b: string) => setAberto((x) => (x === b ? "" : b));

  // A COBERTURA DA COBRANÇA. Contratado não é o mesmo que cobrável: falta
  // valor combinado e falta a data. É a diferença entre "vendemos" e "vamos
  // receber", e é o número que explica uma receita menor do que se esperava.
  const faltaCobrar = (car.contratados || 0) - (car.prontos || 0);

  return (
    <>
      {/* ------------------------------------------------ o seletor */}
      <div style={{ ...painel.card, display: "flex", gap: 12,
                    alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ color: cor.navy, fontSize: 17 }}>
          {mesPorExtenso(d.mes)}
        </strong>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
               style={{ ...painel.input, margin: 0, width: 170 }} />
        <button style={painel.botaoMiniSec} onClick={carregar}>Atualizar</button>
      </div>

      {/* ============================================ 1 · O DINHEIRO */}
      <Faixa titulo="O mês fechou quanto" />
      <div style={grade}>
        {/* O RODAPÉ CONTA O QUE COMPÕE. Juros e multa são receita e não
            apareciam em lugar nenhum antes da 0123; desconto é receita que ela
            abriu mão, então SAI do total — e some do rodapé quando é zero, para
            não encher a tela com quatro zeros todo mês. */}
        <Cartao titulo="Receita da competência" valor={brl(rec.total)} tom="neutro"
                rodape={[
                  `${rec.cobrancas} cobrança(s) de contrato`,
                  Number(rec.avulsos) > 0 ? `avulsos ${brl(rec.avulsos)}` : null,
                  Number(rec.juros) + Number(rec.multa) > 0
                    ? `juros e multa ${brl(Number(rec.juros) + Number(rec.multa))}` : null,
                  Number(rec.outros) > 0 ? `outros ${brl(rec.outros)}` : null,
                  Number(rec.descontos) > 0 ? `−${brl(rec.descontos)} de desconto` : null,
                ].filter(Boolean).join(" · ")} />
        <Cartao titulo="Recebido no mês" valor={brl(reb.total)} tom="bom"
                rodape={`${reb.pagamentos} pagamento(s) · por data de entrada`} />
        <Cartao titulo="Em aberto" valor={brl(ina.em_aberto)}
                tom={Number(ina.em_aberto) > 0 ? "atencao" : "bom"}
                rodape={`${ina.familias} família(s) devendo · já venceu`} />
        <Cartao titulo="A vencer" valor={brl(fut.valor)} tom="neutro"
                rodape={`${fut.familias} família(s) · prestado, ainda não venceu`} />
      </div>

      <p style={nota}>
        <b>Receita</b> é por <b>competência</b> — o mês a que a cobrança se refere.{" "}
        <b>Recebido</b> é por <b>data</b> — o dia em que o dinheiro entrou. Os dois
        quase nunca batem, e é assim mesmo: um pagamento de julho que caiu em agosto
        aparece no recebido de agosto e na competência de julho.
      </p>
      <p style={nota}>
        <b>Em aberto</b> é o que já <b>venceu</b> e não foi pago — é daí que sai a
        régua. <b>A vencer</b> é a competência do serviço já prestado cujo
        vencimento ainda não chegou: quem paga no fim do período (semestre, ano)
        aparece aqui, e não entre os devedores.
      </p>

      {/* ============================================ 2 · QUEM DEVE */}
      <Faixa titulo="Quem não pagou, e há quanto tempo" />
      {Number(ina.em_aberto) === 0 ? (
        <div style={painel.card}>
          <p style={{ margin: 0, fontSize: 15, color: cor.cinza }}>
            Ninguém em aberto neste mês.
            {Number(fut.valor) > 0 && ` ${brl(fut.valor)} a vencer não é atraso.`}
          </p>
        </div>
      ) : (
        <>
          <div style={grade}>
            <Cartao titulo="Até 30 dias" valor={brl(ina.ate_30)} tom="neutro" />
            <Cartao titulo="31 a 60 dias" valor={brl(ina.d31_60)}
                    tom={Number(ina.d31_60) > 0 ? "atencao" : "neutro"} />
            <Cartao titulo="61 a 90 dias" valor={brl(ina.d61_90)}
                    tom={Number(ina.d61_90) > 0 ? "atencao" : "neutro"} />
            <Cartao titulo="Mais de 90 dias" valor={brl(ina.acima_90)}
                    tom={Number(ina.acima_90) > 0 ? "ruim" : "neutro"} />
          </div>

          <p style={nota}>
            A idade da dívida conta da <b>competência em aberto mais antiga</b>, não do
            último lançamento: quem deve desde março e pagou parte em agosto continua
            sendo uma dívida de março.
          </p>

          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>As famílias</strong>
            {(d.devedores || []).map((f: any) => (
              <div key={f.familia_id}
                   style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}`,
                            display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <Link href={`/painel/clientes/${f.familia_id}`}
                      style={{ color: cor.navy, fontWeight: 600, fontSize: 15 }}>
                  {f.nome || "(sem nome)"}
                </Link>
                <span style={{ fontWeight: 700 }}>{brl(f.saldo)}</span>
                <span style={{ color: cor.cinza, fontSize: 14 }}>há {f.dias} dias</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============================================ 3 · A ENTREGA */}
      <Faixa titulo="A casa entregou o que cobrou" />

      {/* A COBERTURA VEM PRIMEIRO, e "5 limpezas" depois.
          Cinco de quantas? A auditoria de 24/08 mediu 78 jazigos contratados e
          DOIS atendidos no mês. O painel dizia "5 limpezas executadas" e o
          número parecia razoável — sem denominador, qualquer número parece. */}
      <div style={grade}>
        <Cartao titulo="Jazigos atendidos no mês"
                valor={`${cob.atendidos ?? 0} de ${cob.em_servico ?? 0}`}
                tom={Number(cob.nao_atendidos) > 0 ? "atencao" : "bom"}
                destaque
                rodape={Number(cob.parados) > 0
                  ? `${cob.parados} parado(s) a pedido da família, fora da conta`
                  : "sobre os que estão em serviço"} />
        <Cartao titulo="Sem atendimento" valor={String(cob.nao_atendidos ?? 0)}
                tom={Number(cob.nao_atendidos) > 0 ? "ruim" : "bom"}
                abre="nao_atendidos" aoAbrir={abrir} ativo={aberto === "nao_atendidos"}
                rodape="contratado, em serviço, e ninguém foi lá" />
        <Cartao titulo="Limpezas executadas" valor={String(lav.executadas)} tom="neutro"
                abre="lavagens" aoAbrir={abrir} ativo={aberto === "lavagens"}
                rodape={`${lav.em_aberto} agendada(s) à frente`} />
        <Cartao titulo="Sem foto" valor={String(lav.sem_foto ?? 0)}
                tom={Number(lav.sem_foto) > 0 ? "atencao" : "bom"}
                abre="sem_foto" aoAbrir={abrir} ativo={aberto === "sem_foto"}
                rodape={`${lav.com_foto ?? 0} com a prova para a família`} />
      </div>

      <Relatorio bloco="nao_atendidos" aberto={aberto} mes={mes}
                 titulo="Jazigos sem atendimento no mês" />
      <Relatorio bloco="lavagens" aberto={aberto} mes={mes}
                 titulo="As limpezas do mês" />
      <Relatorio bloco="sem_foto" aberto={aberto} mes={mes}
                 titulo="Limpezas sem foto" />

      <div style={grade}>
        <Cartao titulo="Registradas no campo" valor={String(lav.pelo_campo)} tom="bom"
                rodape="alguém apertou “Começar” no jazigo" />
        <Cartao titulo="Anotadas depois" valor={String(lav.anotadas)}
                tom={Number(lav.anotadas) > Number(lav.pelo_campo) ? "atencao" : "neutro"}
                rodape="pelo painel, sem passagem pelo campo" />
        <Cartao titulo="Estornadas" valor={String(lav.estornadas)}
                tom={Number(lav.estornadas) > 0 ? "atencao" : "neutro"} />
      </div>

      <p style={nota}>
        <b>Campo</b> e <b>anotada</b> não são a mesma coisa. Só a primeira tem prova de
        que alguém esteve no jazigo — é o <i>Começar</i> que carimba a hora. A segunda é
        memória de quem digitou. E a <b>foto</b> é uma terceira coisa: é o que a família
        recebe. Limpeza feita e sem foto é serviço prestado que ninguém viu.
      </p>

      {/* O RISCO NOVO. Antes da 0104 a limpeza gerava a cobrança, então o
          risco era serviço entregue e não faturado. Agora o contrato cobra
          sozinho e o risco inverteu: cobrar sem ter ido. Ninguém avisa. */}
      {Number(d.sem_entrega?.tumulos) > 0 ? (
        <div style={{ ...painel.card, background: "#fff7ed", border: "1px solid #fdba74" }}>
          <strong style={{ color: "#7c2d12" }}>
            Cobrado e não entregue — {d.sem_entrega.tumulos} jazigo(s), {brl(d.sem_entrega.valor)}
          </strong>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "#7c2d12" }}>
            Estes jazigos tiveram o contrato cobrado neste mês e <b>nenhuma limpeza
            executada</b>. Desde que a cobrança deixou de depender da limpeza, este é o
            risco da casa — e ele não aparece em lugar nenhum sozinho.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button onClick={() => abrir("sem_entrega")}
                    style={{ ...painel.botaoMiniSec, background: "transparent",
                             border: "none", color: "#7c2d12", padding: 0,
                             textDecoration: "underline", cursor: "pointer" }}>
              {aberto === "sem_entrega" ? "fechar a lista" : "ver quais são"}
            </button>
            <Link href="/painel/agenda" style={{ color: cor.navy }}>Ver a agenda →</Link>
          </p>
        </div>
      ) : Number(rec.cobrancas) > 0 && (
        <div style={{ ...painel.card, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <strong style={{ color: "#065f46" }}>Tudo que foi cobrado teve limpeza no mês.</strong>
        </div>
      )}

      <Relatorio bloco="sem_entrega" aberto={aberto} mes={mes}
                 titulo="Cobrado e não entregue" />

      {/* ==================================== 3b · O QUE A CASA FALOU */}
      <Faixa titulo="O que a casa falou com as famílias" />
      <div style={grade}>
        <Cartao titulo="Mensagens que saíram" valor={String(msg.saidas ?? 0)} tom="neutro"
                abre="mensagens" aoAbrir={abrir} ativo={aberto === "mensagens"}
                rodape={`${msg.entradas ?? 0} chegaram das famílias`} />
        <Cartao titulo="Pela fila de liberação" valor={String(msg.pela_fila ?? 0)}
                tom={Number(msg.saidas) > 0 && Number(msg.pela_fila) === 0 ? "atencao" : "neutro"}
                rodape={`${msg.aguardando ?? 0} esperando o seu comando`} />
        <Cartao titulo="Conversas sem resposta" valor={String(msg.sem_resposta ?? 0)}
                tom={Number(msg.sem_resposta) > 0 ? "atencao" : "bom"}
                abre="sem_resposta" aoAbrir={abrir} ativo={aberto === "sem_resposta"}
                rodape={`de ${msg.conversas ?? 0} conversas do mês`} />
        <Cartao titulo="Falhas de envio" valor={String(msg.falharam ?? 0)}
                tom={Number(msg.falharam) > 0 ? "atencao" : "bom"}
                rodape={`${msg.na_espera ?? 0} na fila de reenvio`} />
      </div>

      <Relatorio bloco="mensagens" aberto={aberto} mes={mes}
                 titulo="Mensagens enviadas no mês" />
      <Relatorio bloco="sem_resposta" aberto={aberto} mes={mes}
                 titulo="Conversas sem resposta" />

      {/* A FILA É A PORTA QUE A CASA ESCOLHEU. Medir quanto passa por ela é
          medir se a decisão pegou — e em agosto/2026 nenhuma das 12 mensagens
          passou. Isso não é erro de ninguém: é um dado sobre como se trabalha
          de verdade, e ele estava invisível. */}
      {Number(msg.saidas) > 0 && Number(msg.pela_fila) === 0 && (
        <p style={nota}>
          Todas as {msg.saidas} mensagens do mês saíram <b>fora da fila de liberação</b>
          {" "}— direto pelo WhatsApp. A fila existe para você ler antes de mandar; se
          ela não está sendo usada, ou o caminho está longo demais, ou não é onde o
          trabalho acontece.
        </p>
      )}

      {/* ==================================== 3c · A IA */}
      <Faixa titulo="A IA está ajudando?" />
      {Number(ia.sugestoes ?? 0) === 0 ? (
        <div style={{ ...painel.card, background: "#f8fafc" }}>
          <strong style={{ color: cor.navy }}>Nenhuma sugestão neste mês.</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, color: cor.cinza }}>
            Sem sugestões não há aproveitamento a medir — e isso é diferente de 0%.
          </p>
        </div>
      ) : (
        <>
          <div style={grade}>
            <Cartao titulo="Sugestões" valor={String(ia.sugestoes)} tom="neutro"
                    rodape={`${ia.chamadas ?? 0} chamada(s) ao modelo`} />
            <Cartao titulo="Você usou" valor={String(ia.usadas ?? 0)}
                    tom={Number(ia.aproveitamento) >= 30 ? "bom" : "atencao"}
                    destaque
                    rodape={ia.aproveitamento != null
                      ? `${ia.aproveitamento}% do que ela escreveu`
                      : undefined} />
            <Cartao titulo="Descartadas" valor={String(ia.descartadas ?? 0)}
                    tom={Number(ia.descartadas) > Number(ia.usadas) ? "atencao" : "neutro"}
                    abre="ia_descartadas" aoAbrir={abrir} ativo={aberto === "ia_descartadas"}
                    rodape="ler por que ajuda a corrigir o texto" />
            <Cartao titulo="Custou" valor={brl(ia.custo)} tom="neutro"
                    rodape={`${Number(ia.tokens || 0).toLocaleString("pt-BR")} tokens`} />
          </div>

          <Relatorio bloco="ia_descartadas" aberto={aberto} mes={mes}
                     titulo="Sugestões descartadas" />

          {Number(ia.aproveitamento) < 20 && (
            <p style={nota}>
              <b>Aproveitamento de {ia.aproveitamento}%.</b> A casa pagou {brl(ia.custo)}
              {" "}para escrever {ia.sugestoes} mensagens e usou {ia.usadas}. Isso pode
              querer dizer três coisas diferentes — o texto não serve, o momento está
              errado, ou a sugestão nunca deveria ter sido feita. A lista dos descartes
              é o único jeito de saber qual delas.
            </p>
          )}
        </>
      )}

      {/* ==================================== 3d · FLORES E EXTRAS */}
      <Faixa titulo="Flores e serviços extras" />
      {Number(flo.assinaturas ?? 0) === 0 && Number(flo.entregues ?? 0) === 0
        && Number(flo.previstas ?? 0) === 0 ? (
        <div style={{ ...painel.card, background: "#f8fafc" }}>
          <strong style={{ color: cor.navy }}>Nenhum combinado de flores ainda.</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, color: cor.cinza }}>
            O combinado mora no jazigo, na ficha da família. Depois de criado, o sábado
            e a compra aparecem em <Link href="/painel/flores" style={{ color: cor.navy }}>Flores →</Link>
          </p>
        </div>
      ) : (
        <>
          <div style={grade}>
            <Cartao titulo="Entregas feitas" valor={String(flo.entregues ?? 0)} tom="bom"
                    abre="flores" aoAbrir={abrir} ativo={aberto === "flores"}
                    rodape={`${flo.previstas ?? 0} ainda previstas no mês`} />
            <Cartao titulo="Receita das flores" valor={brl(flo.receita)} tom="neutro"
                    rodape={`${flo.jazigos ?? 0} jazigo(s)`} />
            <Cartao titulo="Custo dos buquês" valor={brl(flo.custo)} tom="neutro"
                    rodape={`${flo.assinaturas ?? 0} combinado(s) ativo(s)`} />
            <Cartao titulo="Sobra" valor={brl(flo.margem)}
                    tom={Number(flo.margem) > 0 ? "bom" : "neutro"}
                    rodape="sem o seu tempo nem o deslocamento" />
          </div>
          <Relatorio bloco="flores" aberto={aberto} mes={mes}
                     titulo="Entregas de flores no mês" />
        </>
      )}

      {/* ============================================ 4 · O CUSTO */}
      <Faixa titulo="Quanto custou" />
      {Number(cus.lancamentos) === 0 ? (
        <div style={{ ...painel.card, background: "#f8fafc" }}>
          <strong style={{ color: cor.navy }}>Nenhuma despesa lançada neste mês</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.55, color: cor.cinza }}>
            As categorias já existem — <b>Materiais</b>, <b>Pagamento da ajudante</b>,
            Transporte, Impostos — e nenhuma recebeu lançamento. Isto <b>não é custo
            zero</b>: é ausência de registro. Enquanto ficar assim, a margem abaixo é a
            receita, e não o resultado.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 14 }}>
            <Link href="/painel/config" style={{ color: cor.navy }}>
              Configurações → categorias e despesas →
            </Link>
          </p>
        </div>
      ) : (
        <div style={grade}>
          <Cartao titulo="Mão de obra" valor={brl(cus.mao_de_obra)} tom="neutro" />
          <Cartao titulo="Materiais" valor={brl(cus.materiais)} tom="neutro" />
          <Cartao titulo="Outros" valor={brl(cus.outros)} tom="neutro" />
          <Cartao titulo="Total de saídas" valor={brl(cus.total)} tom="atencao"
                  rodape={`${cus.lancamentos} lançamento(s)`} />
        </div>
      )}

      {/* A MARGEM SÓ APARECE SE HOUVER O QUE SUBTRAIR (0120).
          Antes o cartão mostrava `brl(res.margem)` com a margem valendo a
          receita inteira, e o rodapé pedia desculpa embaixo. Um número grande
          com uma ressalva pequena é lido como número grande. Agora o banco
          devolve nulo e a tela mostra a RECEITA, dizendo que é receita. */}
      <div style={grade}>
        {res.tem_custo ? (
          <Cartao titulo="Resultado do mês" valor={brl(res.margem)}
                  tom={Number(res.margem) >= 0 ? "bom" : "ruim"} destaque
                  rodape={`${brl(res.receita)} de receita − ${brl(res.custos)} de custos`} />
        ) : (
          <Cartao titulo="Receita do mês" valor={brl(res.receita)} tom="neutro" destaque
                  rodape="o resultado não dá para saber: nenhuma despesa foi lançada" />
        )}
      </div>

      {/* ============================================ 5 · A CARTEIRA */}
      <Faixa titulo="Do que o negócio vive" />
      <div style={grade}>
        <Cartao titulo="Contrato por mês" valor={brl(car.mensal_contratado)} tom="bom"
                rodape="o que entra por mês se ninguém sair" />
        <Cartao titulo="Jazigos contratados" valor={`${car.contratados} de ${car.jazigos}`}
                tom="neutro" rodape={`ticket médio ${brl(car.ticket)}`} />
        <Cartao titulo="Prontos para cobrar" valor={String(car.prontos)}
                tom={faltaCobrar > 0 ? "atencao" : "bom"}
                rodape={faltaCobrar > 0
                  ? `${faltaCobrar} contratado(s) sem valor ou sem data`
                  : "todos os contratados têm valor e data"} />
        <Cartao titulo="Famílias" valor={String(car.familias)} tom="neutro"
                rodape={`${car.familias_contratadas} com contrato`} />
      </div>

      {faltaCobrar > 0 && (
        <p style={nota}>
          <b>Contratado não é cobrável.</b> Faltam o valor combinado ou a data da próxima
          cobrança em {faltaCobrar} jazigo(s) — enquanto faltarem, eles não entram na
          receita, e o mês fecha menor sem que nada esteja quebrado.{" "}
          <Link href="/painel/conferencia" style={{ color: cor.navy }}>Conferência →</Link>
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

const grade: React.CSSProperties = {
  display: "grid", gap: 10, marginBottom: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
};

const nota: React.CSSProperties = {
  fontSize: 13.5, lineHeight: 1.55, color: cor.cinza,
  margin: "-4px 2px 14px",
};

function Faixa({ titulo }: { titulo: string }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgb(var(--zm-ink))",
                 margin: "18px 2px 10px", letterSpacing: 0.2 }}>
      {titulo}
    </h2>
  );
}

const TONS: Record<string, { fundo: string; borda: string; texto: string }> = {
  neutro:  { fundo: "rgb(var(--zm-card))", borda: "var(--zm-linha, #e2e8f0)", texto: "rgb(var(--zm-ink))" },
  bom:     { fundo: "#ecfdf5", borda: "#a7f3d0", texto: "#065f46" },
  atencao: { fundo: "#fff7ed", borda: "#fdba74", texto: "#7c2d12" },
  ruim:    { fundo: "#fef2f2", borda: "#fca5a5", texto: "#7f1d1d" },
};

/**
 * UM CARTÃO. Com `abre`, ele vira botão e a lista aparece embaixo.
 *
 * "audite se os números são acionáveis, abrem relatórios de gestão" — não
 * abriam. O painel dizia "cobrado e não entregue: 11 jazigos" e não levava aos
 * onze. Para agir era preciso sair da tela e adivinhar quais eram; é assim que
 * um número vira enfeite, olhado todo mês e nunca usado.
 */
function Cartao({ titulo, valor, tom = "neutro", rodape, destaque, abre, aoAbrir, ativo }: {
  titulo: string; valor: string; tom?: string; rodape?: string; destaque?: boolean;
  abre?: string; aoAbrir?: (b: string) => void; ativo?: boolean;
}) {
  const t = TONS[tom] || TONS.neutro;
  const clicavel = !!abre && !!aoAbrir;
  return (
    <div
      onClick={clicavel ? () => aoAbrir!(abre!) : undefined}
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onKeyDown={clicavel ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoAbrir!(abre!); }
      } : undefined}
      style={{
      background: t.fundo, border: `1px solid ${ativo ? t.texto : t.borda}`, color: t.texto,
      borderRadius: 14, padding: 14,
      cursor: clicavel ? "pointer" : undefined,
      boxShadow: ativo ? `0 0 0 2px ${t.borda}` : undefined,
    }}>
      <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: destaque ? 30 : 24, fontWeight: 800, lineHeight: 1.15,
                    marginTop: 4 }}>
        {valor}
      </div>
      {rodape && (
        <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 5, lineHeight: 1.4 }}>
          {rodape}
        </div>
      )}
      {/* O CONVITE PRECISA ESTAR ESCRITO. Cartão clicável sem nada dizendo
          que clica é cartão que ninguém clica. */}
      {clicavel && (
        <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 700,
                      textDecoration: "underline" }}>
          {ativo ? "fechar a lista" : "ver a lista"}
        </div>
      )}
    </div>
  );
}

/**
 * O RELATÓRIO POR TRÁS DO NÚMERO.
 *
 * Carrega só quando abre, e do MESMO lugar que conta o cartão
 * (`sureya_painel_detalhe`, 0120). Uma consulta própria aqui faria a lista e o
 * cartão contarem o mesmo fato de dois jeitos — o defeito que já custou caro
 * cinco vezes neste sistema.
 *
 * Cada linha leva à ficha da família, porque é lá que se age.
 */
function Relatorio({ bloco, aberto, mes, titulo }: {
  bloco: string; aberto: string; mes: string; titulo: string;
}) {
  const [linhas, setLinhas] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");

  const visivel = aberto === bloco;

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    setErro(""); setLinhas(null);
    fetch(`/api/financeiro/painel/detalhe?bloco=${bloco}&mes=${mes}`)
      .then((x) => x.json())
      .then((r) => {
        if (!vivo) return;
        if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não deu para carregar"); return; }
        setLinhas(r.linhas || []);
      })
      .catch(() => vivo && setErro("não deu para carregar"));
    return () => { vivo = false; };
  }, [visivel, bloco, mes]);

  if (!visivel) return null;

  return (
    <div style={{ ...painel.card, background: "#f8fafc" }}>
      <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>{titulo}</p>

      {erro && <p style={{ margin: 0, fontSize: 14, color: cor.perigo }}>{erro}</p>}
      {!erro && linhas === null && (
        <p style={{ margin: 0, fontSize: 14, color: cor.cinza }}>Carregando…</p>
      )}
      {linhas?.length === 0 && (
        <p style={{ margin: 0, fontSize: 14, color: cor.cinza }}>Nenhuma linha.</p>
      )}

      {(linhas || []).map((l: any, i: number) => (
        <div key={l.id || i}
             style={{ display: "flex", flexWrap: "wrap", gap: 10,
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderTop: i ? "1px solid rgb(var(--zm-linha, 226 232 240))" : "none" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5 }}>
              {l.familia_id ? (
                <Link href={`/painel/clientes/${l.familia_id}`} style={{ color: cor.navy }}>
                  {l.familia || "sem família"}
                </Link>
              ) : (l.familia || "sem família")}
              {l.jazigo && <span style={{ color: cor.cinza }}> · {l.jazigo}</span>}
            </div>
            <div style={{ fontSize: 13, color: cor.cinza }}>
              {[
                l.data && new Date(String(l.data) + "T12:00:00").toLocaleDateString("pt-BR"),
                l.quando && new Date(l.quando).toLocaleDateString("pt-BR"),
                l.local,
                l.item && `${Number(l.quantidade)} · ${l.item}`,
                l.periodicidade,
                l.assunto,
                l.autor,
                l.telefone,
                // "nunca" é uma resposta, e das mais úteis desta lista.
                bloco === "nao_atendidos"
                  ? (l.ultima_lavagem
                      ? `última em ${new Date(l.ultima_lavagem + "T12:00:00").toLocaleDateString("pt-BR")}`
                      : "nunca teve limpeza")
                  : null,
                l.status,
                l.motivo && `segurada: ${l.motivo}`,
              ].filter(Boolean).join(" · ")}
            </div>
            {(l.texto || l.descricao) && (
              <div style={{ fontSize: 13, color: cor.cinza, marginTop: 2 }}>
                “{l.texto || l.descricao}”
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, textAlign: "right", fontSize: 14 }}>
            {l.valor != null && <b>{brl(l.valor)}</b>}
            {l.saldo != null && <b>{brl(l.saldo)}</b>}
            {l.receita != null && <b>{brl(l.receita)}</b>}
            {l.mensal != null && <span style={{ color: cor.cinza }}>{brl(l.mensal)}/mês</span>}
            {l.com_foto === false && (
              <div style={{ fontSize: 12.5, color: "#7c2d12" }}>sem foto</div>
            )}
            {l.pelo_campo === false && bloco === "lavagens" && (
              <div style={{ fontSize: 12.5, color: cor.cinza }}>anotada</div>
            )}
          </div>
        </div>
      ))}

      {(linhas?.length || 0) >= 100 && (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza }}>
          Mostrando as 100 primeiras.
        </p>
      )}
    </div>
  );
}
