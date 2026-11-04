"use client";
import { useEffect, useState } from "react";
import { painel, cor } from "../../ui";

/**
 * OS MODELOS PRONTOS — O QUE SE REPETE NÃO PRECISA DE IA.
 *
 * MEDIDO EM 03/09: dos 196 rascunhos que a IA escreveu, 4 foram aprovados como
 * estavam e 155 foram descartados. E a mensagem da foto da lavagem a Sureya já
 * escrevia À MÃO, cinco vezes quase idêntica, mudando só o nome.
 *
 * Cada tema traz VÁRIAS versões e não uma. Uma frase única repetida em sessenta
 * famílias deixa de soar como uma pessoa e passa a soar como um sistema — que
 * é exatamente o que a casa não quer parecer.
 *
 * Tocar joga o texto NA CAIXA. Não envia. Daí em diante é texto seu, e o que
 * sai é o que está escrito lá — a mesma regra da caixa única.
 */
export default function Modelos({
  conversaId, aoEscolher, temTexto,
}: {
  conversaId: string;
  aoEscolher: (texto: string) => void;
  temTexto: boolean;
}) {
  const [d, setD] = useState<any>(null);
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/conversas/${conversaId}/modelos`)
      .then((x) => x.json())
      .then((j) => { if (vivo) setD(j?.ok ? j : null); })
      // Os modelos são conforto, não o trabalho: se não carregarem, o botão
      // some e a conversa continua inteira.
      .catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [conversaId]);

  if (!d) return null;

  const temas: any[] = d.temas || [];
  if (!temas.length) return null;

  const escolhido = temas.find((t) => t.chave === tema) || null;

  return (
    <div style={{ marginBottom: 8 }}>
      <button style={painel.botaoMiniSec} onClick={() => { setAberto(!aberto); setTema(null); }}>
        {aberto ? "esconder as prontas" : "✉️ Mensagens prontas"}
      </button>

      {aberto && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10,
                      border: `1px solid ${cor.linha}`, background: cor.card }}>
          {!escolhido ? (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {temas.map((t) => (
                  <button key={t.chave} style={painel.botaoMiniSec}
                          onClick={() => setTema(t.chave)} title={t.quando}>
                    {t.tema}
                  </button>
                ))}
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.5 }}>
                Estas não passam pela IA e não custam nada. Tocar joga o texto na
                caixa abaixo — o envio continua sendo seu.
              </p>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
                <strong style={{ fontSize: 15, color: cor.navy }}>{escolhido.tema}</strong>
                <span style={{ fontSize: 13, color: cor.cinza }}>· {escolhido.quando}</span>
                <button style={{ ...painel.botaoMiniSec, marginLeft: "auto" }}
                        onClick={() => setTema(null)}>voltar</button>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {(escolhido.versoes || []).map((v: string, i: number) => (
                  <button key={i}
                          style={{ ...painel.botaoMiniSec, textAlign: "left",
                                   whiteSpace: "pre-wrap", lineHeight: 1.5, padding: "10px 12px" }}
                          onClick={() => {
                            // SUBSTITUIR O QUE ALGUÉM ESCREVEU EXIGE AVISO. A
                            // frase que ela digitou é dela.
                            if (temTexto && !window.confirm(
                              "Substituir o que você já escreveu por esta mensagem?")) return;
                            aoEscolher(v);
                            setAberto(false);
                            setTema(null);
                          }}>
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
