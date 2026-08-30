"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../../ui";
import QuemDescansa from "../QuemDescansa";

/**
 * A BANCADA DAS LÁPIDES.
 *
 * O QUE SE MEDIU EM 28/08
 *
 *   266 jazigos · 62 com alguém cadastrado · 0 com mais de uma pessoa
 *   62 de 62 sem nenhuma data · 266 de 266 com foto da lápide
 *
 * E os 62 nomes vieram do campo de texto antigo `tumulos.falecido_nome`, que
 * era UM campo: Nakandakari, Ogasawara, Mantovanelli, "Família grave", "Filha
 * do Sr joão". Não é quem está enterrado — é o que está escrito na lápide.
 *
 * Então o sistema não tem 62 falecidos. Tem 62 etiquetas e 204 jazigos vazios.
 *
 * POR QUE UMA TELA SÓ PARA ISTO, SE O CADASTRO DO JAZIGO JÁ FAZ
 *
 * Porque é o mesmo trabalho 204 vezes. Pela ficha, cada jazigo é: achar na
 * lista, abrir, rolar até o cartão, digitar, voltar. É a mesma forma do "abra
 * a ficha e escolha uma das duas" que travava 290 famílias na conferência.
 *
 * Aqui a foto fica grande de um lado, o formulário do outro, e **Próximo**
 * troca o jazigo sem sair da tela. O componente é o MESMO da ficha
 * (`QuemDescansa`) — montado duas vezes, não copiado.
 *
 * A FILA NÃO ESCONDE O QUE NÃO TEM FOTO. Jazigo sem lápide fotografada vai
 * para o fim, não para fora: dá para preencher pelo que a família contou, e
 * sumir com ele esconderia trabalho que existe.
 */
export default function Lapides() {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [i, setI] = useState(0);

  /**
   * O CEMITERIO ESTREITA A BANCADA (0150).
   *
   * A transcricao e trabalho de uma pessoa sentada com as fotos de UM
   * cemiterio. Sem o filtro, a fila do Santa Lidia vem misturada com os 266 do
   * Saudade — e o contador ("204 para transcrever") passa a falar de um
   * trabalho que nao e o que esta na frente dela.
   */
  const [cem, setCem] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    const r = await fetch(`/api/falecidos?fila=1${cem ? `&cemiterio=${encodeURIComponent(cem)}` : ""}`)
      .then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar a fila"); return; }
    setD(r);
    // Trocar de cemitério recomeça a fila do começo: o índice atual apontava
    // para um jazigo que já não está na lista.
    setI(0);
  }, [cem]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/jazigos" />
        <div style={painel.conteudo}>
          <p style={{ color: cor.perigo }}>Não deu para carregar: {erro}</p>
          <button style={painel.botao} onClick={carregar}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!d) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/jazigos" />
        <div style={painel.conteudo}><p style={{ color: cor.cinza }}>Lendo a fila…</p></div>
      </div>
    );
  }

  const fila: any[] = d.fila || [];
  const r = d.resumo || {};
  const atual = fila[Math.min(i, Math.max(fila.length - 1, 0))];

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/jazigos" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Bancada das lápides</h1>

        {/* O CEMITERIO PRIMEIRO — a transcricao e trabalho de uma pessoa
            sentada com as fotos de UM cemiterio. So aparece com mais de um:
            um seletor de uma opcao so e ruido. */}
        {(d.cemiterios || []).length > 1 && (
          <div style={{ ...painel.card, paddingTop: 12, paddingBottom: 12 }}>
            <label style={painel.rotulo}>De qual cemitério</label>
            <select style={{ ...painel.input, margin: 0, maxWidth: 320 }}
                    value={cem} onChange={(e) => setCem(e.target.value)}>
              <option value="">todos os cemitérios</option>
              {(d.cemiterios || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {String(c.nome).split("—")[0].split(" - ")[0].trim()}
                </option>
              ))}
            </select>
          </div>
        )}

        <section style={painel.card}>
          <p style={{ color: cor.cinza, fontSize: 15, margin: 0, lineHeight: 1.55 }}>
            Os nomes e as datas estão gravados na pedra, e a pedra já está fotografada.
            Aqui se copia de um lado para o outro, sem abrir jazigo por jazigo.
            O que for digitado aqui aparece igual na ficha do jazigo — é o mesmo cadastro.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
            {[
              [r.semNinguem, "sem ninguém cadastrado"],
              [r.semData, "com nome e sem data"],
              [r.prontos, "já com data"],
            ].map(([n, rot]: any, k) => (
              <div key={k}>
                <div style={{ fontSize: 24, fontWeight: 800, color: cor.navy }}>{n}</div>
                <div style={{ fontSize: 12.5, color: cor.cinza }}>{rot}</div>
              </div>
            ))}
          </div>
          {/* O QUE NÃO DÁ PARA FAZER AQUI, dito onde se trabalha. */}
          {r.semFoto > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: cor.cinza, lineHeight: 1.45 }}>
              {r.semFoto} deles não têm foto da lápide. Ficam no fim da fila — dá para
              preencher pelo que a família contar, e a foto entra na próxima lavagem.
            </p>
          )}
        </section>

        {!fila.length ? (
          <section style={painel.card}>
            <p style={{ color: cor.teal, fontSize: 16, margin: 0 }}>
              Todo jazigo já tem alguém com data. 🌿
            </p>
          </section>
        ) : (
          <>
            <section style={{ ...painel.card, display: "flex", flexWrap: "wrap",
                              gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ color: cor.navy, fontSize: 17 }}>
                  {atual.codigo || atual.identificacao || "jazigo sem código"}
                </strong>
                <p style={{ margin: "3px 0 0", fontSize: 14, color: cor.cinza }}>
                  {[atual.quadra && `quadra ${atual.quadra}`, atual.rua, atual.familia]
                    .filter(Boolean).join(" · ") || "sem quadra, rua ou família"}
                </p>
              </div>
              <span style={{ fontSize: 13.5, color: cor.cinza }}>
                {Math.min(i + 1, fila.length)} de {fila.length}
              </span>
              <button style={painel.botaoSec} disabled={i === 0}
                      onClick={() => setI((x) => Math.max(0, x - 1))}>
                Anterior
              </button>
              <button style={painel.botao} disabled={i >= fila.length - 1}
                      onClick={() => setI((x) => Math.min(fila.length - 1, x + 1))}>
                Próximo
              </button>
              <Link href={`/painel/jazigos/${atual.id}`} style={{ fontSize: 13.5, color: cor.navy }}>
                abrir a ficha
              </Link>
            </section>

            {/* O MESMO COMPONENTE DA FICHA. `key` força recomeçar do zero ao
                trocar de jazigo: sem ela, o formulário meio preenchido do
                anterior apareceria em cima da lápide do seguinte — e num
                trabalho de copiar nomes isso é o erro mais caro que existe. */}
            <QuemDescansa key={atual.id}
                          tumuloId={atual.id}
                          fotoLapide={atual.fotoLapide}
                          aoMudar={carregar} />
          </>
        )}
      </div>
    </div>
  );
}
