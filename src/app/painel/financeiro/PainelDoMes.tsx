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
        <Cartao titulo="Receita da competência" valor={brl(rec.total)} tom="neutro"
                rodape={`${rec.cobrancas} cobrança(s) de contrato · avulsos ${brl(rec.avulsos)}`} />
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
      <div style={grade}>
        <Cartao titulo="Limpezas executadas" valor={String(lav.executadas)} tom="neutro"
                rodape={`${lav.em_aberto} ainda em aberto no mês`} />
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
        memória de quem digitou. Elas separadas é o que permite confiar na primeira.
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
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>
            <Link href="/painel/agenda" style={{ color: cor.navy }}>Ver a agenda →</Link>
          </p>
        </div>
      ) : Number(rec.cobrancas) > 0 && (
        <div style={{ ...painel.card, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
          <strong style={{ color: "#065f46" }}>Tudo que foi cobrado teve limpeza no mês.</strong>
        </div>
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

      <div style={grade}>
        <Cartao titulo={Number(cus.lancamentos) === 0 ? "Receita (sem custos lançados)" : "Resultado do mês"}
                valor={brl(res.margem)}
                tom={Number(cus.lancamentos) === 0 ? "neutro" : (Number(res.margem) >= 0 ? "bom" : "ruim")}
                destaque
                rodape={Number(cus.lancamentos) === 0
                  ? "não é margem: nenhuma despesa foi lançada"
                  : `${brl(res.receita)} de receita − ${brl(res.custos)} de custos`} />
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

function Cartao({ titulo, valor, tom = "neutro", rodape, destaque }: {
  titulo: string; valor: string; tom?: string; rodape?: string; destaque?: boolean;
}) {
  const t = TONS[tom] || TONS.neutro;
  return (
    <div style={{
      background: t.fundo, border: `1px solid ${t.borda}`, color: t.texto,
      borderRadius: 14, padding: 14,
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
    </div>
  );
}
