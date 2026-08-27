"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sincronizar, resumoFila, estadoLocalDosServicos, descartar, migrarFilaAntiga,
         iniciarOuEnfileirar, concluirOuEnfileirar, type ResumoFila } from "@/lib/offline-fila";
import { capturarGps } from "@/lib/gps";
import { useConfirmar, useRecado } from "@/components/Dialogos";
import { prepararFoto, motivoFalha, type FotoPronta } from "@/lib/foto";
import InstalarApp from "../InstalarApp";
import Assistente from "./Assistente";
import Materiais from "./Materiais";
import NaoDeu from "./NaoDeu";
import CapturarJazigo, { type JazigoSalvo } from "./CapturarJazigo";
import ComoChegar from "./ComoChegar";

interface Aviso { tipo: string; texto: string }

/**
 * A leitura de GPS que NÃO segura ninguém.
 * Roda por fora, e se falhar não acontece nada: a coordenada é opcional e
 * serve só para afinar a posição do túmulo na rua.
 */
function capturarGpsSilencioso(tumuloId: string) {
  capturarGps({ alvoMetros: 10, timeoutMs: 8000 })
    .then((l) => {
      if (l && l.precisao <= 30) {
        fetch(`/api/tumulos/${tumuloId}/gps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...l, origem: "conclusao" }),
        }).catch(() => {});
      }
    })
    .catch(() => {});
}

// Cache da rota do dia, para a tela nao ficar em branco quando a rede cai.
const CACHE_DIA = "sureya_rota_do_dia";
const hojeLocal = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

interface Item {
  id: string;
  tumuloId: string;
  status: string;
  ordem: number | null;
  tumulo: string;
  quadra: string;
  cemiterio: string | null;
  rua: string;
  numero: string;
  falecido: string | null;
  cliente: string | null;
  lat: number | null;
  lng: number | null;
  gpsPrecisao: number | null;
  gpsAmostras: number;
  qrToken: string | null;
  fotoReferencia: string | null;
  fotoEnquadramento: string | null;
  fotoAntes: string | null;
  iniciadoEm: string | null;
  adiadoVezes: number;
  avisos: Aviso[];
  /** Marcadores LOCAIS: verdade do aparelho que o servidor ainda não recebeu. */
  aguardandoEnvio?: boolean;
  naoFeitoLocal?: boolean;
}

/**
 * O QUE JÁ ESTÁ RESOLVIDO NO APARELHO NÃO VOLTA A SER PENDENTE (CP-05).
 *
 * A lista vem do servidor (ou do cache do dia) e não sabe nada da fila local.
 * Ao concluir sem sinal, a tela marcava o jazigo como feito NO ESTADO, mas o
 * cache continuava com ele pendente — e a conclusão estava no IndexedDB, não no
 * servidor. Fechar e reabrir o app ainda sem sinal trazia o mesmo jazigo como
 * "falta lavar". A Nina tiraria a foto de novo, e a fila ganharia trabalho
 * duplicado do mesmo túmulo.
 *
 * O que a tela mostra passa a ser sempre a lista MAIS a fila local. Não é
 * enfeite: é a única leitura verdadeira, porque no cemitério o aparelho sabe
 * mais que o servidor na maior parte do dia.
 */
async function reconciliar(base: Item[]): Promise<Item[]> {
  const { iniciados, concluidos, naoFeitos } = await estadoLocalDosServicos();
  if (!iniciados.size && !concluidos.size && !naoFeitos.size) return base;
  return base.map((x) => {
    if (concluidos.has(x.id)) return { ...x, status: "executado", aguardandoEnvio: true };
    if (naoFeitos.has(x.id)) return { ...x, status: "executado", naoFeitoLocal: true, aguardandoEnvio: true };
    if (iniciados.has(x.id) && !x.iniciadoEm) {
      return { ...x, iniciadoEm: new Date().toISOString(), aguardandoEnvio: true };
    }
    return x;
  });
}

export default function Campo() {
  const perguntar = useConfirmar();
  const recado = useRecado();
  const [lista, setLista] = useState<Item[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [online, setOnline] = useState(true);
  /**
   * O QUE ESTÁ ESPERANDO, EM LAVAGEM E NÃO EM REGISTRO (CP-11).
   *
   * A faixa dizia "4 registros esperando". Uma lavagem gera DOIS registros —
   * `iniciar` e `concluir` — então quatro registros podem ser duas lavagens.
   * "Registro" é unidade de programador: ninguém no cemitério sabe quantos
   * registros uma lavagem tem, e o número parecia o dobro do trabalho parado.
   */
  const [fila, setFila] = useState<ResumoFila>({ lavagens: 0, recados: 0, precisamDeAjuda: [], itens: [] });
  /** Quantas subiram no último envio — é o "confirmado" da CP-06. */
  const [subiramAgora, setSubiramAgora] = useState(0);

  const [naoDeu, setNaoDeu] = useState<Item | null>(null);
  const [pedirMaterial, setPedirMaterial] = useState(false);
  const [capturarJazigo, setCapturarJazigo] = useState(false);
  /**
   * A CONFIRMAÇÃO DO ÚLTIMO JAZIGO, E A CONTA DA SESSÃO.
   *
   * Concluir o cadastro fechava a janela e voltava para a lista — o mesmo
   * resultado de tocar no ✕ para desistir. Cadastrando um atrás do outro, não
   * havia como saber se o último entrou sem sair do campo e abrir o painel.
   *
   * A conta importa tanto quanto o aviso: quem vai cadastrar a quadra inteira
   * precisa de ritmo, e "7 cadastrados" dá isso melhor que sete avisos iguais
   * que somem.
   */
  const [ultimoJazigo, setUltimoJazigo] = useState<JazigoSalvo | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [quantosJazigos, setQuantosJazigos] = useState(0);
  const [indo, setIndo] = useState<Item | null>(null);
  // Qual cartão puxar para a tela e realçar. Substitui os modais que abriam
  // sozinhos: com a câmera dentro do botão, não há mais tela intermediária
  // para abrir — o que faz sentido é levar a Nina até o cartão certo.
  const [destaque, setDestaque] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState<string | null>(null);
  // admin que entrou no campo pelo painel precisa de porta de volta (pedido 01/08)
  const [podePainel, setPodePainel] = useState(false);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/agenda/dia").then((x) => x.json()).catch(() => null),
      fetch("/api/campo/briefing").then((x) => x.json()).catch(() => null),
    ]);
    // SEM SINAL A LISTA NAO PODE SUMIR. Quando a rede falha, `a` vem null e a
    // tela ficava vazia — a Nina no corredor, com a rota do dia na mao, vendo
    // "Tudo feito por hoje". Agora a ultima lista boa fica guardada no aparelho
    // e continua na tela ate chegar uma nova.
    let base: Item[] | null = null;
    if (a?.ok) {
      base = Array.isArray(a.lista) ? a.lista : [];
      try { localStorage.setItem(CACHE_DIA, JSON.stringify({ dia: hojeLocal(), lista: base })); } catch {}
    } else {
      try {
        const guardado = JSON.parse(localStorage.getItem(CACHE_DIA) || "null");
        // só serve se for do MESMO dia: rota de ontem é pior que tela vazia
        if (guardado?.dia === hojeLocal() && Array.isArray(guardado.lista)) base = guardado.lista;
      } catch {}
    }
    if (base) setLista(await reconciliar(base));

    if (b?.ok) setBrief(b.briefing);
    setFila(await resumoFila());
    setCarregando(false);
  }, []);

  useEffect(() => {
    // trabalho que ficou na fila da versao anterior nao pode se perder
    migrarFilaAntiga().then(() => carregar()).catch(() => carregar());
  }, [carregar]);

  // pergunta ao servidor quem eu sou; so o admin ve o botao de voltar ao painel
  useEffect(() => {
    fetch("/api/eu")
      .then((x) => x.json())
      .then((r) => setPodePainel(!!r?.podePainel))
      .catch(() => null);
  }, []);

  useEffect(() => {
    // AO VOLTAR O SINAL, DIZER QUANTAS SUBIRAM.
    // Antes a faixa amarela simplesmente sumia — e sumir e dar certo pareciam a
    // mesma coisa. O aviso verde fica alguns segundos e some sozinho: é recibo,
    // não é estado.
    const ligou = () => {
      setOnline(true);
      sincronizar()
        .then((r) => { if (r.enviadas > 0) setSubiramAgora(r.enviadas); return carregar(); })
        .catch(() => null);
    };
    const caiu = () => setOnline(false);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", ligou);
    window.addEventListener("offline", caiu);
    return () => { window.removeEventListener("online", ligou); window.removeEventListener("offline", caiu); };
  }, [carregar]);

  useEffect(() => {
    if (!subiramAgora) return;
    const t = setTimeout(() => setSubiramAgora(0), 6000);
    return () => clearTimeout(t);
  }, [subiramAgora]);

  // aberto pelo QR da plaqueta: /t/TOKEN manda para cá com ?servico=ID
  useEffect(() => {
    if (!lista.length) return;
    const id = new URLSearchParams(window.location.search).get("servico");
    if (!id) return;
    const it = lista.find((x) => x.id === id);
    if (it && it.status !== "executado") {
      setDestaque(it.id);
    }
  }, [lista]);

  /**
   * MUDAR A TELA E O CACHE NO MESMO GESTO.
   *
   * `setLista` sozinho era metade do conserto da CP-05: a tela ficava certa até
   * a Nina fechar o app. O cache do dia continuava com o jazigo pendente, e ao
   * reabrir sem sinal ele voltava para a lista. Quem escreve na lista escreve
   * no cache — separar os dois é como eles discordam.
   */
  const marcar = useCallback((id: string, muda: (x: Item) => Item) => {
    setLista((atual) => {
      const nova = atual.map((x) => (x.id === id ? muda(x) : x));
      try {
        localStorage.setItem(CACHE_DIA, JSON.stringify({ dia: hojeLocal(), lista: nova }));
      } catch {}
      return nova;
    });
  }, []);

  /**
   * COMECAR — agora funciona sem sinal.
   *
   * Era um fetch cru: falhou, alerta "tente de novo". Como o botao de finalizar
   * so aparece depois de comecar, sem internet a Nina nao fechava jazigo
   * nenhum — mesmo com a faixa dizendo "pode continuar, eu guardo e mando
   * depois". Agora o inicio entra na mesma fila da conclusao, e a tela marca o
   * jazigo como em andamento na hora, sem esperar o servidor.
   */
  async function iniciar(it: Item, foto?: { b64: string; mt: string } | null) {
    setIniciando(it.id);
    const { desfecho, motivo } = await iniciarOuEnfileirar({
      servicoId: it.id,
      rotulo: it.falecido || it.tumulo,
      fotoBase64: foto?.b64,
      mimetype: foto?.mt,
    });
    setIniciando(null);

    if (desfecho === "perdido") {
      recado.erro(
        "A memória do aparelho encheu e eu não consegui guardar. " +
        "Procure um lugar com sinal e abra o app: assim que a internet voltar, " +
        "o que já está guardado sobe e libera espaço."
      );
      return;
    }
    // RECUSADO NÃO É GUARDADO. O item fica na fila marcado, e ela vê na faixa
    // vermelha o que houve — em vez de o cartão sumir como se tivesse dado
    // certo (CP-06).
    if (desfecho === "recusado") {
      recado.erro(`Não consegui começar esta limpeza. ${motivo || "O sistema recusou."}`);
      setFila(await resumoFila());
      return;
    }

    // marca em andamento AQUI, sem esperar a rede: o cartão muda para
    // "Finalizar com a foto" e ela segue trabalhando
    marcar(it.id, (x) => ({ ...x, iniciadoEm: x.iniciadoEm || new Date().toISOString(),
      aguardandoEnvio: desfecho === "offline" || x.aguardandoEnvio,
      fotoAntes: foto?.b64 ? `data:${foto.mt};base64,${foto.b64}` : x.fotoAntes }));

    if (desfecho === "offline") setFila(await resumoFila());
    else carregar();
  }

  /**
   * TERMINAR EM UM TOQUE.
   *
   * Antes, finalizar abria a tela `Concluir`: confirmar o jazigo, tirar a
   * foto, revisar, enviar. Quatro passos, de pé, no sol, às vezes de luva.
   * Agora o toque abre a câmera e o que volta dela já conclui o serviço.
   *
   * O GPS corre por fora e nunca segura o envio — ele é opcional, entra só
   * numa média. Segurar a Nina parada esperando sinal era o pior negócio
   * possível.
   */
  async function terminar(it: Item, foto: { b64: string; mt: string }) {
    setIniciando(it.id);

    capturarGpsSilencioso(it.tumuloId);

    const { desfecho, motivo } = await concluirOuEnfileirar({
      servicoId: it.id,
      rotulo: it.falecido || it.tumulo,
      fotoDepoisBase64: foto.b64,
      mimetype: foto.mt,
    });
    setIniciando(null);

    if (desfecho === "perdido") {
      recado.erro(
        "A memória do aparelho encheu e eu não consegui guardar esta foto. " +
        "Procure um lugar com sinal e abra o app: o que já está guardado sobe e libera espaço."
      );
      return;
    }
    if (desfecho === "recusado") {
      recado.erro(`Não consegui fechar esta limpeza. ${motivo || "O sistema recusou."} ` +
                  "A foto está guardada — não precisa tirar de novo.");
      setFila(await resumoFila());
      return;
    }

    // Some da lista na hora, online ou offline: o cemitério tem sinal ruim e
    // travar a tela esperando o servidor não ajuda ninguém.
    marcar(it.id, (x) => ({ ...x, status: "executado", aguardandoEnvio: desfecho === "offline" }));

    if (desfecho === "offline") setFila(await resumoFila());
    else carregar();
  }

  const pendentesLista = lista.filter((x) => x.status !== "executado");
  const feitos = lista.filter((x) => x.status === "executado").length;
  const total = lista.length;

  // Agrupa por cemitério, quadra e rua — é assim que se anda no cemitério.
  //
  // A ORDEM DOS GRUPOS DEPENDE DE `lista` VIR ORDENADA. `Map` guarda a ordem de
  // inserção, e `lista` chega do servidor por `ordem_dia`: o primeiro item
  // encontrado cria o primeiro grupo. É isso que faz "Fazer este agora"
  // funcionar na tela — o serviço vira `ordem_dia = 1`, e com ele a rua dele
  // sobe para o topo.
  //
  // Quem for mexer aqui: ordenar `pendentesLista` por qualquer outra coisa
  // (nome, distância) quebra o "agora" sem quebrar teste nenhum — o botão passa
  // a salvar no banco e a não mover nada na tela.
  // O nome do cemitério só entra no título quando o dia tem mais de um (0044):
  // com um só, repetir o nome em toda faixa seria ruído.
  const varios = new Set(pendentesLista.map((x) => x.cemiterio).filter(Boolean)).size > 1;
  /**
   * FAZER ESTE AGORA.
   *
   * Recarrega em vez de reordenar na tela: a ordem verdadeira é a do banco, e
   * a função lá desce todo o resto do dia. Reordenar só aqui daria uma tela
   * certa por cima de um banco diferente — e a diferença só apareceria no
   * próximo carregamento, no meio do cemitério.
   */
  async function fazerAgora(it: Item) {
    if (reordenando) return;
    setReordenando(true);
    try {
      const r = await fetch("/api/agenda/ordem", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicoId: it.id }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) {
        recado.erro(r?.erro?.includes("ja_executado")
          ? "Este já foi feito."
          : r?.erro?.includes("outra_executora")
            ? "Este serviço é de outra pessoa."
            : "Não consegui mudar a ordem agora. Tente de novo.");
        return;
      }
      await carregar();
    } finally { setReordenando(false); }
  }

  const grupos = new Map<string, Item[]>();
  for (const it of pendentesLista) {
    const chave = [varios ? it.cemiterio : null, it.quadra, it.rua]
      .filter(Boolean).join(" · ") || "Sem local";
    grupos.set(chave, [...(grupos.get(chave) || []), it]);
  }

  if (carregando) return <div style={s.centro}>Carregando…</div>;

  return (
    <main style={s.wrap}>
      {/* O QUE ESTÁ ESPERANDO, NA UNIDADE DELA (CP-11).
          "4 registros esperando" para duas lavagens fazia o trabalho parado
          parecer o dobro do que era. E a lista de quais jazigos importa: com o
          número sozinho, ela não sabia se o que faltava era o da manhã ou o de
          agora. */}
      {(!online || fila.lavagens > 0 || fila.recados > 0) && (
        <div style={s.faixaOffline}>
          {!online && "Sem internet. Pode continuar — eu guardo e mando quando o sinal voltar. "}
          {fila.lavagens > 0 && (
            <>
              <b>{fila.lavagens} {fila.lavagens === 1 ? "lavagem" : "lavagens"}</b>
              {" "}aguardando envio
              {(() => {
                const nomes = [...new Set((fila.itens || [])
                  .filter((p) => p.tipo === "iniciar" || p.tipo === "concluir")
                  .map((p) => p.rotulo).filter(Boolean))];
                return nomes.length ? <> ({nomes.join(", ")})</> : null;
              })()}.{" "}
            </>
          )}
          {fila.recados > 0 && (
            <>{fila.recados} {fila.recados === 1 ? "recado" : "recados"} guardado{fila.recados === 1 ? "" : "s"} também.</>
          )}
        </div>
      )}

      {/* CONFIRMADO — o quarto estado da CP-06. Sem ele, "sumiu da faixa" era a
          única prova de que o trabalho chegou, e sumir é exatamente o que
          acontece também quando algo dá errado. */}
      {subiramAgora > 0 && (
        <div style={s.faixaConfirmado}>
          ✓ {subiramAgora} {subiramAgora === 1 ? "lavagem enviada" : "lavagens enviadas"} agora. Chegou tudo.
        </div>
      )}

      {/* PRECISA DE AJUDA — o estado que não existia.
          Um item recusado pelo servidor (acesso vencido, serviço apagado)
          tentava para sempre e aparecia como "aguardando envio". O cartão já
          tinha sumido da lista dela: ela achava que tinha terminado, e aquilo
          podia nunca ser aceito. Esperar não resolve nenhum destes. */}
      {fila.precisamDeAjuda.length > 0 && (
        <div style={s.faixaAjuda}>
          <b>Isto aqui não vai subir sozinho.</b>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {(fila.precisamDeAjuda || []).map((p) => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                {p.rotulo || "Um registro"}
                {p.tipo === "iniciar" && " (começar)"}
                {p.tipo === "concluir" && " (terminar)"}
                {p.tipo === "nao_feito" && " (não deu para fazer)"}
                {p.tipo === "pedido_material" && " (pedido de material)"}
                : {p.motivoFalha || "o sistema recusou."}
                <button
                  style={s.botaoDescartar}
                  onClick={async () => {
                    if (!await perguntar({
                      oQue: "Tirar este da fila?",
                      efeito: "O trabalho não vai ser registrado no sistema. "
                            + "Se for uma lavagem que você fez, fale com a Sureya antes.",
                      confirmar: "Tirar da fila", tom: "perigo",
                    })) return;
                    await descartar(p.id);
                    setFila(await resumoFila());
                  }}
                >
                  Tirar da fila
                </button>
              </li>
            ))}
          </ul>
          <p style={{ margin: "8px 0 0", fontSize: 15 }}>
            Se disser que seu acesso venceu, saia e entre no app de novo — aí ele sobe.
            Se não resolver, fale com a Sureya antes de tirar da fila.
          </p>
        </div>
      )}

      <div style={s.topo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={s.saudacao}>{brief?.saudacao || "Olá!"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {podePainel && (
            <button style={s.sair} onClick={() => { location.href = "/painel"; }}>
              &larr; Painel
            </button>
          )}
          <button style={s.sair} onClick={async () => {
            if (!await perguntar({
              oQue: "Sair do aplicativo?",
              efeito: "O que estiver guardado no aparelho continua guardado e sobe quando você entrar de novo.",
              confirmar: "Sair",
            })) return;
            await fetch("/api/sair", { method: "POST" });
            location.href = "/login";
          }}>Sair</button>
          </div>
        </div>

        {/* PARA ONDE ANDAR — vem antes do número.
            Ela lê isto no portão, de pé, antes de dar o primeiro passo. Saber
            que "são 11 jazigos" não ajuda a se posicionar; saber que é a
            "Quadra 1 — Ruas 3, 4 e 5" ajuda. */}
        {pendentesLista.length > 0 && brief?.frase && (
          <div style={s.ondeHoje}>Hoje: {brief.frase}</div>
        )}

        <div style={s.resumo}>
          {pendentesLista.length === 0
            ? "Tudo feito por hoje. Obrigada! 🌿"
            : <>São <b>{pendentesLista.length}</b> {pendentesLista.length === 1 ? "jazigo" : "jazigos"}.</>}
        </div>

        {brief?.precisamAtencao > 0 && (
          <div style={s.atencao}>
            {brief.precisamAtencao === 1
              ? "1 deles pede uma atenção especial — está marcado na lista."
              : `${brief.precisamAtencao} deles pedem atenção especial — estão marcados na lista.`}
          </div>
        )}

        {total > 0 && (
          <>
            <div style={s.barra}>
              <div style={{ ...s.barraCheia, width: `${(feitos / total) * 100}%` }} />
            </div>
            <div style={s.contagem}>{feitos} de {total} prontos</div>
          </>
        )}
      </div>

      <InstalarApp contexto="campo" />
      <Assistente onMudou={carregar} feitos={feitos} faltam={pendentesLista.length} />

      <button style={s.botaoMaterial} onClick={() => setPedirMaterial(true)}>
        🧴 Pedir material que está faltando
      </button>

      <button style={s.botaoCadastrar} onClick={() => setCapturarJazigo(true)}>
        ➕ Cadastrar jazigo (GPS e fotos)
      </button>

      {/* A CONFIRMAÇÃO FICA ATÉ A PESSOA FECHAR.
          Aviso que some sozinho não serve no cemitério: a pessoa guarda o
          celular no bolso, anda até o próximo túmulo, e quando olha de novo já
          passou. Fica com o ✕. */}
      {ultimoJazigo && (
        <div style={s.jazigoSalvo}>
          <button style={s.jazigoSalvoFechar} onClick={() => setUltimoJazigo(null)}>✕</button>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            ✓ Jazigo {ultimoJazigo.jaExistia ? "atualizado" : "cadastrado"}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 17 }}>
            {ultimoJazigo.quadra} · {ultimoJazigo.identificacao}
          </p>

          {/* O QUE FALTOU, DITO NA HORA.
              A tela do cadastro convida a concluir sem foto ("dá para completar
              depois na ficha"). Sem dizer aqui o que ficou faltando, a lacuna
              só aparece semanas depois, quando a Nina chega no túmulo e não tem
              foto para reconhecer. */}
          {(!ultimoJazigo.comGps || !ultimoJazigo.comFoto) && (
            <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.4 }}>
              Ficou sem {[!ultimoJazigo.comGps && "localização", !ultimoJazigo.comFoto && "foto"]
                .filter(Boolean).join(" nem ")}
              . Dá para completar depois na ficha do jazigo.
            </p>
          )}

          {quantosJazigos > 1 && (
            <p style={{ margin: "8px 0 0", fontSize: 15, opacity: 0.85 }}>
              {quantosJazigos} cadastrados nesta ida.
            </p>
          )}
        </div>
      )}

      {[...grupos.entries()].map(([local, itens]) => (
        <section key={local}>
          <div style={s.tituloRua}>{local}</div>
          {(itens || []).map((it) => (
            <Card
              key={it.id}
              it={it}
              ocupado={iniciando === it.id}
              onIndo={() => setIndo(it)}
              onIniciar={(foto) => iniciar(it, foto)}
              onFinalizar={(foto) => terminar(it, foto)}
              onNaoDeu={() => setNaoDeu(it)}
              onAgora={() => fazerAgora(it)}
              primeiro={it.ordem === 1}
              destacado={destaque === it.id}
            />
          ))}
        </section>
      ))}

      {feitos > 0 && (
        <div style={s.feitosBox}>
          ✓ {feitos} {feitos === 1 ? "jazigo cuidado" : "jazigos cuidados"} hoje
        </div>
      )}

      {/* As telas ConfirmarJazigo e Concluir saíram do caminho: a câmera agora
          vive dentro dos dois botões do cartão. Os arquivos continuam no
          repositório — se um dia a confirmação por QR fizer falta, é só voltar
          a chamá-los aqui. */}

      {naoDeu && (
        <NaoDeu it={naoDeu} onFechar={() => setNaoDeu(null)}
                onPronto={async () => {
                  // Sai da lista NO APARELHO, com ou sem sinal — senão, sem
                  // rede, `carregar()` traz o cache e o jazigo volta. Era o
                  // mesmo buraco da conclusão offline (CP-05).
                  const id = naoDeu.id;
                  setNaoDeu(null);
                  marcar(id, (x) => ({ ...x, status: "executado", naoFeitoLocal: true }));
                  setFila(await resumoFila());
                  carregar();
                }} />
      )}

      {pedirMaterial && <Materiais onFechar={async () => { setPedirMaterial(false); setFila(await resumoFila()); }} />}

      {capturarJazigo && (
        <CapturarJazigo
          onFechar={() => setCapturarJazigo(false)}
          onPronto={(salvo) => {
            setCapturarJazigo(false);
            setUltimoJazigo(salvo);
            setQuantosJazigos((n) => n + 1);
            carregar();
          }}
        />
      )}

      {indo && (
        <ComoChegar
          alvo={{
            tumulo: indo.falecido ? `${indo.falecido} — ${indo.tumulo}` : indo.tumulo,
            quadra: indo.quadra, rua: indo.rua, numero: indo.numero,
            lat: indo.lat, lng: indo.lng, gpsPrecisao: indo.gpsPrecisao,
            fotoEnquadramento: indo.fotoEnquadramento, fotoReferencia: indo.fotoReferencia,
          }}
          onFechar={() => setIndo(null)}
          onComecar={() => { const it = indo; setIndo(null); if (it) setDestaque(it.id); }}
        />
      )}
    </main>
  );
}

/** Card de um jazigo: local, nome, avisos e a ação do momento. */
/**
 * AS FOTOS NO PROPRIO CARD (pedido do Leandro, 01/08)
 * ---------------------------------------------------------------------------
 * Antes, a foto do jazigo so aparecia depois de abrir a confirmacao. A ajudante
 * chega no corredor e precisa saber QUAL e o jazigo antes de tocar em qualquer
 * botao. Entao a miniatura vem no card:
 *   "onde fica"  = foto de longe, com os vizinhos — e a que orienta no corredor
 *   "o jazigo"   = foto de perto, para conferir a lapide
 *   "antes"      = a foto tirada hoje ao comecar, para ela comparar no fim
 * Tocar abre em tamanho cheio.
 */
function Fotos({ it }: { it: Item }) {
  const tem: Array<{ url: string; rotulo: string }> = [];
  if (it.fotoEnquadramento) tem.push({ url: it.fotoEnquadramento, rotulo: "onde fica" });
  if (it.fotoReferencia) tem.push({ url: it.fotoReferencia, rotulo: "o jazigo" });
  if (it.fotoAntes) tem.push({ url: it.fotoAntes, rotulo: "antes (hoje)" });

  if (!tem.length) {
    return (
      <div style={s.semFoto}>
        Este jazigo ainda não tem foto. A que você tirar hoje já fica de referência.
      </div>
    );
  }

  return (
    <div style={s.tiras}>
      {tem.map((f) => (
        <a key={f.rotulo} href={f.url} target="_blank" rel="noreferrer" style={s.tira}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.rotulo} style={s.tiraFoto} />
          <span style={s.tiraRotulo}>{f.rotulo}</span>
        </a>
      ))}
    </div>
  );
}

/**
 * O CARTÃO DO TÚMULO — dois toques, e a câmera dentro de cada um.
 *
 * O fluxo antigo era: confirmar o jazigo, tirar a foto, começar, abrir a tela
 * de conclusão, tirar a foto de novo, revisar, enviar. Cada etapa uma tela.
 *
 * Agora são dois botões, e cada um abre a câmera direto:
 *      📷 TIRAR FOTO E COMEÇAR
 *      📷 TIRAR FOTO E TERMINAR
 *
 * O texto do botão diz exatamente o que acontece ao tocar. A Nina não teve
 * treinamento formal e usa isto de pé, no sol: se o botão precisa de
 * explicação, o botão está errado.
 */
function Card({ it, ocupado, onIndo, onIniciar, onFinalizar, onNaoDeu, onAgora, primeiro, destacado }: {
  it: Item; ocupado: boolean;
  onIndo: () => void;
  onIniciar: (foto: FotoPronta) => void;
  onFinalizar: (foto: FotoPronta) => void;
  onNaoDeu: () => void;
  /** Põe este como o próximo do dia. Só aparece se ele já não for o primeiro. */
  onAgora: () => void;
  primeiro: boolean;
  destacado?: boolean;
}) {
  const emAndamento = !!it.iniciadoEm;
  const [agora, setAgora] = useState(() => Date.now());
  const [preparando, setPreparando] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  const camera = useRef<HTMLInputElement | null>(null);
  const pendente = useRef<"comecar" | "terminar" | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);

  // Puxa o cartão para a tela quando ele é o alvo — de um link direto ou de
  // voltar do "Como chegar". Sem isto ela abriria a lista e teria que
  // procurar o jazigo no meio dos outros.
  useEffect(() => {
    if (destacado) caixa.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [destacado]);

  /**
   * A TRAVA COMEÇA NO PRIMEIRO TOQUE (CP-08).
   *
   * O botão só se desabilitava depois que a câmera DEVOLVIA o arquivo. Num
   * aparelho lento a câmera demora a abrir, e dois toques abriam duas vezes.
   *
   * O perigo de travar cedo é o inverso: se a pessoa cancelar e o navegador não
   * disparar `change` — acontece em alguns Android —, o botão ficaria morto
   * para sempre. Por isso a trava também se solta quando a janela volta a ter
   * foco, que é o que acontece ao sair da câmera de qualquer jeito.
   */
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => {
    if (!abrindo) return;
    // O `change` chega logo DEPOIS do foco voltar; o respiro evita soltar a
    // trava um instante antes de o arquivo aparecer.
    const soltar = () => setTimeout(() => setAbrindo(false), 800);
    window.addEventListener("focus", soltar);
    return () => window.removeEventListener("focus", soltar);
  }, [abrindo]);

  function tocar(acao: "comecar" | "terminar") {
    if (abrindo || preparando || ocupado) return;
    setErroFoto("");
    setAbrindo(true);
    pendente.current = acao;
    camera.current?.click();
  }

  async function aoFotografar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";            // deixa refotografar o mesmo arquivo
    setAbrindo(false);
    const acao = pendente.current;
    // CANCELOU A CÂMERA.
    // A ação pendente morre AQUI. Antes ela ficava guardada: quem tocasse em
    // "começar", desistisse, e depois abrisse a câmera por outro caminho podia
    // ver o app executar o "começar" antigo com a foto nova. Quem sai da câmera
    // sem foto não pediu nada.
    pendente.current = null;
    if (!arquivo || !acao) return;

    setPreparando(true);
    try {
      // Reduz ANTES de guardar: uma foto de 8 MB vira ~11 MB em base64 e o
      // envio morre no limite do servidor.
      const foto = await prepararFoto(arquivo);
      if (acao === "comecar") onIniciar(foto);
      else onFinalizar(foto);
    } catch (err) {
      setErroFoto(motivoFalha(err) || "Não consegui usar essa foto. Tente de novo.");
    } finally {
      setPreparando(false);
    }
  }

  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, [emAndamento]);

  const minutos = emAndamento && it.iniciadoEm
    ? Math.max(0, Math.round((agora - new Date(it.iniciadoEm).getTime()) / 60000))
    : 0;

  const local = [it.quadra, it.rua, it.numero ? `nº ${it.numero}` : null]
    .filter(Boolean).join(" · ");

  return (
    <div ref={caixa} style={{
      ...s.cartao,
      ...(emAndamento ? s.cartaoAtivo : {}),
      ...(destacado ? s.cartaoDestacado : {}),
    }}>
      <div style={s.local}>{local || "sem local"}</div>
      <div style={s.nome}>{it.falecido || it.tumulo}</div>
      {it.falecido && <div style={s.jazigo}>{it.tumulo}</div>}

      <Fotos it={it} />

      {(it.avisos || []).map((a, i) => (
        <div key={i} style={{ ...s.aviso, ...(a.tipo === "adiado" ? s.avisoUrgente : {}) }}>
          {a.tipo === "memoria" ? "🌷" : a.tipo === "adiado" ? "⏰" : "📷"} {a.texto}
        </div>
      ))}

      {emAndamento && (
        <div style={s.cronometro}>
          Em andamento há {minutos < 1 ? "menos de 1 minuto" : `${minutos} min`}
        </div>
      )}

      {/* ANTES de "Começar": achar o jazigo vem primeiro. O botão aparece mesmo
          sem coordenada — a tela explica o que fazer nesse caso, e sumir sem
          explicação deixaria a pessoa procurando um botão que existe nos outros
          cartões. */}
      {!emAndamento && (
        <button style={s.botaoChegar} onClick={onIndo}>
          🧭 Como chegar{it.lat != null && it.lng != null ? "" : " (sem localização gravada)"}
        </button>
      )}

      {erroFoto && <div style={s.erroFoto}>{erroFoto}</div>}

      <input ref={camera} type="file" accept="image/*" capture="environment"
             onChange={aoFotografar} style={{ display: "none" }} />

      <div style={s.acoes}>
        {emAndamento ? (
          <button style={{ ...s.botaoPrincipal, ...s.botaoTerminar }}
                  onClick={() => tocar("terminar")} disabled={ocupado || preparando || abrindo}>
            {preparando || ocupado ? "Salvando…" : abrindo ? "Abrindo a câmera…" : "📷  TIRAR FOTO E TERMINAR"}
          </button>
        ) : (
          <button style={s.botaoPrincipal}
                  onClick={() => tocar("comecar")} disabled={ocupado || preparando || abrindo}>
            {preparando || ocupado ? "Salvando…" : abrindo ? "Abrindo a câmera…" : "📷  TIRAR FOTO E COMEÇAR"}
          </button>
        )}
        {/* FAZER ESTE AGORA.
            A roteirização automática é por sequência de quadra e rua, e é boa —
            mas o dia vira. A família liga, tem visita marcada, ou quem está no
            chão vê que dá para emendar diferente. Um toque põe este como o
            próximo e desce o resto.

            Não aparece no que já é o primeiro: botão que não faz nada ensina a
            desconfiar dos que fazem. */}
        {!primeiro && !it.iniciadoEm && (
          <button style={s.botaoAgora} onClick={onAgora}>⬆ Fazer este agora</button>
        )}
        <button style={s.botaoNaoDeu} onClick={onNaoDeu}>Não deu para fazer</button>
      </div>
    </div>
  );
}

const NAVY = "#12284b";
const TEAL = "#0f766e";

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 560, margin: "0 auto", padding: 16, paddingBottom: 60,
          background: "#f7f3e9", minHeight: "100vh", fontFamily: "system-ui, sans-serif",
          fontSize: 17, color: "#0f172a" },
  centro: { padding: 40, textAlign: "center", color: "#475569", fontSize: 17,
            fontFamily: "system-ui, sans-serif" },
  faixaOffline: { background: "#fef3c7", color: "#78350f", padding: 14, borderRadius: 12,
                  marginBottom: 14, fontSize: 16, lineHeight: 1.5 },
  faixaConfirmado: { background: "#ecfdf5", color: "#065f46", padding: 14, borderRadius: 12,
                     marginBottom: 14, fontSize: 16, lineHeight: 1.5, fontWeight: 600 },
  faixaAjuda: { background: "#fef2f2", color: "#991b1b", border: "2px solid #fecaca",
                padding: 14, borderRadius: 12, marginBottom: 14, fontSize: 16, lineHeight: 1.5 },
  botaoDescartar: { display: "block", marginTop: 6, minHeight: 44, padding: "8px 14px",
                    background: "#fff", color: "#991b1b", border: "1px solid #fecaca",
                    borderRadius: 10, fontSize: 15, cursor: "pointer" },
  topo: { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14 },
  saudacao: { fontSize: 22, fontWeight: 700, color: NAVY },
  sair: { minHeight: 44, background: "none", border: "2px solid #e7e0cf", color: "#475569",
          borderRadius: 10, padding: "8px 14px", fontSize: 15, cursor: "pointer" },
  resumo: { fontSize: 18, color: "#334155", marginTop: 8 },
  atencao: { fontSize: 16, color: "#92400e", background: "#fffbeb", padding: "10px 12px",
             borderRadius: 10, marginTop: 12, lineHeight: 1.4 },
  barra: { height: 8, background: "#e2e8f0", borderRadius: 4, marginTop: 14, overflow: "hidden" },
  barraCheia: { height: "100%", background: TEAL, transition: "width .3s" },
  contagem: { fontSize: 15, color: "#475569", marginTop: 6 },
  botaoMaterial: { width: "100%", minHeight: 60, padding: 18, background: "#fff", color: NAVY,
                   border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 17, fontWeight: 600,
                   cursor: "pointer", marginBottom: 12 },
  jazigoSalvo: {
    position: "relative", margin: "12px 0", padding: "16px 44px 16px 16px",
    borderRadius: 14, background: "#ecfdf5", border: "2px solid #059669",
    color: "#064e3b",
  },
  jazigoSalvoFechar: {
    position: "absolute", top: 8, right: 8, width: 36, height: 36,
    border: "none", background: "transparent", color: "#064e3b",
    fontSize: 20, lineHeight: 1, cursor: "pointer",
  },
  botaoCadastrar: { width: "100%", minHeight: 60, padding: 18, background: "#0f766e", color: "#fff",
                    border: "none", borderRadius: 14, fontSize: 17, fontWeight: 700,
                    cursor: "pointer", marginBottom: 16 },
  tituloRua: { fontSize: 14, fontWeight: 700, color: "#c6a15b", textTransform: "uppercase",
               letterSpacing: 1, margin: "20px 0 10px" },
  cartao: { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14,
            border: "1px solid #e7e0cf" },
  cartaoAtivo: { border: `2px solid ${TEAL}`, background: "#f0fdfa" },
  local: { fontSize: 14, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  nome: { fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 3 },
  jazigo: { fontSize: 16, color: "#475569" },
  tiras: { display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 },
  tira: { flex: "0 0 auto", width: 104, textDecoration: "none", color: "#475569" },
  tiraFoto: { width: 104, height: 78, objectFit: "cover", borderRadius: 10,
              border: "1px solid #e7e0cf", display: "block", background: "#f1f5f9" },
  tiraRotulo: { display: "block", fontSize: 13, marginTop: 4, textAlign: "center" },
  semFoto: { fontSize: 15, color: "#78350f", background: "#fffbeb", padding: "10px 12px",
             borderRadius: 10, marginTop: 12, lineHeight: 1.4 },
  aviso: { fontSize: 16, color: "#92400e", background: "#fffbeb", padding: "10px 12px",
           borderRadius: 10, marginTop: 10, lineHeight: 1.4 },
  avisoUrgente: { color: "#991b1b", background: "#fef2f2" },
  cronometro: { fontSize: 16, color: TEAL, fontWeight: 600, marginTop: 12 },
  botaoChegar: { width: "100%", minHeight: 56, marginTop: 14, background: "#fff", color: NAVY,
                 border: `2px solid ${TEAL}`, borderRadius: 14, fontSize: 17, fontWeight: 700,
                 cursor: "pointer", padding: "14px 16px" },
  acoes: { display: "flex", gap: 12, marginTop: 16 },
  botaoPrincipal: { flex: 1, minHeight: 64, padding: "18px 20px", background: TEAL, color: "#fff",
                    border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer" },
  ondeHoje: { fontSize: 21, fontWeight: 800, color: "#fff", margin: "10px 0 4px",
              lineHeight: 1.3 },
  erroFoto: { background: "#FDECEC", border: "1px solid #E9B4B4", borderRadius: 12,
              padding: "12px 14px", margin: "12px 0 0", fontSize: 16, color: "#8B2020" },
  botaoTerminar: { background: "#1565C0" },
  cartaoDestacado: { outline: "3px solid #1565C0", outlineOffset: 2 },
  botaoAgora: {
    width: "100%", minHeight: 52, marginTop: 10, padding: 14,
    background: "#fff", color: "#12284b", border: "2px solid #12284b",
    borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: "pointer",
  },
  botaoNaoDeu: { minHeight: 64, padding: "18px 22px", background: "#fff", color: "#475569",
                 border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 16, cursor: "pointer" },
  feitosBox: { background: "#f0fdf4", color: "#166534", padding: 18, borderRadius: 14,
               textAlign: "center", fontSize: 17, fontWeight: 600, marginTop: 20 },
};
