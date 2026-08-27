"use client";

import { useState } from "react";
import { useBusca, horaCurta } from "@/lib/buscar";
import { Falhou, Desde } from "../pecas";
import { useConfirmar, useRecado } from "@/components/Dialogos";
import { painel, cor } from "../ui";

/**
 * O AVISO DE PRIVACIDADE, EM VERSÕES (0138).
 *
 * O QUE HAVIA, E O QUE SE MEDIU
 *
 * Um campo de texto livre, único e sem versão — com **zero caracteres**. Nunca
 * houve texto. E 62 contatos marcados como tendo autorizado o contato, 59 deles
 * vindos de uma importação de planilha em 18/07.
 *
 * O sistema afirmava que 62 pessoas concordaram, e não havia com o quê.
 *
 * O NÚMERO DE "VERSÃO DESCONHECIDA" FICA NA TELA, E NÃO SOME.
 *
 * Ele não tem conserto — não dá para voltar a julho e descobrir o que foi dito
 * a elas. Some sozinho, uma a uma, à medida que cada família reconfirmar sobre
 * um texto que existe. Esconder o número enquanto isso seria fingir que a
 * pergunta foi respondida.
 *
 * PUBLICADA, UMA VERSÃO NÃO SE EDITA. Mudar o texto cria a próxima. É isso que
 * faz dela uma versão: sem a trava, bastaria reescrever a versão 1 para que
 * todo mundo passasse a ter aceitado outra coisa, sem nunca a ter visto.
 */
export default function Termo() {
  const perguntar = useConfirmar();
  const recado = useRecado();
  const { fase, dados, erro, atualizadoEm, recarregar } = useBusca<any>("/api/config/termo");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [vendo, setVendo] = useState<string | null>(null);

  async function publicar() {
    if (!texto.trim()) { recado.erro("Escreva o aviso antes de publicar."); return; }
    if (!titulo.trim()) { recado.erro("Dê um título ao aviso."); return; }

    const proxima = (dados?.versoes || []).length
      ? Math.max(...(dados.versoes || []).map((v: any) => Number(v.versao) || 0)) + 1
      : 1;

    const ok = await perguntar({
      oQue: `Publicar a versão ${proxima}?`,
      efeito:
        "Depois de publicada esta versão não muda mais — para corrigir o texto você publica " +
        "a próxima. Quem autorizar a partir de agora fica registrado como tendo aceitado esta.",
      confirmar: "Publicar",
    });
    if (!ok) return;

    setOcupado(true);
    const r = await fetch("/api/config/termo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: titulo.trim(), texto: texto.trim(), publicar: true }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);

    if (!r?.ok) { recado.erro(r?.mensagem || r?.erro || "Não consegui publicar."); return; }
    recado.ok(`Versão ${r.termo?.versao} publicada.`);
    setEscrevendo(false); setTitulo(""); setTexto("");
    recarregar();
  }

  if (fase === "carregando" && !dados) {
    return <p style={{ color: cor.cinza }}>Lendo o aviso…</p>;
  }
  if (fase === "erro" && !dados) {
    return <Falhou mensagem={erro || "Não consegui ler o aviso."} aoTentar={recarregar} />;
  }
  if (!dados) return null;

  const versoes: any[] = dados.versoes || [];
  const vigente = dados.vigente;
  const porVersao: any[] | null = dados.porVersao;
  const desconhecida = (porVersao || []).find((x: any) => x.desconhecida);

  return (
    <div>
      {/* SEM AVISO PUBLICADO, NADA PODE SER AUTORIZADO. É o que impede a lista
          de 62 de continuar crescendo — e por isso o recado vem primeiro. */}
      {dados.vigente === null ? (
        <p style={{ ...painel.card, color: cor.aviso, fontSize: 15 }}>
          Não consegui ler qual versão está valendo. Não publique nada antes de a tela voltar
          a responder — publicaria por cima sem saber o que já existe.
        </p>
      ) : !vigente ? (
        <section style={{ ...painel.card, borderLeft: `4px solid ${cor.perigo}` }}>
          <strong style={{ color: cor.perigo, fontSize: 16 }}>
            Nenhum aviso publicado
          </strong>
          <p style={{ color: cor.cinza, fontSize: 14.5, margin: "6px 0 0", lineHeight: 1.55 }}>
            Enquanto não houver um texto publicado, o sistema <b>recusa</b> registrar novas
            autorizações — na ficha da família e no cadastro. É de propósito: registrar que
            alguém concordou com um texto que não existe é o que produziu as{" "}
            {desconhecida ? desconhecida.quantos : 62} de versão desconhecida abaixo.
          </p>
        </section>
      ) : (
        <section style={painel.card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
            <strong style={{ color: cor.navy, fontSize: 17, flex: 1, minWidth: 200 }}>
              {vigente.titulo}
            </strong>
            <span style={{ color: cor.teal, fontSize: 14, fontWeight: 700 }}>
              versão {vigente.versao} · valendo
            </span>
          </div>
          <p style={{ color: cor.cinza, fontSize: 13.5, margin: "4px 0 0" }}>
            publicada em {new Date(vigente.publicado_em).toLocaleDateString("pt-BR")}
          </p>
          <pre style={{
            margin: "10px 0 0", padding: 12, background: cor.bg, borderRadius: 8,
            whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14.5,
            color: "rgb(var(--zm-ink))", lineHeight: 1.55,
          }}>{vigente.texto}</pre>
        </section>
      )}

      {fase === "erro" && (
        <Falhou mensagem={erro || "Não consegui atualizar."} aoTentar={recarregar}
                parcial desde={horaCurta(atualizadoEm)} />
      )}

      {/* ---------------------------------------------------------------- */}
      {!escrevendo ? (
        <div style={{ ...painel.card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <p style={{ color: cor.cinza, fontSize: 14.5, margin: 0, flex: 1, minWidth: 220, lineHeight: 1.5 }}>
            {vigente
              ? "Corrigir o texto não muda esta versão — cria a próxima, e quem já aceitou continua tendo aceitado a que leu."
              : "Escreva o que a família está autorizando: que dados vocês guardam, para quê, e que ela pode pedir a remoção."}
          </p>
          <button style={painel.botao} onClick={() => {
            setTitulo(vigente?.titulo || "Aviso de privacidade");
            setTexto(vigente?.texto || "");
            setEscrevendo(true);
          }}>
            {vigente ? "Publicar nova versão" : "Escrever o aviso"}
          </button>
        </div>
      ) : (
        <section style={painel.card}>
          <label style={painel.rotulo}>Título</label>
          <input style={painel.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} />

          <label style={{ ...painel.rotulo, marginTop: 12 }}>
            O texto que a família está aceitando
          </label>
          <textarea
            style={{ ...painel.input, minHeight: 200, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"Ex.: Guardamos seu nome, telefone e o histórico das limpezas do jazigo da sua família, para combinar os serviços e mandar as fotos pelo WhatsApp. Não passamos esses dados para ninguém. Você pode pedir a remoção a qualquer momento, e nós atendemos."}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={painel.botao} disabled={ocupado} onClick={publicar}>
              {ocupado ? "Publicando…" : "Publicar"}
            </button>
            <button style={painel.botaoSec} disabled={ocupado} onClick={() => setEscrevendo(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------- quem aceitou o quê */}
      <section style={painel.card}>
        <strong style={{ color: cor.navy, fontSize: 16 }}>Quem autorizou, e a quê</strong>

        {porVersao === null ? (
          // NÃO SOUBE ≠ NINGUÉM. Contagem que falhou não pode virar "ninguém
          // autorizou" numa tela sobre consentimento.
          <p style={{ color: cor.aviso, fontSize: 14.5, margin: "8px 0 0" }}>
            Não consegui contar. O que está escrito acima continua valendo; o que falta é a conta.
          </p>
        ) : !porVersao.length ? (
          <p style={{ color: cor.cinza, fontSize: 14.5, margin: "8px 0 0" }}>
            Ninguém autorizou o contato ainda.
          </p>
        ) : (
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
            {porVersao.map((x: any) => (
              <li key={String(x.versao)} style={{
                display: "flex", gap: 12, alignItems: "baseline",
                padding: "8px 0", borderTop: `1px solid ${cor.linha}`,
              }}>
                <span style={{
                  fontSize: 20, fontWeight: 800, minWidth: 48,
                  color: x.desconhecida ? cor.aviso : cor.navy,
                }}>{x.quantos}</span>
                <span style={{ fontSize: 14.5, color: cor.cinza, lineHeight: 1.5 }}>
                  {x.desconhecida ? (
                    <>
                      <b style={{ color: cor.aviso }}>versão desconhecida</b> — autorizaram antes
                      de existir um texto. Não há como saber o que lhes foi apresentado, e isto{" "}
                      <b>não tem conserto retroativo</b>: só some quando cada uma reconfirmar
                      sobre um aviso publicado.
                    </>
                  ) : (
                    <>versão {x.versao} · {x.titulo}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- as versões */}
      {versoes.length > 0 && (
        <section style={painel.card}>
          <strong style={{ color: cor.navy, fontSize: 16 }}>As versões</strong>
          {versoes.map((v: any) => (
            <div key={v.id} style={{ padding: "10px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <b style={{ color: cor.navy, fontSize: 15 }}>Versão {v.versao}</b>
                <span style={{ fontSize: 14, color: cor.cinza, flex: 1, minWidth: 140 }}>{v.titulo}</span>
                <span style={{ fontSize: 13, color: v.publicado_em ? cor.teal : cor.aviso }}>
                  {v.publicado_em
                    ? `publicada em ${new Date(v.publicado_em).toLocaleDateString("pt-BR")}`
                    : "rascunho"}
                </span>
                <button style={painel.botaoMiniSec}
                        onClick={() => setVendo(vendo === v.id ? null : v.id)}>
                  {vendo === v.id ? "Fechar" : "Ler"}
                </button>
              </div>
              {vendo === v.id && (
                <pre style={{
                  margin: "10px 0 0", padding: 12, background: cor.bg, borderRadius: 8,
                  whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14,
                  color: "rgb(var(--zm-ink))", lineHeight: 1.55,
                }}>{v.texto}</pre>
              )}
            </div>
          ))}
        </section>
      )}

      <Desde hora={horaCurta(atualizadoEm)} />
    </div>
  );
}
