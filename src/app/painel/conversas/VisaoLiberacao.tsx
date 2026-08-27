"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Trash2, AlertTriangle, Undo2, Shuffle, CheckSquare, Square, StopCircle, XCircle } from "lucide-react";
import { Cartao, Botao, Selo, Falhou } from "../pecas";
import { BellOff, Bell, CalendarClock } from "lucide-react";
import { diasDesde, faz } from "@/lib/datas";

/**
 * A FILA DE LIBERAÇÃO — onde a Sureya aprova cada mensagem.
 *
 * Ela vê a PRÉVIA EXATA do que vai sair: as fotos e o texto já com o nome
 * preenchido. Pode editar antes de mandar. Nada é enviado sem que ela toque
 * em "Enviar", uma mensagem por vez.
 *
 * O envio sai pela instância da Evolution — a mesma linha de WhatsApp dela —,
 * levando AS FOTOS junto. O link `wa.me` não serviria: carrega só texto, e as
 * fotos do antes e do depois são o motivo da mensagem existir.
 */

interface Foto { url: string; etapa: "antes" | "depois" | null }

/**
 * OS TIPOS, na ordem em que se decide sobre eles.
 *
 * Desde a 0094 esta fila é a porta única: foto da lavagem, cobrança, lembrete,
 * agradecimento, comemorativa e convite de serviço entram todos por aqui. Antes
 * as três últimas moravam numa SEGUNDA fila (`interacoes_ia`), com tela própria
 * — a aba "Rascunhos da IA", em outro endereço, que ninguém abria.
 */
const TIPOS: [string, string][] = [
  ["", "Tudo"],
  ["foto", "Fotos"],
  ["cobranca", "Cobranças"],
  ["lembrete", "Lembretes"],
  ["comemorativa", "Comemorativas"],
  ["servico", "Serviços"],
  ["agradecimento", "Agradecimentos"],
];

/**
 * OS GRUPOS DE LIBERAÇÃO.
 *
 * O filtro por tipo é uma lista de sete botões, e sete escolhas não são uma
 * organização — são um menu. O que a Sureya faz de verdade são quatro
 * conversas de naturezas diferentes, e cada uma se decide num momento e num
 * tom próprios:
 *
 *   Fotos dos serviços   o carinho — sai depois da limpeza
 *   Cobrança             a rotina do dinheiro — competência a vencer
 *   Inadimplente         quem JÁ deve — outro tom, outra urgência
 *   Ações                oferta e data comemorativa — é venda e memória
 *   Demais               lembrete e agradecimento
 *
 * "Inadimplente" NÃO é um tipo de mensagem: é um corte por SALDO dentro das
 * cobranças. Sem ele, a cobrança de rotina e a de quem deve há três meses
 * chegavam na mesma lista e saíam com o mesmo clique.
 */
type Grupo = {
  id: string;
  rotulo: string;
  descricao: string;
  /** Decide se um item pertence ao grupo. Recebe o item inteiro, não só o tipo. */
  pega: (i: Item) => boolean;
};

const GRUPOS: Grupo[] = [
  { id: "", rotulo: "Tudo", descricao: "tudo o que está esperando decisão",
    pega: () => true },
  { id: "fotos", rotulo: "Fotos dos serviços",
    descricao: "a foto da limpeza, para a família ver o cuidado",
    pega: (i) => i.tipo === "foto" },
  { id: "cobranca", rotulo: "Cobrança",
    descricao: "a cobrança de rotina — a família ainda não está devendo",
    pega: (i) => i.tipo === "cobranca" && !(Number(i.saldoDevedor) > 0.005) },
  { id: "inadimplente", rotulo: "Inadimplente",
    descricao: "cobrança de quem JÁ tem saldo em aberto — leia antes de liberar",
    pega: (i) => i.tipo === "cobranca" && Number(i.saldoDevedor) > 0.005 },
  { id: "acoes", rotulo: "Ações",
    descricao: "oferta de serviço e datas comemorativas",
    pega: (i) => i.tipo === "servico" || i.tipo === "comemorativa" },
  { id: "demais", rotulo: "Demais",
    descricao: "lembretes e agradecimentos",
    pega: (i) => i.tipo === "lembrete" || i.tipo === "agradecimento" },
];

/** Os tipos que a família pode silenciar. A foto tem chave própria (0085). */
const SILENCIAVEIS = ["cobranca", "lembrete", "agradecimento", "comemorativa", "servico"];

interface Item {
  id: string; tipo: string; texto: string; fotos: Foto[] | null;
  familia: string | null; para: string | null; telefone: string | null; local: string | null;
  jazigo: string | null; executadoEm: string | null; criadoEm: string | null;
  /** O que a fila lembra da última tentativa (migration 0077). */
  tentativas: number; ultimoErro: string | null; ultimoErroEm: string | null;
  erroTipo: string | null; fotosEnviadas: number;
  /** Quando esta FAMÍLIA recebeu foto pela última vez. `null` = nunca (0087). */
  ultimaFotoFamiliaEm: string | null;
  ultimaFotoFamiliaTotal: number;
  /** E deste jazigo em particular — a família pode ter mais de uma pedra. */
  ultimaFotoJazigoEm: string | null;
  /**
   * A ÚLTIMA MENSAGEM QUE SAIU PARA ESTA FAMÍLIA, de qualquer tipo (0094).
   * `mesmoTipoDia` responde a segunda pergunta: a última DESTE tipo.
   */
  ultimaAcao: { tipo: string; dia: string; mesmoTipoDia: string | null } | null;
  /** Quanto a família deve. Positivo = em aberto. É o corte de "Inadimplente". */
  saldoDevedor?: number;
  /** Tipos que esta família pediu para não receber. */
  silenciados: string[];
  familiaId: string | null;
  /** A data combinada com a família. Enquanto for futura, a mensagem some
   *  da lista — e, se for cobrança, a régua não cria outra (0124). */
  adiadaPara?: string | null;
  motivoAdiamento?: string | null;
  /** ONDE a família tem jazigo. Lista porque uma casa pode ter mais de um,
   *  em quadras diferentes — e nesse caso ela aparece nos dois filtros. */
  cemiterios?: string[];
  quadras?: string[];
  ruas?: string[];
  /** Tem ao menos um jazigo contratado com valor. O mesmo corte do cobrador. */
  temContrato?: boolean;
}

/** "2026-08-14T09:30:00Z" -> "14/08 às 09:30". Sem depender de locale do device. */
function quando(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ROTULO: Record<string, string> = {
  foto: "Foto do serviço",
  cobranca: "Cobrança",
  lembrete: "Lembrete",
  agradecimento: "Agradecimento",
  comemorativa: "Data comemorativa",
  servico: "Convite de serviço",
};

export default function VisaoLiberacao() {
  const [itens, setItens] = useState<Item[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  /** O limiar de aviso da casa (Config › Mensagens). Zero = sem aviso. */
  const [diasEntreFotos, setDiasEntreFotos] = useState(0);
  /** As mensagens marcadas para o envio em lote. */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** O lote em andamento: o que já saiu, o que falhou, e o pedido de parar. */
  const [lote, setLote] = useState<{ total: number; feitos: number; falhas: string[] } | null>(null);
  const pararLote = useRef(false);
  const [carregando, setCarregando] = useState(true);
  /** O tipo escolhido. Vazio = tudo. Filtra no BANCO, não na tela. */
  /** O GRUPO escolhido. Vazio = tudo. Filtrado na TELA, não no banco: o corte
      "Inadimplente" depende do saldo da família, que não é um tipo. */
  const [grupo, setGrupo] = useState("");
  /** A chave mestra da casa. Desligada = nada sai sozinho, só pela tela. */
  const [disparosAutomaticos, setDisparosAutomaticos] = useState(true);
  const [porTipo, setPorTipo] = useState<Record<string, number>>({});
  /** Quantas estão guardadas para depois, e se a lista está mostrando ELAS. */
  const [adiadas, setAdiadas] = useState(0);
  const [verAdiadas, setVerAdiadas] = useState(false);
  /**
   * OS RECORTES DE DISPARO (0125).
   *
   * O grupo responde "que tipo de mensagem é". Estes respondem "para quem" —
   * e é a pergunta que ela faz quando quer falar com um pedaço do cemitério de
   * uma vez: os avulsos de uma quadra, os contratos de um cemitério.
   *
   * Vazio = não filtra. Combinam entre si e com o grupo.
   */
  const [fCemiterio, setFCemiterio] = useState("");
  const [fQuadra, setFQuadra] = useState("");
  const [fRua, setFRua] = useState("");
  const [fContrato, setFContrato] = useState<"" | "com" | "sem">("");
  const [silenciando, setSilenciando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** O último descarte, para o "desfazer". Um só: descartar de novo substitui. */
  const [descartado, setDescartado] = useState<Item | null>(null);
  /** Os outros textos da casa, por mensagem, já com o nome de quem recebe. */
  const [outros, setOutros] = useState<Record<string, string[]>>({});
  const [buscandoTexto, setBuscandoTexto] = useState<string | null>(null);

  /**
   * OUTRO TEXTO, EM UM TOQUE.
   *
   * A tela já deixava editar à mão. O que faltava era o caminho rápido: na
   * pressa, o que sai é o que veio — e foi assim que um bilhete de sistema
   * chegou a uma família em 22/08.
   *
   * Os textos vêm RENDERIZADOS do servidor. Montá-los aqui daria uma segunda
   * implementação do primeiro nome e o texto da prévia deixaria de ser, letra
   * por letra, o texto enviado.
   */
  async function outroTexto(item: Item) {
    const atual = editando[item.id] ?? item.texto;
    let lista = outros[item.id];

    if (!lista) {
      setBuscandoTexto(item.id);
      try {
        const r = await fetch(`/api/fila/textos?id=${item.id}`).then((x) => x.json());
        lista = ((r?.textos || []) as Array<{ texto: string }>).map((t) => t.texto).filter(Boolean);
        setOutros((x) => ({ ...x, [item.id]: lista! }));
      } catch {
        lista = [];
      } finally {
        setBuscandoTexto(null);
      }
    }

    if (!lista.length) {
      alert("Não há outros textos cadastrados. Você pode escrever os seus em Config › Textos das mensagens.");
      return;
    }

    // Gira a lista a partir do texto atual: tocar de novo dá o PRÓXIMO, e não
    // um sorteio que pode repetir o que ela acabou de recusar.
    const i = lista.indexOf(atual);
    const proximo = lista[(i + 1) % lista.length];
    if (proximo === atual && lista.length === 1) {
      alert("Só há um texto cadastrado para este tipo. Cadastre outros em Config › Textos das mensagens.");
      return;
    }
    setEditando((x) => ({ ...x, [item.id]: proximo }));
  }

  // CARREGA TUDO, e agrupa na tela.
  //
  // O filtro por tipo era feito no BANCO. Não serve mais: "Inadimplente" é um
  // corte por SALDO dentro das cobranças, e o banco não sabe disso pela coluna
  // `tipo`. Carregar tudo também deixa a contagem de cada grupo correta sem
  // uma segunda consulta — e a fila de liberação é curta por natureza: se um
  // dia deixar de ser, o problema é a fila, não a consulta.
  /**
   * "NADA ESPERANDO LIBERACAO" E UMA AFIRMACAO FORTE.
   *
   * Esta tela e a unica porta de saida de mensagem para familia — nada sai sem
   * o toque dela. Quando /api/fila falhava, o `if (r.ok)` saia sem fazer nada,
   * `itens` ficava vazio, e a tela dizia "Nada esperando liberacao" com
   * mensagens paradas do outro lado. Ela fecharia a aba tranquila.
   *
   * Nao havia nem `catch`: a promessa rejeitada morria como unhandled rejection
   * no console, sem nada na tela.
   */
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const x = await fetch(`/api/fila${verAdiadas ? "?adiadas=1" : ""}`);
      if (!x.ok) throw new Error(`HTTP ${x.status}`);
      const r = await x.json();
      if (!r?.ok) throw new Error(r?.erro || "resposta_negativa");
      setItens(r.itens);
      setWhatsapp(r.whatsapp || "");
      setDiasEntreFotos(Number(r.diasEntreFotos) || 0);
      setDisparosAutomaticos(!!r.disparosAutomaticos);
      setPorTipo(r.porTipo || {});
      setAdiadas(Number(r.adiadas) || 0);
      setErro("");
    } catch (e) {
      console.error("[liberacao] carregar:", e);
      setErro("Não consegui ler a fila. Pode haver mensagem esperando que não estou mostrando.");
    } finally { setCarregando(false); }
  }, [verAdiadas]);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * "NÃO ENVIAR MAIS DISSO PARA ESTA FAMÍLIA."
   *
   * Descartar resolve a mensagem de hoje. Isto resolve a decisão: há família
   * que não quer cobrança por WhatsApp, e família em luto para quem uma
   * mensagem comemorativa é uma ofensa. Descartar item a item é lembrar disso
   * todo mês — e basta esquecer uma vez.
   *
   * Vale na PORTA (0094): a próxima nem chega a ser preparada. O que já está na
   * fila continua, porque sumir com o que alguém já está olhando seria decidir
   * por quem está na tela.
   */
  async function silenciar(item: Item) {
    if (!item.familiaId) {
      alert("Esta mensagem não está ligada a uma família — não dá para silenciar por aqui.");
      return;
    }
    const jaMudo = item.silenciados.includes(item.tipo);
    const rotulo = (ROTULO[item.tipo] ?? item.tipo).toLowerCase();
    const quem = item.familia || item.para || "esta família";

    if (!confirm(jaMudo
      ? `Voltar a preparar mensagens de ${rotulo} para ${quem}?`
      : `Não preparar mais mensagens de ${rotulo} para ${quem}?\n\n` +
        `As próximas não entram nesta fila. Esta aqui continua, para você decidir.`)) return;

    setSilenciando(item.id);
    try {
      const r = await fetch(`/api/familias/${item.familiaId}/silenciar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: item.tipo, silenciar: !jaMudo }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "Não consegui salvar."); return; }
      alert(r.mensagem);
      await carregar();
    } finally { setSilenciando(null); }
  }

  /**
   * ADIAR — a família combinou uma data (0124).
   *
   * "Pode ser dia 15?" não tinha o que fazer nesta tela. As duas saídas eram
   * ruins: descartar (e a régua criava outra amanhã, cobrando dois dias depois
   * de a Sureya ter dito "combinado") ou deixar na fila (e ela ter de lembrar
   * de cabeça, todo dia, que aquela já estava acertada).
   *
   * Adiar uma COBRANÇA segura a família inteira até a data. O silêncio é a
   * promessa.
   */
  async function adiar(item: Item) {
    const hoje = new Date();
    const sugestao = new Date(hoje.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const ate = prompt(
      `Adiar para quando?\n\n`
      + (item.tipo === "cobranca"
          ? "Até essa data, nenhuma outra cobrança sai para esta família.\n\n"
          : "")
      + "Data no formato AAAA-MM-DD:",
      sugestao,
    );
    if (ate === null) return;                       // cancelou
    const limpo = ate.trim();
    if (!limpo) return;
    const motivo = prompt("Combinado o quê? (opcional — fica anotado na mensagem)", "") || null;

    setOcupado(item.id);
    try {
      const r = await fetch("/api/fila", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao: "adiar", ate: limpo, motivo }),
      }).then((x) => x.json());
      if (!r.ok) { alert(r.mensagem || r.erro || "Não consegui adiar."); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  /** Desadiar — o caminho de volta de quem adiou por engano. */
  async function desadiar(item: Item) {
    setOcupado(item.id);
    try {
      const r = await fetch("/api/fila", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao: "adiar", ate: null }),
      }).then((x) => x.json());
      if (!r.ok) { alert(r.mensagem || r.erro || "Não consegui trazer de volta."); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  async function decidir(item: Item, acao: "enviar" | "descartar" | "restaurar") {
    setOcupado(item.id);
    try {
      const r = await fetch("/api/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao, texto: editando[item.id] ?? item.texto }),
      }).then((x) => x.json());

      if (!r.ok) {
        // A mensagem VOLTA para a fila quando o envio falha — e agora a fila
        // GUARDA o motivo. Recarregar faz o cartão mostrar a tentativa e o erro
        // em vez de a informação morrer neste alert.
        alert(r.erro || "Não consegui enviar.");
        await carregar();
        return;
      }
      if (acao === "descartar") setDescartado(item);
      if (acao === "restaurar") { setDescartado(null); await carregar(); return; }
      setItens((a) => a.filter((x) => x.id !== item.id));
    } finally { setOcupado(null); }
  }

  // ==========================================================================
  // O ENVIO EM LOTE
  //
  // Vinte fotos de Finados são vinte revisões e vinte cliques, cada um com uma
  // espera de rede no meio. O lote tira os cliques e mantém a revisão: ela lê,
  // marca, e manda de uma vez.
  //
  // SEQUENCIAL, e não em paralelo. Cada envio sobe as FOTOS pela Evolution —
  // são megabytes por mensagem, na mesma linha de WhatsApp dela. Vinte de uma
  // vez derrubaria a instância, e a fila voltaria com vinte erros de rede que
  // não são erros de verdade. Uma de cada vez é mais lento e é o que funciona.
  //
  // E DÁ PARA PARAR NO MEIO. Um lote que só termina quando acaba é um lote que
  // ninguém começa. O que já saiu, saiu — não há como desfazer um WhatsApp —,
  // e o resto continua na fila esperando.
  // ==========================================================================
  function podeEnviar(i: Item) { return !!i.telefone; }

  function alternarMarca(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  /**
   * O RECORTE DE QUEM (0125), aplicado ANTES do grupo.
   *
   * Vale para TODOS os tipos, e não só para cobrança: "as fotos da quadra Q1"
   * e "os avulsos do cemitério do Cantão" são a mesma pergunta feita sobre
   * listas diferentes.
   *
   * A família com jazigo em duas quadras aparece nas duas — é o que ela é.
   */
  const recortados = itens.filter((i) => {
    if (fCemiterio && !(i.cemiterios || []).includes(fCemiterio)) return false;
    if (fQuadra && !(i.quadras || []).includes(fQuadra)) return false;
    if (fRua && !(i.ruas || []).includes(fRua)) return false;
    if (fContrato === "com" && !i.temContrato) return false;
    if (fContrato === "sem" && i.temContrato) return false;
    return true;
  });

  /** Os itens de um grupo, já recortados. O corte usa o item inteiro. */
  function itensDoGrupo(g: Grupo) {
    return recortados.filter(g.pega);
  }

  /**
   * AS OPÇÕES SAEM DO QUE ESTÁ NA FILA, e não do cadastro inteiro.
   *
   * Oferecer as 40 quadras do cemitério quando a fila só toca 3 é obrigar a
   * procurar — e escolher uma das 37 devolveria uma lista vazia sem explicar
   * por quê.
   *
   * As de cemitério e contrato saem da fila CRUA; as de quadra e rua saem do
   * que já está recortado, para escolher um cemitério estreitar as quadras
   * oferecidas em vez de deixar na lista quadras de outro lugar.
   */
  const opcoes = (pega: (i: Item) => string[] | undefined, base: Item[]) =>
    [...new Set(base.flatMap((i) => pega(i) || []))].sort();
  const paraQuadraERua = itens.filter((i) =>
    !fCemiterio || (i.cemiterios || []).includes(fCemiterio));

  const grupoAtual = GRUPOS.find((g) => g.id === grupo) || GRUPOS[0];
  /** O que a tela mostra: o grupo escolhido. */
  const visiveis = itensDoGrupo(grupoAtual);

  const enviaveis = visiveis.filter(podeEnviar);
  /** Sem aviso de foto recente — as que ela provavelmente quer mandar. */
  const semAviso = enviaveis.filter((i) => {
    if (i.tipo !== "foto" || diasEntreFotos <= 0) return true;
    const d = diasDesde(i.ultimaFotoFamiliaEm);
    return d === null || d >= diasEntreFotos;
  });
  const comAviso = enviaveis.length - semAviso.length;

  /**
   * DESCARTAR AS MARCADAS.
   *
   * Uma pergunta só, com o número e os nomes — e não trinta confirmações
   * seguidas, que é como se aprende a clicar em "ok" sem ler.
   *
   * NÃO é irreversível: cada uma volta pelo "desfazer" do topo, o mesmo
   * caminho do descarte individual (0093). O que se perde num engano é o
   * tempo de restaurar, não a mensagem.
   */
  async function descartarLote() {
    const alvos = visiveis.filter((i) => marcadas.has(i.id));
    if (!alvos.length) return;

    const quem = alvos.slice(0, 3).map((a) => a.para || a.familia || "sem nome").join(", ");
    const resto = alvos.length > 3 ? ` e mais ${alvos.length - 3}` : "";
    if (!confirm(
      `Não enviar ${alvos.length} ${alvos.length === 1 ? "mensagem" : "mensagens"}?\n\n` +
      `${quem}${resto}.\n\nElas saem da fila. Dá para desfazer em seguida.`)) return;

    for (const item of alvos) {
      await fetch("/api/fila", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao: "descartar" }),
      }).catch(() => null);
    }
    setMarcadas(new Set());
    await carregar();
  }

  async function enviarLote() {
    const alvos = visiveis.filter((i) => marcadas.has(i.id) && podeEnviar(i));
    if (!alvos.length) return;

    const quem = alvos.slice(0, 3).map((a) => a.para || a.familia || "sem nome").join(", ");
    const resto = alvos.length > 3 ? ` e mais ${alvos.length - 3}` : "";
    if (!confirm(
      `Enviar ${alvos.length} ${alvos.length === 1 ? "mensagem" : "mensagens"} agora?\n\n` +
      `Para: ${quem}${resto}.\n\n` +
      `Sai uma de cada vez, com as fotos. Você pode parar no meio — o que já tiver saído não volta.`
    )) return;

    pararLote.current = false;
    setLote({ total: alvos.length, feitos: 0, falhas: [] });

    const falhas: string[] = [];
    let feitos = 0;

    for (const item of alvos) {
      if (pararLote.current) break;
      try {
        const r = await fetch("/api/fila", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, acao: "enviar", texto: editando[item.id] ?? item.texto }),
        }).then((x) => x.json());

        if (r?.ok) {
          feitos++;
          setItens((a) => a.filter((x) => x.id !== item.id));
          setMarcadas((m) => { const n = new Set(m); n.delete(item.id); return n; });
        } else {
          // O NOME DE QUEM FALHOU, não só a contagem. "18 de 20 enviadas" sem
          // dizer quais duas obriga a conferir as vinte na mão.
          falhas.push(`${item.para || item.familia || "sem nome"}: ${r?.erro || "não saiu"}`);
        }
      } catch (e: any) {
        falhas.push(`${item.para || item.familia || "sem nome"}: ${e?.message || "rede"}`);
      }
      setLote({ total: alvos.length, feitos, falhas: [...falhas] });
    }

    setLote({ total: alvos.length, feitos, falhas });
    // Recarrega para as que falharam voltarem com o motivo escrito no cartão.
    if (falhas.length) await carregar();
  }

  /**
   * CONFIRMAR O DESCARTE.
   *
   * "Não enviar" ficava ao lado de "Enviar", do mesmo tamanho, e agia na hora.
   * Descartar por engano a foto da limpeza do túmulo do pai de alguém é o tipo
   * de erro que não dá para consertar depois — a mensagem some da lista e a
   * família nunca recebe, sem ninguém perceber.
   *
   * A confirmação é uma pergunta só, e o desfazer fica no topo depois.
   */
  function pedirDescarte(item: Item) {
    const quem = item.para || item.familia || "esta família";
    if (!confirm(`Não enviar esta mensagem para ${quem}?\n\nEla sai da fila. Você pode desfazer logo em seguida.`)) return;
    decidir(item, "descartar");
  }

  if (carregando) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  return (
    <>
      <p className="mb-3 text-[14px] text-ink-soft">
        {visiveis.length} {visiveis.length === 1 ? "mensagem" : "mensagens"}
        {grupo ? " neste grupo" : ""} · nada é enviado sem você aprovar
      </p>

      {/* ------------------------------------------------ FILTRO POR TIPO
          Numa lista única, decidir sobre trinta fotos e duas cobranças no
          mesmo scroll é como as cobranças passam batido: são decisões de
          natureza diferente, tomadas em momentos diferentes do dia.

          Os números são contados SEM o filtro — senão sumiriam assim que uma
          aba fosse escolhida, que é justamente quando servem para dizer o que
          está esperando do outro lado. */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {/* OS CINCO GRUPOS APARECEM SEMPRE, inclusive vazios.
            Herdei do filtro por tipo antigo um `return null` para o que estava
            zerado — e ali fazia sentido, porque os tipos são muitos e vão e
            vêm. Aqui é uma TAXONOMIA FIXA: com a fila vazia (o caso de hoje,
            medido em 23/08: zero mensagens), some tudo menos "Tudo", e quem
            abre a tela conclui que os grupos não existem. Era exatamente o que
            estava sendo relatado.

            Um grupo com (0) informa: "não há cobrança de inadimplente hoje" é
            uma resposta, e some não é. */}
        {/* AS GUARDADAS PARA DEPOIS (0124).
            Elas não aparecem na lista até o dia combinado — mas precisam ser
            ALCANÇÁVEIS, senão "adiar" viraria "sumir", e a Sureya teria de
            confiar na memória para saber o que combinou com quem. */}
        {(adiadas > 0 || verAdiadas) && (
          <button
            onClick={() => { setVerAdiadas(!verAdiadas); setMarcadas(new Set()); }}
            title="mensagens com data combinada com a família"
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              verAdiadas
                ? "border-brand bg-brand text-white"
                : "border-line bg-card text-ink-soft hover:bg-surface"}`}
          >
            <CalendarClock size={13} className="mr-1 inline align-[-2px]" />
            {verAdiadas ? "voltar para a fila" : `guardadas para depois (${adiadas})`}
          </button>
        )}

        {GRUPOS.map((g) => {
          const n = g.id ? itensDoGrupo(g).length : recortados.length;
          return (
            <button
              key={g.id || "tudo"}
              onClick={() => { setGrupo(g.id); setMarcadas(new Set()); }}
              title={g.descricao}
              className={`rounded-full border px-3 py-1.5 text-[13px] ${
                grupo === g.id
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-card text-ink hover:border-brand"}`}
            >
              {g.rotulo} ({n})
            </button>
          );
        })}
      </div>

      {/* ================================ PARA QUEM (0125)
          O grupo acima responde "que tipo de mensagem". Isto responde "para
          quem" — e é a pergunta que ela faz quando quer falar com um pedaço do
          cemitério de uma vez: os avulsos de uma quadra, os contratos de um
          cemitério.

          Aparece só quando há de fato uma escolha a fazer. Uma fila inteira na
          mesma quadra não ganha um seletor de quadra com uma opção só. */}
      {(() => {
        const cems = opcoes((i) => i.cemiterios, itens);
        const quas = opcoes((i) => i.quadras, paraQuadraERua);
        const rus  = opcoes((i) => i.ruas, paraQuadraERua);
        const temContratoEAvulso =
          itens.some((i) => i.temContrato) && itens.some((i) => !i.temContrato);
        if (cems.length < 2 && quas.length < 2 && rus.length < 2 && !temContratoEAvulso) return null;

        const filtrando = !!(fCemiterio || fQuadra || fRua || fContrato);
        const caixa = "rounded-lg border border-line bg-card px-2 py-1.5 text-[13px] text-ink";

        return (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink-soft">Para quem:</span>

            {temContratoEAvulso && (
              <select className={caixa} value={fContrato}
                      onChange={(e) => { setFContrato(e.target.value as any); setMarcadas(new Set()); }}>
                <option value="">contrato e avulso</option>
                <option value="com">só com contrato</option>
                <option value="sem">só avulso</option>
              </select>
            )}

            {cems.length > 1 && (
              <select className={caixa} value={fCemiterio}
                      onChange={(e) => {
                        setFCemiterio(e.target.value);
                        // Trocar de cemitério zera quadra e rua: a quadra
                        // escolhida pode não existir no cemitério novo, e o
                        // resultado seria uma lista vazia sem explicação.
                        setFQuadra(""); setFRua(""); setMarcadas(new Set());
                      }}>
                <option value="">todos os cemitérios</option>
                {cems.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {quas.length > 1 && (
              <select className={caixa} value={fQuadra}
                      onChange={(e) => { setFQuadra(e.target.value); setFRua(""); setMarcadas(new Set()); }}>
                <option value="">todas as quadras</option>
                {quas.map((q) => <option key={q} value={q}>quadra {q}</option>)}
              </select>
            )}

            {rus.length > 1 && (
              <select className={caixa} value={fRua}
                      onChange={(e) => { setFRua(e.target.value); setMarcadas(new Set()); }}>
                <option value="">todas as ruas</option>
                {rus.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}

            {filtrando && (
              <button
                onClick={() => {
                  setFCemiterio(""); setFQuadra(""); setFRua(""); setFContrato("");
                  setMarcadas(new Set());
                }}
                className="text-[13px] text-brand underline underline-offset-2">
                limpar
              </button>
            )}

            {/* O QUE O RECORTE DEIXOU DE FORA, dito em número.
                Sem esta frase, um filtro esquecido faz a fila parecer vazia — e
                "não tem nada para liberar" e "eu filtrei e esqueci" viram a
                mesma tela. */}
            {filtrando && (
              <span className="text-[13px] text-ink-soft">
                {recortados.length} de {itens.length}
                {itens.length - recortados.length > 0 && (
                  <> · {itens.length - recortados.length} fora do recorte</>
                )}
              </span>
            )}
          </div>
        );
      })()}

      {/* NADA SAI SOZINHO — e a tela precisa dizer isso.
          Com a chave mestra desligada, a IA não responde por conta própria, a
          fila de envios não drena e a foto da conclusão não parte sozinha. O
          botão "Enviar" desta tela continua funcionando: ele não passa pela
          chave. Sem esta faixa, a Sureya não teria como saber em qual dos dois
          mundos está — e "não chegou" viraria um chamado. */}
      {!disparosAutomaticos && (
        <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 text-[13.5px] leading-relaxed text-ink-soft">
          <b className="text-ink">Nenhuma mensagem sai sozinha.</b> Enquanto o app não se
          provar na operação, tudo passa por esta tela: você lê, escolhe e manda. O que
          o sistema gera fica aqui esperando — nada vai para a família sem um comando seu.
        </div>
      )}

      {/* FILA VAZIA NÃO É DEFEITO — mas parece um, se a tela só ficar branca.
          Hoje ela está: nada foi gerado ainda, e os disparos automáticos estão
          desligados de propósito. Dizer isso evita o chamado. */}
      {!!erro && <Falhou mensagem={erro} aoTentar={carregar} parcial={itens.length > 0} />}

      {itens.length === 0 && !erro && (
        <div className="mb-4 rounded-xl2 border border-line bg-card p-4">
          <p className="text-[15px] font-semibold text-ink">Nada esperando liberação.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
            As mensagens chegam aqui sozinhas: a <b>foto</b> quando uma limpeza é
            concluída, a <b>cobrança</b> pelos degraus da régua, as <b>datas de
            memória</b> pelo calendário. Nenhuma delas sai sem você mandar.
          </p>
        </div>
      )}

      {/* O QUE ESTE GRUPO É. Sem a frase, "Inadimplente" e "Cobrança" parecem
          dois nomes para a mesma coisa — e a diferença entre eles é o tom da
          conversa que a Sureya vai ter. */}
      <p className="mb-4 text-[13px] leading-relaxed text-ink-soft">
        {(GRUPOS.find((g) => g.id === grupo) || GRUPOS[0]).descricao}
      </p>

      {/* ------------------------------------------------------- o lote */}
      {lote && (
        <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 text-[14px] text-ink">
          {lote.feitos < lote.total && !pararLote.current ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Enviando… <b>{lote.feitos} de {lote.total}</b>. Uma por vez, com as fotos.</span>
              <Botao tom="perigo" onClick={() => { pararLote.current = true; }}>
                <StopCircle size={16} /> Parar
              </Botao>
            </div>
          ) : (
            <div>
              <b>{lote.feitos} de {lote.total} {lote.total === 1 ? "enviada" : "enviadas"}.</b>
              {lote.falhas.length > 0 && (
                <>
                  {" "}As que não saíram continuam na fila, com o motivo no cartão:
                  <ul className="mt-1 list-disc pl-4 text-perigo">
                    {(lote.falhas || []).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </>
              )}
              <button className="mt-2 underline" onClick={() => setLote(null)}>ok</button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- a barra de seleção
          Só aparece quando há mais de uma mensagem: com uma, marcar para
          depois mandar é mais trabalho que mandar. */}
      {enviaveis.length > 1 && !lote && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3">
          <button
            onClick={() => setMarcadas((m) =>
              m.size === enviaveis.length ? new Set() : new Set(enviaveis.map((i) => i.id)))}
            className="inline-flex items-center gap-1.5 text-[14px] text-ink hover:text-brand"
          >
            {marcadas.size === enviaveis.length ? <CheckSquare size={17} /> : <Square size={17} />}
            {marcadas.size === enviaveis.length ? "Desmarcar todas" : "Marcar todas"}
          </button>

          {/* O ATALHO QUE NASCEU DO "não quero manter a frequência toda data":
              marcar só as que não têm aviso de foto recente. Sem ele, marcar
              todas e desmarcar as amarelas uma a uma é o trabalho que o lote
              deveria estar tirando. */}
          {comAviso > 0 && (
            <button
              onClick={() => setMarcadas(new Set(semAviso.map((i) => i.id)))}
              className="text-[14px] text-ink-soft underline decoration-dotted hover:text-brand"
              title={`${comAviso} ${comAviso === 1 ? "família recebeu" : "famílias receberam"} foto há menos de ${diasEntreFotos} dias`}
            >
              marcar só as {semAviso.length} sem aviso
            </button>
          )}

          <span className="flex-1" />

          <Botao tom="principal" disabled={!marcadas.size} onClick={enviarLote}>
            <Send size={16} /> Enviar {marcadas.size || ""} {marcadas.size === 1 ? "marcada" : "marcadas"}
          </Botao>

          {/* DESCARTAR EM LOTE.
              Descartar existia uma a uma, e revisar trinta comemorativas que
              não fazem sentido este ano custava trinta confirmações — o
              trabalho que o lote deveria estar tirando.
              Continua com COMANDO e CONFIRMAÇÃO: a pergunta diz quantas e
              para quem, e o desfazer fica no topo depois. */}
          <Botao tom="perigo" disabled={!marcadas.size} onClick={descartarLote}>
            <XCircle size={16} /> Não enviar {marcadas.size || ""}
          </Botao>
        </div>
      )}

      {/* O WhatsApp precisa estar de pé para as FOTOS saírem. Avisar aqui
          evita ela revisar tudo e descobrir o problema no último clique. */}
      {whatsapp && whatsapp !== "conectado" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl2 border border-aviso/30 bg-aviso/10 p-3 text-[14px] text-aviso">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <span>
            O WhatsApp está {whatsapp === "conectando" ? "conectando" : "desconectado"}. As
            mensagens ficam guardadas aqui até a conexão voltar.{" "}
            <a href="/painel/whatsapp" className="underline">Reconectar</a>
          </span>
        </div>
      )}

      {/* DESFAZER — a segunda metade da entrega 2 do Build 6.
          Fica no topo, não dentro do cartão que acabou de sumir. */}
      {descartado && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl2 border border-line bg-card p-3 text-[14px]">
          <span className="text-ink-soft">
            Mensagem para <b className="text-ink">{descartado.para || descartado.familia}</b> não será enviada.
          </span>
          <Botao tom="secundario" disabled={ocupado === descartado.id}
                 onClick={() => decidir(descartado, "restaurar")}>
            <Undo2 size={16} /> Desfazer
          </Botao>
        </div>
      )}

      {/* LISTA VAZIA POR CAUSA DO RECORTE (0125).
          Sem esta caixa, filtrar até sobrar nada devolve uma tela em branco — e
          "não tem nada para liberar" e "eu filtrei e esqueci" viram a mesma
          coisa. Um filtro que esconde em silêncio é pior que filtro nenhum. */}
      {!!itens.length && !visiveis.length && (fCemiterio || fQuadra || fRua || fContrato) && (
        <Cartao>
          <p className="text-[16px] font-medium text-ink">
            Nenhuma mensagem neste recorte
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
            Há {itens.length} {itens.length === 1 ? "mensagem esperando" : "mensagens esperando"},
            mas nenhuma delas é{" "}
            {[
              fContrato === "com" ? "de família com contrato" : null,
              fContrato === "sem" ? "de família sem contrato" : null,
              fCemiterio ? `do cemitério ${fCemiterio}` : null,
              fQuadra ? `da quadra ${fQuadra}` : null,
              fRua ? `da rua ${fRua}` : null,
            ].filter(Boolean).join(", ")}
            {grupo && <> dentro de <b>{grupoAtual.rotulo}</b></>}.
          </p>
          <button
            onClick={() => {
              setFCemiterio(""); setFQuadra(""); setFRua(""); setFContrato("");
              setMarcadas(new Set());
            }}
            className="mt-2 text-[14px] text-brand underline underline-offset-2">
            limpar o recorte
          </button>
        </Cartao>
      )}

      {!itens.length && !erro && (
        <Cartao>
          <p className="text-[16px] font-medium text-ink">Nada esperando aprovação</p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Quando a Nina terminar uma limpeza, a mensagem com as fotos aparece aqui
            para você revisar antes de enviar.
          </p>
        </Cartao>
      )}

      {visiveis.map((item) => (
        <Cartao key={item.id}>
          {/* QUEM, PARA QUEM, ONDE E QUANDO — entrega 1 do Build 6.
              Antes o cartão mostrava `para || familia`, que colapsa os dois: com
              a neta recebendo a foto do jazigo da avó, a tela dizia só um nome e
              não dava para saber qual dos dois era. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* A CAIXA DE SELEÇÃO fica na primeira posição da linha, antes do
                rótulo: é a coluna que o olho percorre ao marcar várias. Some
                quando não há telefone — marcar o que não pode sair só produz
                uma falha no fim do lote. */}
            {enviaveis.length > 1 && item.telefone && (
              <button
                onClick={() => alternarMarca(item.id)}
                aria-label={marcadas.has(item.id) ? "Desmarcar esta mensagem" : "Marcar esta mensagem"}
                className={marcadas.has(item.id) ? "text-brand" : "text-ink-soft hover:text-brand"}
              >
                {marcadas.has(item.id) ? <CheckSquare size={19} /> : <Square size={19} />}
              </button>
            )}
            <Selo tom="neutro">{ROTULO[item.tipo] ?? item.tipo}</Selo>
            <span className="text-[15px] font-medium text-ink">
              {item.para || item.familia || "—"}
            </span>
            {item.para && item.familia && item.para !== item.familia && (
              <span className="text-[13px] text-ink-soft">família {item.familia}</span>
            )}
          </div>
          <p className="mb-2 text-[13px] text-ink-soft">
            {[
              item.jazigo,
              item.local,
              quando(item.executadoEm) ? `limpo em ${quando(item.executadoEm)}` : null,
              item.telefone,
            ].filter(Boolean).join(" · ")}
          </p>

          {/* ------------------------------------------- A ÚLTIMA AÇÃO (0094)
              A pergunta antes de liberar não é só "já mandei foto?": é "eu já
              não falei com essa gente esta semana?". Três mensagens no mesmo
              dia, cada uma de um tipo, cada uma liberada sozinha sem que nada
              na tela dissesse que as outras duas existiam — é assim que se
              cansa uma família.

              A linha da FOTO continua sendo a de baixo, com o limiar da casa:
              esta aqui é a de qualquer tipo, e as duas respondem coisas
              diferentes. */}
          <p className="mb-3 text-[13px] text-ink-soft">
            {(() => {
              if (!item.ultimaAcao) {
                return <><b className="text-positivo">Primeira mensagem para esta família.</b> Nada saiu ainda.</>;
              }
              const dGeral = diasDesde(item.ultimaAcao.dia + "T12:00:00");
              const dMesmo = item.ultimaAcao.mesmoTipoDia
                ? diasDesde(item.ultimaAcao.mesmoTipoDia + "T12:00:00") : null;
              const rot = (ROTULO[item.ultimaAcao.tipo] ?? item.ultimaAcao.tipo).toLowerCase();
              return (
                <>
                  <b>Última mensagem para esta família:</b> {rot}
                  {dGeral !== null ? ` ${faz(dGeral)}` : ""}
                  {dMesmo !== null && item.ultimaAcao.mesmoTipoDia !== item.ultimaAcao.dia && (
                    <> · deste mesmo tipo, {faz(dMesmo)}</>
                  )}
                  {dMesmo === null && <> · deste tipo, nenhuma ainda</>}
                </>
              );
            })()}
          </p>

          {/* QUANDO ESTA FAMÍLIA RECEBEU FOTO PELA ÚLTIMA VEZ (migration 0087).
              Fica ACIMA das fotos, não abaixo: é a informação com que ela
              decide se vale a pena olhar o resto. */}
          {item.tipo === "foto" && (() => {
            const dFam = diasDesde(item.ultimaFotoFamiliaEm);
            const dJaz = diasDesde(item.ultimaFotoJazigoEm);

            // NUNCA RECEBEU é outra coisa que "recebeu há muito tempo", e é o
            // caso em que ela manda sem pensar duas vezes. Merece palavra
            // própria e cor de tranquilidade, não de alerta.
            if (dFam === null) {
              return (
                <p className="mb-3 rounded-lg border border-positivo/30 bg-positivo/10 px-3 py-2 text-[13px] text-positivo">
                  <b>Primeira foto desta família.</b> Ela nunca recebeu nenhuma.
                </p>
              );
            }

            // O aviso só existe se a casa pediu um limiar. Zero desliga.
            const recente = diasEntreFotos > 0 && dFam < diasEntreFotos;

            return (
              <p className={`mb-3 rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${
                recente ? "border-aviso/30 bg-aviso/10 text-aviso"
                        : "border-line bg-card text-ink-soft"}`}>
                <b>
                  Última foto para esta família: {quando(item.ultimaFotoFamiliaEm)} ({faz(dFam)})
                </b>
                {item.ultimaFotoFamiliaTotal > 1 && <> · {item.ultimaFotoFamiliaTotal} já enviadas</>}
                {/* A segunda pergunta, que só faz sentido quando as duas datas
                    diferem: a foto de 8 dias atrás pode ter sido da outra pedra. */}
                {dJaz !== null && dJaz !== dFam && (
                  <> · <b>neste jazigo:</b> {quando(item.ultimaFotoJazigoEm)} ({faz(dJaz)})</>
                )}
                {dJaz === null && (
                  <> · <b>deste jazigo, nenhuma ainda.</b></>
                )}
                {recente && <> — faz menos de {diasEntreFotos} dias.</>}
              </p>
            );
          })()}

          {/* O QUE A FILA LEMBRA DA ÚLTIMA TENTATIVA (migration 0077).
              Sem isto, uma mensagem que falhou seis vezes fica visualmente
              idêntica a uma que acabou de entrar na fila. */}
          {item.tentativas > 0 && (
            <div className={`mb-3 rounded-lg border p-3 text-[13px] leading-relaxed ${
              item.erroTipo === "permanente"
                ? "border-perigo/30 bg-perigo/10 text-perigo"
                : "border-aviso/30 bg-aviso/10 text-aviso"}`}>
              <b>
                {item.erroTipo === "permanente"
                  ? "Não vai sair sem alguém corrigir."
                  : `Já tentei ${item.tentativas}ª vez${item.tentativas > 1 ? "" : ""}.`}
              </b>
              {item.ultimoErro && <> {item.ultimoErro}</>}
              {quando(item.ultimoErroEm) && (
                <span className="opacity-80"> ({quando(item.ultimoErroEm)})</span>
              )}
              {item.fotosEnviadas > 0 && (item.fotos?.length || 0) > item.fotosEnviadas && (
                <p className="mt-1">
                  <b>{item.fotosEnviadas} de {item.fotos!.length} fotos já foram.</b>{" "}
                  Ao tentar de novo mando só as que faltam — a família não recebe repetido.
                </p>
              )}
            </div>
          )}

          {!!item.fotos?.length && (
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {(item.fotos || []).map((f, i) => (
                <figure key={i} className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.etapa === "antes" ? "Antes da limpeza"
                       : f.etapa === "depois" ? "Depois da limpeza"
                       : "Foto do serviço"}
                    className="h-28 w-40 rounded-lg object-cover"
                  />
                  {/* O rótulo vem do serviço, não da posição na lista — com uma
                      foto só, a posição não diz se é o antes ou o depois. Foto
                      sem par conhecido fica sem rótulo em vez de receber um chute. */}
                  <figcaption className="mt-1 text-center text-[12px] text-ink-soft">
                    {f.etapa === "antes" ? "antes" : f.etapa === "depois" ? "depois" : "—"}
                    {item.fotosEnviadas > i && <span className="text-positivo"> · enviada</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {/* A prévia é editável: o texto que ela vê é o texto que vai sair. */}
          <textarea
            rows={6}
            value={editando[item.id] ?? item.texto}
            onChange={(e) => setEditando((x) => ({ ...x, [item.id]: e.target.value }))}
            className="w-full rounded-lg border border-line bg-card p-3 text-[15px] leading-relaxed text-ink focus:border-brand focus:outline-none"
          />

          <div className="mt-2">
            <button
              type="button"
              disabled={buscandoTexto === item.id}
              onClick={() => outroTexto(item)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[14px] text-ink-soft hover:border-brand hover:text-brand disabled:opacity-60"
            >
              <Shuffle size={15} />
              {buscandoTexto === item.id ? "Buscando…" : "Outro texto"}
            </button>
          </div>

          {/* A PROMESSA, ESCRITA. Sem esta linha, "adiada" seria um estado
              invisível que a Sureya teria de deduzir da ausência da mensagem
              na lista — e adivinhar já custou caro nesta casa. */}
          {item.adiadaPara && (
            <p className="mt-3 rounded-xl2 border border-line bg-surface px-3 py-2 text-[13.5px] text-ink-soft">
              <CalendarClock size={14} className="mr-1 inline align-[-2px]" />
              Guardada até{" "}
              <b className="text-ink">
                {String(item.adiadaPara).slice(0, 10).split("-").reverse().join("/")}
              </b>
              {item.motivoAdiamento && <> — {item.motivoAdiamento}</>}
              {item.tipo === "cobranca" && (
                <> · até lá, nenhuma outra cobrança sai para esta família.</>
              )}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Botao tom="principal" disabled={ocupado === item.id || !item.telefone}
                   onClick={() => decidir(item, "enviar")}>
              <Send size={16} />
              {ocupado === item.id
                ? "Enviando…"
                : item.fotosEnviadas > 0 && (item.fotos?.length || 0) > item.fotosEnviadas
                  ? `Continuar (faltam ${item.fotos!.length - item.fotosEnviadas})`
                  : `Enviar${item.fotos?.length ? ` com ${item.fotos.length} foto${item.fotos.length > 1 ? "s" : ""}` : ""}`}
            </Botao>
            <Botao tom="perigo" disabled={ocupado === item.id}
                   onClick={() => pedirDescarte(item)}>
              <Trash2 size={16} /> Não enviar
            </Botao>

            {/* ADIAR fica ao lado de enviar, e não escondido: é a resposta
                para a frase mais comum que a família manda de volta. */}
            {item.adiadaPara ? (
              <Botao disabled={ocupado === item.id} onClick={() => desadiar(item)}>
                <CalendarClock size={16} /> Trazer de volta
              </Botao>
            ) : (
              <Botao disabled={ocupado === item.id} onClick={() => adiar(item)}>
                <CalendarClock size={16} /> Adiar
              </Botao>
            )}

            {/* NÃO ENVIAR MAIS DISSO — a decisão, e não a mensagem de hoje.
                Só para os tipos que têm silêncio: a foto tem chave própria,
                de três estados, em Config e na ficha da família (0085). */}
            {item.familiaId && SILENCIAVEIS.includes(item.tipo) && (
              <button
                onClick={() => silenciar(item)}
                disabled={silenciando === item.id}
                className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft underline decoration-dotted hover:text-brand"
                title={item.silenciados.includes(item.tipo)
                  ? "Esta família está sem mensagens deste tipo"
                  : "Parar de preparar mensagens deste tipo para esta família"}
              >
                {item.silenciados.includes(item.tipo)
                  ? <><Bell size={15} /> voltar a enviar deste tipo</>
                  : <><BellOff size={15} /> não enviar mais deste tipo</>}
              </button>
            )}
          </div>

          {!item.telefone && (
            <p className="mt-2 text-[13px] text-aviso">
              Esta pessoa não tem WhatsApp cadastrado.
            </p>
          )}
        </Cartao>
      ))}
    </>
  );
}
