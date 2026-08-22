"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { painel, cor, numeroBR, dinheiroBR } from "../ui";
import { diaOperacao } from "@/lib/vencimento";

const MESES: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0,
};

// Dinheiro digitado por gente vem de numeroBR (src/app/painel/ui.tsx): a mesma
// leitura da ficha do cliente, e a mesma recusa em adivinhar texto ambiguo.
// A versao local daqui aceitava "40.5,00" como 405 — o campo vinha preenchido
// com ponto ("40.5") e bastava alguem completar os centavos com virgula para o
// honorario decuplicar sem aviso. Agora o preenchimento e pt-BR ("40,50") e
// texto ambiguo devolve NaN, que o Salvar recusa.

/**
 * JAZIGOS E PLANOS — a antiga tela "Gestão", agora uma ABA da Carteira.
 *
 * Estavam separadas por acidente de construcao, nao por logica: familia, jazigo
 * e servico sao o mesmo assunto visto de tres alturas. Quem abria "Familias"
 * via quem paga, quem abria "Gestao" via o que se cobra, e ninguem via os dois
 * — trocando de tela e perdendo o filtro no caminho. O corpo desta visao e o
 * mesmo de antes, sem o cabecalho e sem o menu (quem desenha isso agora e a
 * pagina da Carteira). /painel/planos continua existindo e redireciona para ca.
 *
 * Cada linha e um jazigo: quando lavar, quando cobrar e por quanto. Edicao na
 * propria linha.
 */
/**
 * Balde de vencimento pela próxima cobrança.
 *
 * Plano INATIVO tem balde próprio: cobrança que não vai acontecer não é
 * "vencida". Com isso a soma dos cartões é sempre igual ao número de linhas
 * listadas — antes os cartões exigiam `ativo` e, na situação "Inativos", os
 * cinco marcavam 0 com a lista cheia de jazigos na tela.
 * Mesmos nomes de balde do Mapa (src/app/api/localizacao), de propósito.
 */
function bucket(proxCobranca: string | null, hoje: string, sem: string, mes: string, ativo = true): string {
  if (!ativo) return "inativo";
  if (!proxCobranca) return "sem";
  if (proxCobranca < hoje) return "vencido";
  if (proxCobranca <= sem) return "semana";
  if (proxCobranca <= mes) return "mes";
  return "emdia";
}

export default function VisaoJazigos() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ busca: "", quadra: "", cadencia: "", situacao: "ativos",
                               ordem: "quadra", teste: false });
  const [quadras, setQuadras] = useState<any[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [venc, setVenc] = useState<string>(""); // filtro de balde de vencimento

  // cada busca leva um número: digitar rápido no filtro dispara várias e elas
  // voltam fora de ordem (a de "Ma" chegando depois da de "Maria"), deixando na
  // tela o resultado de um filtro que já não é o da caixa. Só a MAIS RECENTE
  // pinta a tela; as atrasadas são descartadas.
  const seq = useRef(0);
  const carregar = useCallback(async () => {
    const meu = ++seq.current;
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "teste") { if (v) p.set("teste", "1"); } else if (v) p.set(k, String(v));
    });
    const r = await fetch(`/api/planos?${p}`).then((x) => x.json()).catch(() => null);
    if (meu !== seq.current) return;
    if (r?.ok) setD(r);
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, []);

  // ARREDONDAMENTO DO SERVIDOR, tambem no que e MULTIPLICADO na tela. toFixed
  // corta, Math.round (o da rota) sobe: mensal 57,205 x 1 mes virava R$ 57.20 na
  // tela e 57,21 no banco. Um centavo, na linha que a familia vai receber.
  const money = (n: number) => `R$ ${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  // datas de referência dos baldes: vêm do SERVIDOR (fuso da operação), não do
  // relógio do navegador. Em UTC o dia virava às 21h e a tela pintava de
  // vermelho quem só vence amanhã; calculando aqui, um computador com a data
  // errada fazia o mesmo — e nos dois casos a tela discordava do Mapa, que lê a
  // situação já calculada no servidor. diaOperacao() só como reserva enquanto a
  // primeira resposta não chega.
  const hoje = d?.hoje || diaOperacao();
  const sem = d?.sem7 || diaOperacao(7), mes = d?.mes30 || diaOperacao(30);

  const todos: any[] = d?.planos || [];
  const contagem = { vencido: 0, semana: 0, mes: 0, emdia: 0, sem: 0, inativo: 0 };
  for (const p of todos) (contagem as any)[bucket(p.proximaCobranca, hoje, sem, mes, p.ativo)]++;

  const baldes: { chave: string; rotulo: string; n: number; cor: string }[] = [
    { chave: "vencido", rotulo: "Vencidos", n: contagem.vencido, cor: "rgb(var(--zm-perigo))" },
    { chave: "semana", rotulo: "Vencem em 7 dias", n: contagem.semana, cor: "rgb(var(--zm-aviso))" },
    { chave: "mes", rotulo: "Vencem no mês", n: contagem.mes, cor: "#0f766e" },
    { chave: "emdia", rotulo: "Em dia", n: contagem.emdia, cor: "rgb(var(--zm-positivo))" },
    { chave: "sem", rotulo: "Sem data", n: contagem.sem, cor: "rgb(var(--zm-ink-soft))" },
  ];
  // o cartão de inativos só aparece quando a situação escolhida traz inativos —
  // na visão "Ativos" ele seria sempre 0 e só ocuparia espaço.
  if (contagem.inativo > 0)
    baldes.push({ chave: "inativo", rotulo: "Inativos", n: contagem.inativo, cor: "#64748b" });

  // contagem e filtro usam a MESMA regra e a MESMA lista já filtrada pelo
  // servidor: cartão que mostra um número tem de mostrar essas linhas ao clicar.
  // se o cartão escolhido deixou de existir (ex.: filtrava "Inativos" e a
  // situação voltou para "Ativos"), o filtro cai sozinho — senão a lista ficava
  // vazia sem nenhum cartão aceso explicando por quê.
  const vencOk = !venc || !d || baldes.some((b) => b.chave === venc) ? venc : "";
  // e cai DE VERDADE: mascarar só na leitura deixava "inativo" guardado no
  // estado, então ao voltar para a situação "Inativos" o filtro ressuscitava
  // sozinho e a lista encolhia sem ninguém ter clicado em nada.
  useEffect(() => { if (venc && vencOk !== venc) setVenc(vencOk); }, [venc, vencOk]);

  const visiveis = vencOk
    ? todos.filter((p) => bucket(p.proximaCobranca, hoje, sem, mes, p.ativo) === vencOk)
    : todos;

  // agrupa por quadra quando a ordem é a da rota (visão por localização)
  const porQuadra = new Map<string, any[]>();
  if (f.ordem === "quadra") {
    for (const p of visiveis) {
      const k = p.quadra || "sem quadra";
      porQuadra.set(k, [...(porQuadra.get(k) || []), p]);
    }
  }

  // o resumo conta o que ESTÁ NA TELA. Vinha pronto do servidor (d.totais),
  // que não conhece o filtro de balde: com "Vencidos" aceso e 3 linhas na
  // lista, o resumo dizia "412 jazigos · R$ 16.480 por mês" — o número grande
  // contradizendo o cartão aceso logo acima.
  const tot = {
    quantidade: visiveis.length,
    mensal: Math.round(visiveis.filter((p) => p.ativo)
      .reduce((s, p) => s + (Number(p.mensalEfetivo) || 0), 0) * 100) / 100,
    faltaData: visiveis.filter((p) => p.faltaData && p.ativo).length,
    naoConferidos: visiveis.filter((p) => !p.conferido).length,
  };

  return (
    <div>
      <div>
        <p style={{ color: cor.cinza, fontSize: 14, marginTop: 0, marginBottom: 14 }}>
          Cada linha é um jazigo: <b>por quanto</b>, <b>com que frequência</b>, <b>quando lavar</b> e
          <b> quando cobrar</b>. Use os cartões de vencimento para ver o que está no prazo, e a ordem
          “rota” para ver por quadra. Edite direto na linha.
        </p>

        {/* baldes de vencimento (pela próxima cobrança) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {baldes.map((b) => {
            const ativo = vencOk === b.chave;
            return (
              <button key={b.chave} onClick={() => setVenc(ativo ? "" : b.chave)}
                style={{
                  flex: "1 1 130px", minWidth: 120, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${ativo ? b.cor : cor.linha}`,
                  background: ativo ? b.cor : "#fff", color: ativo ? "#fff" : cor.navy,
                  borderRadius: 12, padding: "10px 12px",
                }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: ativo ? "#fff" : b.cor }}>{b.n}</div>
                <div style={{ fontSize: 13, opacity: ativo ? 0.95 : 0.8 }}>{b.rotulo}</div>
              </button>
            );
          })}
        </div>
        {vencOk && (
          <p style={{ fontSize: 13, color: cor.cinza, marginTop: -4, marginBottom: 10 }}>
            Mostrando só <b>{baldes.find((b) => b.chave === vencOk)?.rotulo}</b> ·{" "}
            <button onClick={() => setVenc("")} style={{ background: "none", border: "none", color: cor.teal, cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>limpar</button>
          </p>
        )}

        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...painel.input, flex: 1, minWidth: 170 }} value={f.busca}
                   onChange={(e) => setF({ ...f, busca: e.target.value })}
                   placeholder="Buscar família ou jazigo…" />
            <select style={{ ...painel.input, width: "auto" }} value={f.situacao}
                    onChange={(e) => setF({ ...f, situacao: e.target.value })}>
              <option value="ativos">Ativos</option>
              <option value="falta_data">Falta data de lavagem ou cobrança</option>
              <option value="nao_conferido">Ainda não conferidos</option>
              <option value="atrasados">Com pagamento vencido</option>
              <option value="inativos">Inativos</option>
              <option value="">Todos</option>
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.quadra}
                    onChange={(e) => setF({ ...f, quadra: e.target.value })}>
              <option value="">Todas as quadras</option>
              {quadras.map((q) => <option key={q.id} value={q.codigo}>{q.codigo}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.cadencia}
                    onChange={(e) => setF({ ...f, cadencia: e.target.value })}>
              <option value="">Toda periodicidade</option>
              {Object.keys(MESES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.ordem}
                    onChange={(e) => setF({ ...f, ordem: e.target.value })}>
              <option value="quadra">Ordem da rota</option>
              <option value="lavagem">Próxima lavagem</option>
              <option value="cobranca">Próxima cobrança</option>
              <option value="valor">Maior valor</option>
            </select>
            {/* o filtro de teste existia no estado e no /api/planos, mas não
                tinha controle nenhum na tela: as famílias "[TESTE]" ficavam
                invisíveis sem jeito de conferir se a migração as criou. */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: cor.cinza }}>
              <input type="checkbox" checked={f.teste}
                     onChange={(e) => setF({ ...f, teste: e.target.checked })} />
              mostrar [TESTE]
            </label>
          </div>
        </div>

        {d && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 14, color: cor.cinza }}>
            <span><b style={{ color: cor.navy }}>{tot.quantidade}</b> jazigos</span>
            <span><b style={{ color: cor.navy }}>{money(tot.mensal)}</b> por mês</span>
            {tot.faltaData > 0 && (
              <span style={{ color: "rgb(var(--zm-aviso))" }}>
                <b>{tot.faltaData}</b> sem data de lavagem ou cobrança
              </span>
            )}
            {tot.naoConferidos > 0 && (
              <span><b>{tot.naoConferidos}</b> ainda não conferidos</span>
            )}
          </div>
        )}

        {!d && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {d && visiveis.length === 0 && (
          <div style={painel.card}><p style={{ margin: 0, color: cor.cinza }}>Nenhum jazigo com esses filtros.</p></div>
        )}

        {(() => {
          const linha = (p: any) => (
            <Linha key={p.id} p={p} aberto={editando === p.id}
                   onAbrir={() => setEditando(editando === p.id ? null : p.id)}
                   onSalvo={() => { setEditando(null); carregar(); }} />
          );
          // agrupado por quadra na ordem "rota"; senão, lista corrida
          if (f.ordem === "quadra" && porQuadra.size > 0) {
            return [...porQuadra.entries()].map(([q, itens]) => {
              const somaMes = itens.filter((p) => p.ativo).reduce((s, p) => s + (Number(p.mensalEfetivo) || 0), 0);
              return (
                <div key={q} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                                margin: "6px 2px", color: cor.cinza }}>
                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      📍 {q} · {itens.length}
                    </span>
                    <span style={{ fontSize: 13 }}>{money(somaMes)}/mês</span>
                  </div>
                  {itens.map(linha)}
                </div>
              );
            });
          }
          return visiveis.map(linha);
        })()}
      </div>
    </div>
  );
}

function Linha({ p, aberto, onAbrir, onSalvo }:
  { p: any; aberto: boolean; onAbrir: () => void; onSalvo: () => void }) {
  const doServidor = () => ({
    cadencia: p.cadencia,
    valor_mensal: p.valorMensal == null ? "" : dinheiroBR(p.valorMensal),
    ativo: p.ativo,
    pago_ate: p.pagoAte || "", proximo_servico: p.proximaLavagem || "",
    proxima_cobranca: p.proximaCobranca || "",
  });
  const [e, setE] = useState(doServidor);
  const [salvando, setSalvando] = useState(false);

  // QUAIS campos a pessoa realmente mexeu. Sem isto o Salvar mandava o formulário
  // inteiro: os campos que ninguém tocou iam junto com o valor que estava na tela
  // quando a linha abriu e sobrescreviam o que o banco já tinha de mais novo —
  // a rotina noturna reescreve proximo_servico (src/lib/agenda.ts), então corrigir
  // só o valor mensal às 9h desfazia a agenda gerada de madrugada.
  const tocado = useRef<Record<string, true>>({});
  function mudar(campo: string, valor: any) {
    tocado.current[campo] = true;
    setE((v) => ({ ...v, [campo]: valor }));
  }

  // ao ABRIR, recarrega os campos do que veio do servidor. O estado do formulário
  // nascia só no primeiro render: salvar outra linha recarregava a lista, esta
  // linha recebia dados novos e o formulário continuava com os antigos — quem
  // clicasse Salvar aqui escrevia de volta a data velha por cima da nova.
  // Enquanto está aberto nada é sobrescrito: digitação em andamento é sagrada.
  useEffect(() => {
    if (!aberto) return;
    tocado.current = {};
    setE(doServidor());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // ARREDONDAMENTO DO SERVIDOR, tambem no que e MULTIPLICADO na tela. toFixed
  // corta, Math.round (o da rota) sobe: mensal 57,205 x 1 mes virava R$ 57.20 na
  // tela e 57,21 no banco. Um centavo, na linha que a familia vai receber.
  const money = (n: number) => `R$ ${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  // o campo guarda TEXTO, não número: convertendo a cada tecla, apagar o campo
  // virava 0 (e um Salvar zerava o plano) e o ponto do decimal era comido antes
  // de dar tempo de digitar o centavo ("40." → 40 → impossível chegar a 40,50).
  const mensalNumBruto = numeroBR(e.valor_mensal);
  const mensalNum = isFinite(mensalNumBruto) ? mensalNumBruto : 0;
  // PLANO ANTIGO (sem valor_mensal no banco): o numero exibido sai de
  // valor_vigente. Depois da migration 0038 as duas colunas guardam o mesmo
  // valor — o preco de UMA limpeza — e este caso deixa de existir; enquanto ela
  // nao rodar, mexer no campo de dinheiro continua contando como declaracao do
  // preco (e por isso `p.legado` forca o envio no salvar, mais abaixo).
  const dinheiroIntacto = numeroBR(e.valor_mensal) === numeroBR(doServidor().valor_mensal)
    || e.valor_mensal === doServidor().valor_mensal;
  // DECISAO 08/08: o campo e o preco de UMA limpeza. A caixa ao lado mostra o
  // que isso DA POR MES (preco x limpezas do ciclo / meses do ciclo) — antes
  // ela dizia "cobranca do ciclo" e era o numero que o servidor gravava, o que
  // fazia um plano anual nascer com cada lavagem valendo o ano inteiro.
  const lavagens = Math.max(1, Number((p as any).lavagens) || 1);
  const mesesCad = MESES[e.cadencia] || 0;
  const porMes = mesesCad > 0
    ? Math.round((mensalNum * lavagens / mesesCad) * 100) / 100
    : 0;

  async function salvar() {
    // TOCADO **E** DIFERENTE. Só "tocado" mandava de volta o mesmo valor quando
    // a pessoa digitava e desfazia ("45,0" → "45,00"): num plano antigo isso faz
    // o servidor gravar valor_vigente = mensal × meses e cada lavagem passa a
    // debitar o ciclo. Mesmo filtro da ficha do cliente.
    const base = doServidor() as any;
    const igual = (c: string) => c === "valor_mensal"
      // PLANO ANTIGO: o campo vem pre-preenchido com um valor DERIVADO (a coluna
      // valor_mensal esta NULL, o numero exibido sai de valor_vigente), entao
      // comparar contra ele fazia a confirmacao do valor — o proprio ato de
      // migrar a carteira — ser filtrada como "igual". A coluna ficava NULL para
      // sempre e a linha exibia "conferido". Aqui, em plano antigo, mexer no
      // campo de dinheiro conta como declaracao do mensal.
      ? (p.legado
          ? false
          : numeroBR((e as any)[c]) === numeroBR(base[c])
            || (String((e as any)[c]).trim() === "" && String(base[c]).trim() === ""))
      : (e as any)[c] === base[c];
    const corpo: Record<string, any> = {};
    for (const c of Object.keys(tocado.current)) if (!igual(c)) corpo[c] = (e as any)[c];

    if ("valor_mensal" in corpo) {
      const n = numeroBR(corpo.valor_mensal);
      if (String(corpo.valor_mensal).trim() === "" || !Number.isFinite(n) || n < 0) {
        alert("Informe o valor de uma limpeza (ou feche sem salvar).");
        return;
      }
      corpo.valor_mensal = n;
    }
    // marcar como conferido é o efeito colateral do Salvar; a API guarda a data
    // da PRIMEIRA vez e ignora as demais.
    if (!p.conferido) corpo.migrado = true;
    if (!Object.keys(corpo).length) { onSalvo(); return; }

    setSalvando(true);
    const r = await fetch(`/api/planos/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) onSalvo(); else alert("Falhou: " + (r?.erro || "erro"));
  }

  return (
    <div style={{ ...painel.card,
      borderLeft: !p.ativo ? "4px solid #94a3b8"
        : p.faltaData ? "4px solid #d97706"
        : p.atrasado ? "4px solid #dc2626" : `1px solid ${cor.linha}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Link href={`/painel/clientes/${p.clienteId}`} style={{ textDecoration: "none" }}>
            <strong style={{ color: cor.navy }}>{p.cliente}</strong>
          </Link>
          <span style={{ color: cor.cinza }}> · {p.jazigo}</span>
          <div style={{ fontSize: 13, color: cor.cinza, marginTop: 3 }}>
            {p.quadra}{p.rua ? ` · ${p.rua}` : ""} · {p.cadencia} ·{" "}
            <b style={{ color: cor.navy }}>{money(p.valorMensal)}</b> por limpeza
            {p.mensalEfetivo > 0 && ` (${money(p.mensalEfetivo)}/mês)`}
            {p.antecipada && " · antecipada"}
            {!p.ativo && " · INATIVO"}
            {p.conferido && " · ✓"}
          </div>
          <div style={{ fontSize: 13, marginTop: 3,
                        color: p.faltaData ? "rgb(var(--zm-aviso))" : cor.cinza }}>
            Pago até {dt(p.pagoAte)} · Lava em <b>{dt(p.proximaLavagem)}</b> · Cobra em <b>{dt(p.proximaCobranca)}</b>
            {p.faltaData && " ← falta preencher"}
          </div>
        </div>
        <button style={{ ...painel.botaoMiniSec, alignSelf: "flex-start" }} onClick={onAbrir}>
          {aberto ? "Fechar" : "Editar"}
        </button>
      </div>

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={painel.rotulo}>Periodicidade</label>
              <select style={{ ...painel.input, width: 130 }} value={e.cadencia}
                      onChange={(x) => mudar("cadencia", x.target.value)}>
                {Object.keys(MESES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={painel.rotulo}>Valor por limpeza</label>
              <input type="text" inputMode="decimal" placeholder="0,00"
                     style={{ ...painel.input, width: 110 }} value={e.valor_mensal}
                     onChange={(x) => mudar("valor_mensal", x.target.value.replace(/[^\d.,]/g, ""))} />
            </div>
            <div>
              <label style={painel.rotulo}>Dá por mês</label>
              <div style={{ ...painel.input, width: 120, background: "rgb(var(--zm-fundo))", fontWeight: 700 }}>
                {isFinite(mensalNumBruto) ? money(porMes) : "—"}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12 }}>
              <input type="checkbox" checked={e.ativo}
                     onChange={(x) => mudar("ativo", x.target.checked)} /> Ativo
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label style={painel.rotulo}>Pago até</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.pago_ate}
                     onChange={(x) => mudar("pago_ate", x.target.value)} />
            </div>
            <div>
              <label style={painel.rotulo}>Próxima lavagem</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.proximo_servico}
                     onChange={(x) => mudar("proximo_servico", x.target.value)} />
            </div>
            <div>
              <label style={painel.rotulo}>Próxima cobrança</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.proxima_cobranca}
                     onChange={(x) => mudar("proxima_cobranca", x.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button style={painel.botao} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <Link href={`/painel/clientes/${p.clienteId}`}
                  style={{ ...painel.botaoSec, textDecoration: "none" }}>
              Abrir ficha completa
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
