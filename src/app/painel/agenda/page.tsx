"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import { Falhou } from "../pecas";
import { mesOperacao, diaOperacao, somaDias } from "@/lib/vencimento";

/**
 * AGENDA — a mesa de onde a semana é montada.
 *
 * O QUE ESTA TELA PRECISA RESPONDER, e não respondia
 * ---------------------------------------------------------------------------
 * Auditada em 23/08/2026 contra a produção. Os defeitos não eram de gosto:
 *
 *  · "QQuadra 1" — a tela escrevia `Q{quadra}` e o código da quadra já vinha
 *    "Quadra 1". O prefixo saiu daqui; o nome da quadra é o que o banco diz.
 *  · A linha mostrava jazigo, contato e valor. Faltavam FAMÍLIA e RUA — que
 *    são a entidade (0091) e a ordem da caminhada (0047). Sem as duas, a
 *    sequência do dia parece arbitrária.
 *  · O mesmo jazigo aparecia quatro vezes no dia 24 e nada na tela dizia isso.
 *  · O aviso "N lavagens em dia que não se trabalha" não zerava nunca, porque
 *    contador e movedor usavam regras diferentes (ver 0092). E a causa quase
 *    nunca era a jornada: era atraso e repetição, que o aviso nem nomeava.
 *  · Gerar só ia de 30 em 30 dias — não dava para experimentar sem despejar um
 *    trimestre inteiro na agenda e depois limpar na mão.
 *
 * O QUE ELA MOSTRA AGORA, em ordem de urgência: o que está errado, o tamanho
 * do período, como gerar, e só então os dias.
 */

interface Item {
  id: string;
  status: string;
  tumuloId: string | null;
  jazigo: string;
  quadra: string | null;
  rua: string | null;
  familia: string | null;
  falecido: string | null;
  contato: string | null;
  valor: number | null;
  /**
   * DE ONDE VEIO ESTA LAVAGEM (0128): "contrato", "pedido" ou "nao_definido".
   * Na agenda convivem as duas coisas, e a decisão não é a mesma nas duas:
   * adiar uma de contrato encurta o intervalo até a próxima; adiar um pedido é
   * furar uma data combinada com a família.
   */
  origem?: string | null;
  /** a data que a família pediu — só existe em `pedido` */
  dataPedida?: string | null;
  dataPlano: string | null;
  /** dias entre a data teórica do plano e o dia em que a lavagem caiu */
  atrasoDias: number;
  /** data escolhida à mão: a geração automática não mexe nesta lavagem (0041) */
  fixado?: boolean;
  /** Quem vai limpar. Nulo é o NORMAL: o alocador não nomeia ninguém. */
  executoraId?: string | null;
  estornadoEm?: string | null;
  motivoEstorno?: string | null;
  /**
   * A ÚLTIMA LAVAGEM DESTE JAZIGO (0093) — a executada mais recente, já sem as
   * estornadas. É o que decide se a lavagem marcada ainda faz sentido.
   */
  ultimaLavagem: {
    dia: string;
    executora: string | null;
    /** passou pelo botão "Começar" do aplicativo de campo */
    noCampo: boolean;
    /** dias entre a última lavagem e o dia em que esta está marcada */
    diasAte: number;
  } | null;
  /**
   * A PRÓXIMA DESTE JAZIGO, depois desta (0125). Nula quando esta é a última
   * que existe — e isso também é informação: pular a última é ficar sem.
   */
  proximaLavagem: { dia: string; emDias: number } | null;
}

interface Saude {
  foraDaJornada: number;
  diaNaoUtil: number;
  atrasadas: number;
  repetidas: number;
  primeiraData: string | null;
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBonita = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit",
  });

/**
 * MOVER UMA LAVAGEM DENTRO DO DIA.
 *
 * A roteirização automática é por sequência de quadra e rua, com serpentina —
 * ruas alternadas percorridas ao contrário, para uma emendar na outra. Isso
 * continua sendo o padrão, e é bom.
 *
 * Isto é o ajuste por cima: a véspera em que se sabe que a família vai visitar
 * de manhã, ou que aquele canto está em obra.
 *
 * Manda a lista INTEIRA do dia, na ordem nova. A função no banco confere que
 * todos os ids são daquele dia antes de renumerar — mandar só o que mudou
 * dependeria de a tela e o banco concordarem sobre o resto, e eles nem sempre
 * concordam.
 */
async function reordenarDia(data: string, ids: string[]) {
  const r = await fetch("/api/agenda/ordem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, ids }),
  }).then((x) => x.json()).catch(() => null);
  return r?.ok === true ? null : (r?.erro || "não consegui mudar a ordem");
}

export default function AgendaPage() {
  const [dias, setDias] = useState<Record<string, Item[]>>({});
  const [capacidadeDia, setCapacidadeDia] = useState(20);
  const [carregando, setCarregando] = useState(true);
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [replanejar, setReplanejar] = useState(true);

  const [periodo, setPeriodo] = useState({ dias: 14, inicio: "", fim: "" });
  const [gerando, setGerando] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  /** O dia que está sendo empurrado inteiro, para desligar os botões dele. */
  const [movendoDia, setMovendoDia] = useState<string | null>(null);

  // ---- filtros ------------------------------------------------------------
  // Numa agenda de trinta linhas ninguém procura com o olho. Os três recortes
  // aqui são os que se pede em voz alta: "cadê a lavagem dos Perrela",
  // "o que está atrasado" e "o que ainda está sem ninguém".
  const [busca, setBusca] = useState("");
  const [recorte, setRecorte] =
    useState<"tudo" | "atrasadas" | "aberto" | "pessoa" | "pedidos">("tudo");

  /**
   * QUEM LIMPA — marcado em lote, e sempre opcional.
   *
   * O alocador não nomeia mais ninguém: "limpeza é limpeza", e a equipe não é
   * fixa. Mas há dias em que ela já sabe quem vai, e marcar um por um numa rota
   * de vinte é trabalho que ninguém faz — então fica em lote.
   *
   * Serviço já executado não entra na seleção: ali `executora_id` deixou de ser
   * plano e virou o registro de quem lavou, que é de onde sai a remuneração.
   */
  const [equipe, setEquipe] = useState<{ id: string; nome: string; papel: string }[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [quem, setQuem] = useState<string>("");
  const [atribuindo, setAtribuindo] = useState(false);

  const [mesAlvo, setMesAlvo] = useState(mesOperacao());
  const [saude, setSaude] = useState<Saude | null>(null);
  /** Quanto o roteiro envelheceu desde a última distribuição completa (0125). */
  const [idade, setIdade] = useState<{
    refeitoEm: string | null; novasDesdeEntao: number; redistribuiveis: number; aPartirDe: string;
  } | null>(null);
  const [refazendo, setRefazendo] = useState(false);

  const nomeDe = (id: string | null) =>
    (id && equipe.find((m) => m.id === id)?.nome) || null;

  /**
   * AGENDA VAZIA E AGENDA QUE NAO CARREGOU SAO A MESMA TELA — eram.
   *
   * `setDias(r?.dias || {})` com `catch(() => null)`: se a rota caisse, a
   * agenda ficava vazia e a tela dizia que nao havia nada marcado. Numa tela de
   * planejamento do dia da Nina, isso e pior do que um erro na cara.
   */
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (periodo.inicio) qs.set("inicio", periodo.inicio);
    if (periodo.fim) qs.set("fim", periodo.fim);
    qs.set("dias", String(periodo.dias));
    try {
      const x = await fetch(`/api/agenda/semana?${qs}`);
      if (!x.ok) throw new Error(`HTTP ${x.status}`);
      const r = await x.json();
      if (r?.ok === false) throw new Error(r?.erro || "resposta_negativa");
      setDias(r?.dias || {});
      setEquipe(r?.equipe || []);
      if (r?.capacidadeDia) setCapacidadeDia(r.capacidadeDia);
      setErro("");
    } catch (e) {
      console.error("[agenda] carregar:", e);
      setErro("Não consegui carregar a agenda. Isto não quer dizer que o dia está livre.");
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  // o que está fora do lugar — a regra é a do banco (0092), não daqui
  const verSaude = useCallback(() => {
    fetch("/api/agenda/reorganizar")
      .then((x) => x.json())
      .then((r) => r?.ok && setSaude(r))
      .catch(() => null);
    fetch("/api/agenda/refazer")
      .then((x) => x.json())
      .then((r) => r?.ok && setIdade(r))
      .catch(() => null);
  }, []);
  useEffect(() => { verSaude(); }, [dias, verSaude]);

  // ---- o que aparece depois dos filtros ------------------------------------
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const passa = (s: Item) => {
      if (recorte === "atrasadas" && s.atrasoDias <= 0) return false;
      if (recorte === "aberto" && s.executoraId) return false;
      if (recorte === "pessoa" && !s.executoraId) return false;
      // AVULSO NA AGENDA É `pedido` (0128), como em todo o resto do sistema.
      // Antes o recorte não existia porque não havia como fazê-lo: toda
      // lavagem de contrato respondia "sim" à pergunta "é avulso?".
      if (recorte === "pedidos" && s.origem !== "pedido") return false;
      if (!t) return true;
      return [s.familia, s.jazigo, s.rua, s.quadra, s.falecido, s.contato]
        .some((x) => (x || "").toLowerCase().includes(t));
    };
    const out: Record<string, Item[]> = {};
    for (const [d, lista] of Object.entries(dias)) {
      const f = lista.filter(passa);
      if (f.length) out[d] = f;
    }
    return out;
  }, [dias, busca, recorte]);

  const filtrando = busca.trim() !== "" || recorte !== "tudo";

  // ---- o resumo do período ------------------------------------------------
  // O número que ela procura ao abrir a tela não é "quantas linhas": é quanto
  // trabalho e quanto dinheiro tem a semana, e quanto disso ainda não tem dono.
  const resumo = useMemo(() => {
    const todos = Object.values(visiveis).flat();
    const ativos = todos.filter((s) => s.status !== "executado" && !s.estornadoEm);
    return {
      total: todos.length,
      dias: Object.keys(visiveis).length,
      valor: todos.reduce((a, s) => a + (Number(s.valor) || 0), 0),
      emAberto: ativos.filter((s) => !s.executoraId).length,
      comPessoa: ativos.filter((s) => !!s.executoraId).length,
      atrasadas: todos.filter((s) => s.atrasoDias > 0).length,
      executadas: todos.filter((s) => s.status === "executado").length,
    };
  }, [visiveis]);

  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function definirQuemLimpa() {
    if (!marcados.size) return;
    const emAberto = quem === "";
    const nome = emAberto ? "em aberto (qualquer pessoa da equipe)" : nomeDe(quem) || "essa pessoa";
    if (!confirm(
      `Marcar ${marcados.size} ${marcados.size === 1 ? "limpeza" : "limpezas"} como ${nome}?`
      + (emAberto ? "\n\nElas voltam a aparecer para toda a equipe." : "")
    )) return;

    setAtribuindo(true);
    try {
      const r = await fetch("/api/agenda/executora", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...marcados], executoraId: emAberto ? null : quem }),
      }).then((x) => x.json()).catch(() => null);

      if (!r?.ok) { alert(r?.mensagem || r?.erro || "Não consegui salvar."); return; }
      // Dizer quantos ficaram de fora evita o silêncio de marcar vinte e mudar
      // dezoito sem ninguém saber quais dois.
      if (r.ignorados > 0) {
        alert(`${r.mexidos} alteradas. ${r.ignorados} ficaram como estavam — já foram executadas.`);
      }
      setMarcados(new Set());
      await carregar();
    } finally { setAtribuindo(false); }
  }

  /** Sobe ou desce uma lavagem uma posição dentro do dia. */
  async function mover(dia: string, id: string, direcao: -1 | 1) {
    // A ordem verdadeira é a do dia INTEIRO, não a da lista filtrada: mandar a
    // lista curta apagaria do roteiro tudo que o filtro escondeu.
    const lista = (dias[dia] || []).map((x) => x.id);
    const i = lista.indexOf(id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];

    setMovendo(id);
    const erro = await reordenarDia(dia, lista);
    setMovendo(null);
    if (erro) { alert(erro); return; }
    // Recarrega em vez de reordenar na tela: a ordem verdadeira é a do banco.
    await carregar();
  }

  async function reorganizar() {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/reorganizar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diasAFrente: 120 }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (!r?.ok) { alert(r?.erro || "Não consegui reorganizar."); return; }

    // Contar POR CAUSA: "5 movidas" não diz se o problema era atraso, repetição
    // ou jornada — e são três conversas diferentes com quem vai ao campo.
    const causas = [
      r.porAtraso > 0 && `${r.porAtraso} atrasada(s)`,
      r.porRepeticao > 0 && `${r.porRepeticao} repetida(s) no mesmo jazigo`,
      r.porDiaRuim > 0 && `${r.porDiaRuim} em dia que não se trabalha`,
    ].filter(Boolean).join(", ");

    alert(
      r.movidos === 0
        ? "Nada fora do lugar — a agenda já está como deveria."
        : `${r.movidos} lavagem(ns) devolvida(s) para a fila (${causas}).\n` +
          `${r.agendados} redistribuída(s) em ${r.dias} dia(s).`
    );
    await carregar();
    verSaude();
  }

  async function gerarDias(n: number) {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/gerar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horizonteDias: n }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (!r?.ok) { alert("Falhou ao gerar."); return; }
    setDiag({ ...r.geracao, ...r.alocacao, horizonte: n });
    // Gerou três dias e a tela está mostrando trinta: o resultado aparece
    // diluído e parece que nada aconteceu. A janela acompanha o que foi gerado.
    if (n <= 14) setPeriodo({ dias: n, inicio: "", fim: "" });
    else carregar();
  }

  async function gerarMes() {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/mes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: mesAlvo }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) { setDiag(r); carregar(); }
    else alert("Falhou ao gerar o mês.");
  }

  /**
   * ESTORNAR UMA LAVAGEM JÁ EXECUTADA.
   *
   * A rota `/api/servico/[id]/estornar` existia e NENHUMA tela a chamava: a
   * função estava escrita aqui, completa, e nunca foi ligada a um botão. Uma
   * lavagem registrada por engano só se desfazia no banco.
   *
   * Fica no "mais" da linha executada, atrás de confirmação e pedindo o
   * motivo: o motivo vai para o extrato da família, que é onde alguém vai
   * procurar quando estranhar a cobrança.
   */
  async function estornar(id: string, jazigo: string) {
    const motivo = prompt(
      `Estornar a lavagem de ${jazigo}?\n\n` +
      `A lavagem é anulada e o valor cobrado volta como crédito para a família.\n` +
      `O registro continua visível com o motivo — o extrato dela mostra que houve\n` +
      `um erro e que foi corrigido.\n\nO que aconteceu?`,
      ""
    );
    if (motivo === null) return;
    if (!motivo.trim()) return alert("Preciso do motivo — ele fica no extrato da família.");

    const r = await fetch(`/api/servico/${id}/estornar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    }).then((x) => x.json()).catch(() => null);

    if (r?.ok) {
      alert(r.valorEstornado > 0
        ? `Estornada. ${dinheiro(Number(r.valorEstornado))} devolvidos para a família.`
        : "Estornada. Não havia cobrança lançada.");
      carregar();
    } else alert(r?.erro || "Não consegui estornar.");
  }

  async function excluir(id: string) {
    const r = await fetch(`/api/servico/${id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) carregar();
    else alert(r?.erro || "Não consegui excluir.");
  }

  /**
   * PUXAR O DIA INTEIRO — para frente ou para trás.
   *
   * Choveu na terça, e as quinze limpezas passam para quarta. Fazer isso
   * quinze vezes, com a data digitada em cada linha, é o trabalho que este
   * botão existe para tirar.
   *
   * Cada limpeza anda pela MESMA porta do Remarcar de uma linha só, e ganha o
   * mesmo "fixado": sem isso o alocador devolveria tudo para o dia de origem
   * na próxima geração, de madrugada, desfazendo o trabalho dela em silêncio.
   */
  async function moverDia(d: string, passo: number) {
    const naoFeitas = (dias[d] || []).filter((x: Item) => x.status !== "executado");
    if (!naoFeitas.length) { alert("Não há limpeza para mover neste dia."); return; }

    const destino = somaDias(d, passo);
    if (!confirm(
      `Mover ${naoFeitas.length} ${naoFeitas.length === 1 ? "limpeza" : "limpezas"} ` +
      `de ${dataBonita(d)} para ${dataBonita(destino)}?\n\n` +
      `O que já foi feito fica onde está.\n` +
      `As próximas de cada jazigo NÃO andam junto — só este dia.`
    )) return;

    setMovendoDia(d);
    try {
      const r = await fetch("/api/agenda/dia/mover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de: d, dias: passo }),
      }).then((x) => x.json()).catch(() => null);

      if (!r?.ok) { alert(r?.mensagem || r?.erro || "Não consegui mover o dia."); return; }

      // O AVISO SAI DEPOIS, E NÃO TRAVA ANTES. Destino sem dia de trabalho ou
      // acima da capacidade não é motivo para recusar — ela sabe o que está
      // fazendo. É motivo para DIZER: uma agenda que estoura em silêncio vira
      // uma sexta com trinta paradas que ninguém percebeu.
      const avisos = [
        !r.diaDeTrabalho ? `${dataBonita(r.para)} não é dia de trabalho no cadastro.` : null,
        r.estourou ? `O dia ficou com ${r.noDestino} paradas, acima das ${r.capacidade} do padrão.` : null,
        r.falhas?.length ? `${r.falhas.length} não conseguiram mover.` : null,
      ].filter(Boolean);
      if (avisos.length) {
        alert(`${r.movidos} movida(s) para ${dataBonita(r.para)}.\n\n` + avisos.join("\n"));
      }
      carregar();
    } finally { setMovendoDia(null); }
  }

  /**
   * REFAZER O ROTEIRO — o recálculo que faltava.
   *
   * O alocador só enxerga o que está `pendente`. No instante em que aloca, a
   * lavagem vira `agendado` e some do radar: por isso contrato novo é encaixado
   * nas frestas e o roteiro que já existia nunca é repensado.
   *
   * Isto abre a mão: devolve para a fila tudo que ainda pode ser redistribuído
   * — de amanhã em diante, não fixado, não iniciado, sem foto — e deixa o
   * alocador distribuir de novo, agora com todos os contratos na mesa.
   *
   * HOJE NÃO SE MEXE. A Nina já abriu a lista no celular.
   */
  async function refazerRoteiro() {
    if (!confirm(
      `Refazer o roteiro a partir de amanhã?\n\n` +
      `${idade?.redistribuiveis ?? 0} lavagem(ns) voltam para a fila e são distribuídas de novo, ` +
      `agora com todos os contratos cadastrados.\n\n` +
      `NÃO muda: hoje, o passado, o que você remarcou à mão, o que já começou e o que já tem foto.`
    )) return;

    setRefazendo(true); setDiag(null);
    try {
      const r = await fetch("/api/agenda/refazer", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.erro || "Não consegui refazer o roteiro."); return; }
      alert(
        `Roteiro refeito a partir de ${dataBonita(r.de)}.\n\n` +
        `${r.soltos} voltaram para a fila e ${r.agendados} foram distribuídas em ${r.dias} dia(s).`
      );
      carregar(); verSaude();
    } finally { setRefazendo(false); }
  }

  async function acao(id: string, corpo: any) {
    const r = await fetch(`/api/servico/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);

    if (!r?.ok) {
      alert(r?.erro || "Não consegui fazer isso agora.");
    } else if (corpo.acao === "remarcar" && r.seguintesMovidas > 0) {
      // conta o que aconteceu: mover uma lavagem mexe na régua do jazigo
      alert(
        `Remarcada para ${new Date(r.novaData + "T12:00:00").toLocaleDateString("pt-BR")}.\n\n` +
        `${r.seguintesMovidas} lavagem(ns) seguinte(s) deste jazigo também andaram, ` +
        `para manter o intervalo combinado.`
      );
    }
    setRemarcando(null);
    setNovaData("");
    carregar();
  }

  const chaves = Object.keys(visiveis).sort();
  const statusCor: Record<string, string> = {
    agendado: cor.teal,
    pendente: cor.cinza,
    alocado: cor.teal,
    executado: "rgb(var(--zm-positivo))",
    pulado: "rgb(var(--zm-aviso))",
  };

  const chip = (ativo: boolean): React.CSSProperties => ({
    ...(ativo ? painel.botaoMini : painel.botaoMiniSec),
    minHeight: 34, padding: "0 12px",
  });

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/agenda" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>Agenda</h1>

        {/* ========================================================= SAÚDE
            Primeiro item da tela porque é o único que pede uma decisão hoje.
            E nomeia a causa: "fora do lugar" sozinho não diz o que fazer. */}
        {/* O ROTEIRO ENVELHECEU (0125).
            Cada contrato novo, cada exclusão e cada puxada deixa o roteiro um
            pouco mais desatualizado — porque o alocador não repensa o que já
            distribuiu. A alternativa (recalcular sozinho a cada Salvar) seria
            pior: ela está cadastrando duzentos contratos hoje, e a agenda
            inteira piscando a cada um é uma tela que ninguém aguenta.

            Então o sistema MEDE e OFERECE. O botão só aparece quando há de
            fato o que redistribuir. */}
        {idade && idade.redistribuiveis > 0 && (
          <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}` }}>
            <strong style={{ color: cor.navy }}>
              {idade.novasDesdeEntao > 0
                ? `${idade.novasDesdeEntao} lavagem(ns) entraram depois da última distribuição`
                : "O roteiro pode ser redistribuído"}
            </strong>
            <p style={{ fontSize: 14, color: cor.cinza, margin: "6px 0 0", lineHeight: 1.5 }}>
              Quando um contrato entra, as lavagens novas são encaixadas nos dias com
              vaga — o roteiro que já existia não é repensado. Refazer devolve{" "}
              <b>{idade.redistribuiveis}</b> lavagem(ns) para a fila e distribui tudo de novo,
              a partir de amanhã.
              {idade.refeitoEm && (
                <> Última vez: {new Date(idade.refeitoEm).toLocaleDateString("pt-BR")}.</>
              )}
            </p>
            <div style={{ marginTop: 10 }}>
              <button style={painel.botao} onClick={refazerRoteiro} disabled={refazendo || gerando}>
                {refazendo ? "Refazendo…" : "Refazer o roteiro de amanhã em diante"}
              </button>
            </div>
          </div>
        )}

        {saude && saude.foraDaJornada > 0 && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706",
                        background: "rgb(var(--zm-aviso) / 0.08)" }}>
            <strong style={{ color: "rgb(var(--zm-aviso))" }}>
              {saude.foraDaJornada} lavagem(ns) fora do lugar
            </strong>
            <ul style={{ color: "rgb(var(--zm-aviso))", fontSize: 15,
                         margin: "8px 0 12px", paddingLeft: 20, lineHeight: 1.6 }}>
              {saude.atrasadas > 0 && (
                <li><b>{saude.atrasadas} atrasada(s)</b> — o dia marcado já passou.</li>
              )}
              {saude.repetidas > 0 && (
                <li>
                  <b>{saude.repetidas} repetida(s)</b> — mais de uma lavagem do
                  mesmo jazigo no mesmo dia. Lavar duas vezes na mesma manhã não
                  entrega nada na segunda, e a família é cobrada pelas duas.
                </li>
              )}
              {saude.diaNaoUtil > 0 && (
                <li>
                  <b>{saude.diaNaoUtil} em dia que não se trabalha</b> — acontece
                  quando os dias da jornada mudam e o que já estava marcado fica
                  no dia antigo.
                </li>
              )}
            </ul>
            <p style={{ color: "rgb(var(--zm-aviso))", fontSize: 14,
                        margin: "0 0 12px", lineHeight: 1.5 }}>
              Reorganizar devolve essas lavagens para a fila com a data que o
              plano pedia e redistribui pelos dias de trabalho, respeitando a
              capacidade e uma lavagem por jazigo por dia. O que você fixou à
              mão (📌) não é tocado.
            </p>
            <button style={painel.botao} onClick={reorganizar} disabled={gerando}>
              {gerando ? "Reorganizando…" : "Reorganizar a agenda"}
            </button>
          </div>
        )}

        {/* ================================================ PERÍODO E FILTRO */}
        <div style={{ ...painel.card, padding: 12 }}>
          <div data-filtros style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 15, color: cor.cinza, marginRight: 4 }}>Mostrar:</span>
            {/* O PRIMEIRO CHIP DIZIA "AMANHÃ" E MOSTRAVA HOJE.
                `dias: 1` com `inicio` vazio faz a API começar em
                `diaOperacao()` — que é HOJE. O rótulo mentia, e quem clicava
                procurando o dia seguinte via o dia corrente e concluía que a
                agenda "começa amanhã".

                Agora são dois botões de verdade: Hoje começa hoje, Amanhã
                começa amanhã. O que distingue os dois não é `dias` (é 1 nos
                dois) — é o `inicio`. */}
            {([
              ["hoje", 1, "", "Hoje"],
              ["amanha", 1, somaDias(diaOperacao(), 1), "Amanhã"],
              ["d3", 3, "", "3 dias"],
              ["d7", 7, "", "7 dias"],
              ["d14", 14, "", "14 dias"],
              ["d30", 30, "", "30 dias"],
              ["d90", 90, "", "90 dias"],
            ] as [string, number, string, string][])
              .map(([k, v, ini, rot]) => (
                <button key={k}
                  style={chip(periodo.dias === v && !periodo.fim && periodo.inicio === ini)}
                  onClick={() => setPeriodo({ dias: v, inicio: ini, fim: "" })}>
                  {rot}
                </button>
              ))}
            <span style={{ fontSize: 15, color: cor.cinza, marginLeft: 8 }}>ou período:</span>
            <input type="date" style={{ ...painel.input, width: 150 }} value={periodo.inicio}
                   onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} />
            <input type="date" style={{ ...painel.input, width: 150 }} value={periodo.fim}
                   onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
                        marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="procurar família, jazigo, rua…"
              style={{ ...painel.input, width: 260 }}
            />
            {([["tudo", "tudo"], ["atrasadas", "atrasadas"],
               ["aberto", "sem pessoa"], ["pessoa", "com pessoa"],
               ["pedidos", "só pedidos"]] as const).map(([v, rot]) => (
              <button key={v} style={chip(recorte === v)} onClick={() => setRecorte(v)}>
                {rot}
              </button>
            ))}
            {filtrando && (
              <button style={chip(false)}
                      onClick={() => { setBusca(""); setRecorte("tudo"); }}>
                limpar filtro
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= RESUMO
            O que se quer saber de relance: tamanho, dinheiro e quanto ainda
            não tem dono. */}
        {!carregando && resumo.total > 0 && (
          <div style={{ ...painel.card, display: "flex", gap: 20, flexWrap: "wrap",
                        alignItems: "baseline", padding: 14 }}>
            {[
              [`${resumo.total}`, resumo.total === 1 ? "lavagem" : "lavagens"],
              [`${resumo.dias}`, resumo.dias === 1 ? "dia" : "dias"],
              [dinheiro(resumo.valor), "no período"],
              [`${resumo.emAberto}`, "sem pessoa definida"],
              ...(resumo.comPessoa > 0 ? [[`${resumo.comPessoa}`, "com pessoa"]] : []),
              ...(resumo.executadas > 0 ? [[`${resumo.executadas}`, "já feitas"]] : []),
              ...(resumo.atrasadas > 0 ? [[`${resumo.atrasadas}`, "atrasadas"]] : []),
            ].map(([n, rot], i) => (
              <div key={i}>
                <div style={{ fontSize: 22, fontWeight: 700, color: cor.navy }}>{n}</div>
                <div style={{ fontSize: 13, color: cor.cinza }}>{rot}</div>
              </div>
            ))}
            {filtrando && (
              <div style={{ fontSize: 13, color: cor.cinza, alignSelf: "center" }}>
                (do que o filtro está mostrando)
              </div>
            )}
          </div>
        )}

        {/* ================================================= GERAR LIMPEZAS */}
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Gerar limpezas</strong>
          <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
            Cria o que os planos devem e distribui pelos dias de trabalho. Pode clicar à
            vontade: nunca duplica.
          </p>

          {/* PERÍODOS CURTOS.
              Existiam só 30, 60 e 90 dias. Para conferir se a régua de um
              jazigo está certa, era preciso despejar um trimestre inteiro na
              agenda e limpar depois na mão. Três dias respondem a mesma
              pergunta e cabem numa tela. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: cor.cinza, minWidth: 92 }}>Para conferir:</span>
            {[3, 7, 14].map((n) => (
              <button key={n} style={{ ...painel.botaoMiniSec, minHeight: 38 }}
                      disabled={gerando} onClick={() => gerarDias(n)}>
                {n} dias
              </button>
            ))}
            <span style={{ fontSize: 13, color: cor.cinza }}>
              gera pouco e já mostra o resultado na tela
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end",
                        marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
            <span style={{ fontSize: 14, color: cor.cinza, minWidth: 92, alignSelf: "center" }}>
              Operação:
            </span>
            {[30, 60, 90].map((n) => (
              <button key={n} style={painel.botaoSec} disabled={gerando} onClick={() => gerarDias(n)}>
                Próximos {n} dias
              </button>
            ))}
            <div style={{ width: 1, height: 34, background: cor.linha, margin: "0 4px" }} />
            <div>
              <label style={painel.rotulo}>Mês inteiro</label>
              <input type="month" style={{ ...painel.input, width: 150 }} value={mesAlvo}
                     onChange={(e) => setMesAlvo(e.target.value)} />
            </div>
            <button style={painel.botao} disabled={gerando} onClick={gerarMes}>
              {gerando ? "…" : "Gerar o mês"}
            </button>
          </div>

          {/* A CAIXA "INCLUIR OS AVULSOS NESTE MÊS" SAIU (0128).
              Ela criava, de uma vez, uma lavagem para todo mundo — e chamava
              isso de avulso. Era a única máquina do sistema que fabricava
              avulso sem ninguém pedir, justamente o contrário da regra: avulso
              é o que a família solicita.

              Também usava uma QUARTA definição de avulso (plano com cadência
              não recorrente) e, com um único plano vivo e mensal, não fazia
              nada havia meses.

              O Finados continua atendido, e melhor: cada família que pede ganha
              o seu pedido, com a data dela e o preço dela. */}

          {diag && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8,
                          background: diag.criados > 0 ? "#f0fdf4" : "rgb(var(--zm-fundo))",
                          border: `1px solid ${diag.criados > 0 ? "#bbf7d0" : cor.linha}` }}>
              <strong style={{ color: cor.navy }}>
                {diag.criados > 0 ? `${diag.criados} limpeza(s) criada(s)` : "Nada novo a criar"}
              </strong>
              <div style={{ fontSize: 15, color: cor.cinza, marginTop: 4 }}>
                {diag.planosAtivos != null && `${diag.planosAtivos} planos ativos · `}
                {diag.jaExistiam > 0 && `${diag.jaExistiam} já existiam · `}
                {diag.foraDoHorizonte > 0 && `${diag.foraDoHorizonte} fora do período · `}
                {diag.agendados} distribuída(s) em {diag.dias} dia(s)
              </div>
              {diag.proximaData && diag.criados === 0 && (
                <div style={{ fontSize: 15, color: cor.navy, marginTop: 6 }}>
                  A próxima ida é em {new Date(diag.proximaData + "T12:00:00").toLocaleDateString("pt-BR")} —
                  aumente o período para alcançá-la.
                </div>
              )}
            </div>
          )}
        </div>

        {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}

        {/* O ERRO VEM ANTES DO VAZIO, e o vazio so aparece se nao houve erro:
            "Nada agendado no periodo" e uma afirmacao, e ela so pode ser feita
            depois de ter conseguido perguntar. */}
        {!!erro && <Falhou mensagem={erro} aoTentar={carregar} parcial={chaves.length > 0} />}

        {!carregando && !erro && chaves.length === 0 && (
          <section style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              {filtrando
                ? "Nada bate com o filtro neste período."
                : "Nada agendado no período. Gere as limpezas aqui em cima — comece com 7 dias."}
            </p>
          </section>
        )}

        {/* ------------------------------------------------------ quem limpa
            Só aparece com alguém marcado: uma barra permanente no topo de uma
            tela que já tem período, gerar e reorganizar seria mais um lugar
            para o olho tropeçar todo dia. */}
        {marcados.size > 0 && (
          <section style={{ ...painel.card, position: "sticky", top: 8, zIndex: 5,
                            borderLeft: `5px solid ${cor.navy}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: cor.navy }}>
                {marcados.size} {marcados.size === 1 ? "limpeza marcada" : "limpezas marcadas"}
              </strong>
              <select style={{ ...painel.input, margin: 0, width: "auto", minWidth: 200 }}
                      value={quem} onChange={(e) => setQuem(e.target.value)}>
                {/* "Em aberto" é a PRIMEIRA opção porque é o estado normal —
                    a limpeza aparece para toda a equipe e quem começa assume. */}
                <option value="">deixar em aberto (qualquer pessoa)</option>
                {equipe.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
              <button style={painel.botaoMini} disabled={atribuindo} onClick={definirQuemLimpa}>
                {atribuindo ? "Salvando…" : "Aplicar"}
              </button>
              <button style={painel.botaoMiniSec} onClick={() => setMarcados(new Set())}>
                Desmarcar
              </button>
            </div>
            <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 0 0", lineHeight: 1.45 }}>
              Definir quem limpa é opcional. Em aberto, a limpeza aparece para toda a
              equipe e <b>quem começa assume</b> — inclusive quem não é fixo.
            </p>
          </section>
        )}

        {chaves.map((d) => {
          const doDia = visiveis[d];
          const naoFeitas = doDia.filter((x) => x.status !== "executado");
          const valorDia = doDia.reduce((a, s) => a + (Number(s.valor) || 0), 0);
          const todosMarcados = naoFeitas.length > 0 && naoFeitas.every((x) => marcados.has(x.id));
          const cheio = (dias[d] || []).length >= capacidadeDia;

          return (
            <section key={d} style={painel.card}>
              {/* CABEÇALHO DO DIA — o dia é a unidade de trabalho, então ele
                  carrega o próprio placar: quantas de quantas cabem, e quanto
                  vale. "13" sozinho não diz se o dia está tranquilo ou no
                  limite; "13 de 20" diz. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ color: cor.navy, fontSize: 16 }}>{dataBonita(d)}</strong>
                <span style={{ fontSize: 14, color: cheio ? "rgb(var(--zm-aviso))" : cor.cinza,
                               fontWeight: cheio ? 700 : 400 }}>
                  {(dias[d] || []).length} de {capacidadeDia} {cheio ? "· dia cheio" : ""}
                </span>
                {valorDia > 0 && (
                  <span style={{ fontSize: 14, color: cor.cinza }}>{dinheiro(valorDia)}</span>
                )}
                {filtrando && doDia.length !== (dias[d] || []).length && (
                  <span style={{ fontSize: 13, color: cor.cinza }}>
                    ({doDia.length} no filtro)
                  </span>
                )}
                {/* MARCAR O DIA INTEIRO — é como ela pensa: "quinta é da Ana".
                    Marcar quinze linhas uma a uma para dizer isso é o trabalho
                    que o lote existe para tirar. */}
                {naoFeitas.length > 0 && (
                  <button
                    style={{ ...painel.botaoMiniSec, minHeight: 30, padding: "0 10px" }}
                    onClick={() => {
                      const ids = naoFeitas.map((x) => x.id);
                      setMarcados((m) => {
                        const n = new Set(m);
                        for (const id of ids) { if (todosMarcados) n.delete(id); else n.add(id); }
                        return n;
                      });
                    }}
                  >
                    {todosMarcados ? "desmarcar o dia" : "marcar o dia"}
                  </button>
                )}

                {/* PUXAR O DIA — para frente ou para trás.
                    Remarcar já resolvia uma linha. Faltava o dia como unidade:
                    choveu na terça, e as quinze passam para quarta.

                    Fica no cabeçalho porque o alvo é o dia, não a limpeza. */}
                {naoFeitas.length > 0 && (
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center",
                                 marginLeft: "auto" }}>
                    <span style={{ fontSize: 13, color: cor.cinza }}>puxar o dia:</span>
                    <button
                      style={{ ...painel.botaoMiniSec, minHeight: 30, padding: "0 10px" }}
                      disabled={movendoDia === d}
                      title={`Passar as ${naoFeitas.length} para o dia anterior`}
                      onClick={() => moverDia(d, -1)}
                    >← 1 dia</button>
                    <button
                      style={{ ...painel.botaoMiniSec, minHeight: 30, padding: "0 10px" }}
                      disabled={movendoDia === d}
                      title={`Passar as ${naoFeitas.length} para o dia seguinte`}
                      onClick={() => moverDia(d, 1)}
                    >1 dia →</button>
                  </span>
                )}
              </div>

              {doDia.map((s) => {
                // O número da parada é o do ROTEIRO do dia, não o da lista
                // filtrada: filtrar não muda a ordem em que se caminha.
                const bruto = dias[d] || [];
                const idx = bruto.findIndex((x) => x.id === s.id);
                const executado = s.status === "executado";

                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap",
                      borderTop: `1px solid ${cor.linha}`, paddingTop: 10, marginTop: 10,
                      opacity: s.estornadoEm ? 0.6 : 1,
                    }}
                  >
                    {/* A CAIXA DE SELEÇÃO. Só no que ainda não foi executado —
                        ali `executora_id` é o registro de quem lavou, e trocar
                        pagaria uma pessoa pelo trabalho de outra. */}
                    {!executado && (
                      <input
                        type="checkbox"
                        checked={marcados.has(s.id)}
                        onChange={() => alternar(s.id)}
                        aria-label={`Marcar ${s.familia || s.jazigo}`}
                        style={{ width: 20, height: 20, flexShrink: 0, cursor: "pointer",
                                 marginTop: 4 }}
                      />
                    )}

                    {/* SETAS DE ORDEM.
                        Arrastar seria mais bonito, mas quebra em toque e em
                        leitor de tela, e esta lista é mexida na véspera, no
                        computador, com pressa. Duas setas fazem o mesmo e não
                        têm como falhar pela metade.

                        Com filtro ligado elas ficam desligadas: a ordem é do
                        dia inteiro, e subir uma linha "uma posição" dentro de
                        uma lista recortada moveria para um lugar que não é o
                        que se está vendo. */}
                    {!executado && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button
                          onClick={() => mover(d, s.id, -1)}
                          disabled={idx <= 0 || movendo === s.id || filtrando}
                          title={filtrando ? "Limpe o filtro para reordenar o dia" : "Fazer antes"}
                          style={{ ...painel.botaoMiniSec, minHeight: 26, padding: "0 8px", lineHeight: 1 }}
                        >▲</button>
                        <button
                          onClick={() => mover(d, s.id, 1)}
                          disabled={idx === bruto.length - 1 || movendo === s.id || filtrando}
                          title={filtrando ? "Limpe o filtro para reordenar o dia" : "Fazer depois"}
                          style={{ ...painel.botaoMiniSec, minHeight: 26, padding: "0 8px", lineHeight: 1 }}
                        >▼</button>
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 240 }}>
                      {/* LINHA 1 — DE QUEM É.
                          A família vem primeiro porque é a entidade (0091): o
                          contato pode não existir, ou ser outro no ano que vem.
                          Uma agenda que abre pelo contato mostra o que muda e
                          esconde o que fica. */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: cor.cinza, fontSize: 14, fontWeight: 700 }}>
                          {idx + 1}º
                        </span>
                        <span style={{ color: cor.navy, fontWeight: 700, fontSize: 16 }}>
                          {s.familia || "família não definida"}
                        </span>
                        {s.executoraId && nomeDe(s.executoraId) && (
                          <span title="Quem vai limpar — definido por você na agenda"
                                style={{ fontSize: 13, fontWeight: 600, color: cor.navy,
                                         background: "rgb(var(--zm-fundo))", border: `1px solid ${cor.linha}`,
                                         borderRadius: 999, padding: "2px 8px" }}>
                            {nomeDe(s.executoraId)}
                          </span>
                        )}
                        {s.fixado && (
                          <span title="Data escolhida por você — a geração automática não mexe nesta lavagem"
                                style={{ fontSize: 13, fontWeight: 700, color: "#0f766e",
                                         background: "#ecfdf5", border: "1px solid #99f6e4",
                                         borderRadius: 999, padding: "2px 8px" }}>
                            📌 data sua
                          </span>
                        )}
                        {/* PEDIDO, NÃO CONTRATO (0128).
                            A agenda mistura as duas de propósito — é uma rota
                            só, e a Nina lava as duas do mesmo jeito. Mas a
                            decisão de escritório NÃO é a mesma: adiar uma
                            lavagem de contrato encurta o intervalo até a
                            próxima; adiar um pedido é furar uma data que
                            alguém combinou com a família. Sem o selo, as duas
                            são a mesma linha na tela. */}
                        {s.origem === "pedido" && (
                          <span title={s.dataPedida
                                  ? `Pedido pela família para ${new Date(s.dataPedida + "T12:00:00").toLocaleDateString("pt-BR")}`
                                  : "Lavagem pedida pela família, fora do contrato"}
                                style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed",
                                         background: "#f5f3ff", border: "1px solid #ddd6fe",
                                         borderRadius: 999, padding: "2px 8px" }}>
                            🙋 pedido
                          </span>
                        )}
                        {/* O ATRASO. Sai de data_plano contra o dia em que a
                            lavagem caiu — é o único número que denuncia a
                            lavagem empurrada antes de a família reclamar. */}
                        {s.atrasoDias > 0 && !executado && (
                          <span title={`O plano pedia ${new Date(s.dataPlano + "T12:00:00").toLocaleDateString("pt-BR")}`}
                                style={{ fontSize: 13, fontWeight: 700, color: "rgb(var(--zm-aviso))",
                                         background: "rgb(var(--zm-aviso) / 0.12)",
                                         borderRadius: 999, padding: "2px 8px" }}>
                            {s.atrasoDias} dia(s) de atraso
                          </span>
                        )}
                      </div>

                      {/* LINHA 2 — ONDE FICA.
                          Jazigo, quadra e rua, nesta ordem, que é a de quem
                          procura no chão. A quadra vem do banco já escrita
                          "Quadra 1": a tela não põe mais um "Q" na frente. */}
                      <div style={{ color: "rgb(var(--zm-ink))", fontSize: 15, marginTop: 2 }}>
                        {s.jazigo || "jazigo sem identificação"}
                        {s.quadra ? ` · ${s.quadra}` : ""}
                        {s.rua ? ` · ${s.rua}` : (
                          <span title="Sem rua cadastrada: esta lavagem cai no fim do dia, fora do roteiro"
                                style={{ color: "rgb(var(--zm-aviso))" }}> · sem rua</span>
                        )}
                      </div>

                      {/* LINHA 3 — o resto: quem está no túmulo, quem atende,
                          quanto custa, em que pé está. */}
                      <div style={{ color: cor.cinza, fontSize: 14, marginTop: 2 }}>
                        {s.falecido ? `${s.falecido} · ` : ""}
                        {s.contato || "sem contato"}
                        {s.valor ? ` · ${dinheiro(Number(s.valor))}` : ""}
                        {" · "}
                        <span style={{ color: statusCor[s.status] || cor.cinza }}>{s.status}</span>
                      </div>

                      {/* ------------------------------------ ÚLTIMA LAVAGEM
                          Sem esta linha a agenda diz "lavar o Perrela na
                          terça" e não diz que o Perrela foi lavado na sexta —
                          e quem monta o dia não tem como pular nada com
                          segurança.

                          `diasAte` é a distância entre a última lavagem e o
                          dia marcado. Quando ela é curta, a linha se acende:
                          não é erro (pode ser um pedido da família), é a
                          pergunta que alguém precisa fazer antes de a equipe
                          andar até lá. */}
                      <div style={{ fontSize: 14, marginTop: 2,
                                    color: s.ultimaLavagem && s.ultimaLavagem.diasAte <= 7
                                      ? "rgb(var(--zm-aviso))" : cor.cinza }}>
                        {s.ultimaLavagem ? (
                          <>
                            Última lavagem{" "}
                            {new Date(s.ultimaLavagem.dia + "T12:00:00").toLocaleDateString("pt-BR")}
                            {" · "}
                            {s.ultimaLavagem.diasAte === 0
                              ? "no mesmo dia"
                              : `${s.ultimaLavagem.diasAte} dia(s) antes desta`}
                            {s.ultimaLavagem.noCampo ? " · registrada no campo" : " · anotada pelo painel"}
                            {s.ultimaLavagem.executora ? ` · ${s.ultimaLavagem.executora}` : ""}
                          </>
                        ) : (
                          "Primeira lavagem deste jazigo"
                        )}

                        {/* E QUANDO VEM A PRÓXIMA (0125).
                            Com os dois números na frente, "pular ou excluir"
                            deixa de ser chute:

                              não lavo há 40 dias e a próxima é só em setembro
                                  -> não pule
                              lavei anteontem e tem outra na quinta
                                  -> pode pular

                            Sem a próxima, a linha só contava metade da
                            história — e a metade que não decide nada. */}
                        {s.proximaLavagem ? (
                          <> · próxima em{" "}
                            {new Date(s.proximaLavagem.dia + "T12:00:00").toLocaleDateString("pt-BR")}
                            {" ("}
                            {s.proximaLavagem.emDias === 1
                              ? "no dia seguinte"
                              : `${s.proximaLavagem.emDias} dias depois`}
                            {")"}
                          </>
                        ) : (
                          <span style={{ color: "rgb(var(--zm-aviso))" }}>
                            {" "}· <b>não há próxima marcada</b> — pular esta deixa o jazigo sem
                          </span>
                        )}
                      </div>

                      {s.estornadoEm && (
                        <div style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, marginTop: 2 }}>
                          estornada{s.motivoEstorno ? ` — ${s.motivoEstorno}` : ""}
                        </div>
                      )}
                    </div>

                    {/* ------------------------------------------- controles
                        TUDO À VISTA, por pedido dela.
                        
                        Antes, só Remarcar aparecia e Pular, Excluir e Soltar
                        data ficavam atrás de um "mais ⌄". A intenção era tirar
                        peso visual de uma lista de vinte linhas — mas na
                        prática cobrava um clique a mais em toda decisão que não
                        fosse remarcar, e obrigava a lembrar que o resto existia
                        escondido ali.

                        Quem mexe nesta tela é a Sureya, na véspera, com pressa.
                        Uma ação a um toque vale mais que uma lista enxuta.

                        O que NÃO mudou: Excluir continua vermelho e continua
                        perguntando antes. Estar à vista não é o mesmo que ser
                        fácil de fazer sem querer. */}
                    {!executado && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {remarcando === s.id ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="date"
                              value={novaData}
                              onChange={(e) => setNovaData(e.target.value)}
                              style={{ ...painel.input, width: 160, padding: 8 }}
                            />
                            <label style={{ display: "flex", alignItems: "center", gap: 6,
                                            fontSize: 14, color: cor.cinza }}>
                              <input type="checkbox" checked={replanejar}
                                     onChange={(e) => setReplanejar(e.target.checked)} />
                              mover também as próximas deste jazigo
                            </label>
                            <button
                              style={painel.botaoMini}
                              onClick={() => novaData && acao(s.id, {
                                acao: "remarcar", novaData, replanejar,
                              })}
                            >
                              Salvar
                            </button>
                            <button style={painel.botaoMiniSec} onClick={() => setRemarcando(null)}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* ANTECIPAR OU EMPURRAR UM DIA, sem digitar data.
                                Remarcar continua ali para a data qualquer; isto
                                é para o caso comum — "essa aqui faz amanhã", "essa
                                dá para adiantar" —, que não merecia abrir um
                                campo de calendário.

                                Passa pela MESMA porta do Remarcar, com a mesma
                                marca de "decidido por pessoa": sem ela o
                                alocador desfaz de madrugada. `replanejar` fica
                                em false, como no Remarcar de um dia inteiro —
                                mover uma limpeza um dia não deve arrastar o
                                ciclo inteiro daquele jazigo. */}
                            <button style={painel.botaoMiniSec}
                                    title="Fazer um dia antes"
                                    onClick={() => acao(s.id, {
                                      acao: "remarcar",
                                      novaData: somaDias(d, -1),
                                      // AS SEGUINTES DESTE JAZIGO ANDAM JUNTO,
                                      // mantendo o intervalo combinado. Mover só
                                      // esta encurtaria o vão até a próxima — e
                                      // a família paga por intervalo, não por
                                      // data solta.
                                      replanejar: true,
                                    })}>
                              ← 1 dia
                            </button>
                            <button style={painel.botaoMiniSec}
                                    title="Deixar para o dia seguinte"
                                    onClick={() => acao(s.id, {
                                      acao: "remarcar",
                                      novaData: somaDias(d, 1),
                                      replanejar: true,
                                    })}>
                              1 dia →
                            </button>
                            <button style={painel.botaoMiniSec}
                                    onClick={() => setRemarcando(s.id)}>
                              Outra data
                            </button>
                            <button style={painel.botaoMiniSec}
                                    onClick={() => {
                                      const motivo = prompt(
                                        "Pular esta lavagem?\n\n" +
                                        "A próxima do jazigo já vem no ciclo seguinte.\n" +
                                        "Motivo (opcional):", "");
                                      if (motivo !== null) acao(s.id, { acao: "pular", motivo });
                                    }}>
                              Pular
                            </button>
                            {/* "Soltar data" só existe para lavagem com data fixada à
                                mão — nas outras, o botão não teria o que soltar. */}
                            {s.fixado && (
                              <button style={painel.botaoMiniSec}
                                      title="Devolve esta lavagem para a distribuição automática"
                                      onClick={() => {
                                        if (!confirm(
                                          `Devolver ${s.jazigo} para a agenda automática?\n\n` +
                                          "A data que você escolheu deixa de ser respeitada: na próxima " +
                                          "geração ela pode mudar de dia."
                                        )) return;
                                        acao(s.id, { acao: "desfixar" });
                                      }}>
                                Soltar data
                              </button>
                            )}
                            <button style={painel.botaoMiniPerigo}
                                    onClick={() => {
                                      if (!confirm(
                                        `Excluir a lavagem de ${s.jazigo}?\n\n` +
                                        `Some da agenda de vez. Para só adiar, use Remarcar.`)) return;
                                      excluir(s.id);
                                    }}>
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {executado && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Avaliar servicoId={s.id} />
                        {/* Estornar também sai de trás do "mais ⌄". Continua
                            vermelho e continua perguntando antes — o que muda é
                            só o clique a mais para achá-lo. */}
                        {!s.estornadoEm && (
                          <button style={painel.botaoMiniPerigo}
                                  onClick={() => estornar(s.id, s.jazigo || "este jazigo")}>
                            Estornar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </main>
    </div>
  );
}

function Avaliar({ servicoId }: { servicoId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setBusy(true);
    const r = await fetch(`/api/servico/${servicoId}/avaliacao`, { method: "POST" })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (r?.ok) setLink(`${window.location.origin}/avaliar/${r.token}`);
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  if (link) {
    return (
      <button style={painel.botaoMiniSec} onClick={copiar}>
        {copiado ? "✓ copiado" : "Copiar link de avaliação"}
      </button>
    );
  }
  return (
    <button style={painel.botaoMiniSec} onClick={gerar} disabled={busy}>
      {busy ? "..." : "Pedir avaliação"}
    </button>
  );
}
