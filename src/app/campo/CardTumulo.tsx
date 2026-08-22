"use client";

import { useRef, useState } from "react";
import { prepararFoto, motivoFalha, type FotoPronta } from "@/lib/foto";

/**
 * O CARD DO TÚMULO — dois toques, nada mais.
 *
 * O QUE MUDOU
 * Antes eram cinco passos: confirmar o jazigo, tirar a foto do antes,
 * começar, tirar a foto do depois, concluir. Cada passo era uma tela.
 *
 * Agora são DOIS BOTÕES, cada um com a foto embutida:
 *      📷 TIRAR FOTO E COMEÇAR
 *      📷 TIRAR FOTO E TERMINAR
 *
 * Um toque abre a câmera direto. Ela fotografa, confirma na própria câmera,
 * e o app já registrou. Sem tela intermediária, sem botão "salvar".
 *
 * PARA QUEM ISTO É ESCRITO
 * A Nina não teve treinamento formal. Então o texto do botão diz exatamente
 * o que vai acontecer quando ela tocar — verbo no infinitivo, palavra do dia
 * a dia. Nada de ícone sozinho, nada de "iniciar atendimento" ou "finalizar
 * OS". Se o botão precisa de explicação, o botão está errado.
 *
 * A FOTO VEM PRIMEIRO no card porque é assim que ela reconhece o túmulo —
 * não pelo nome da família, não pelo código. Ela olha a foto, acha a pedra,
 * confere o selo e toca.
 */

export interface TumuloCampo {
  servicoId: string;
  tumuloId: string;
  codigo: string | null;
  quadra: string;
  rua: string;
  familia: string | null;
  falecido: string | null;
  fotoReferencia: string | null;
  iniciadoEm: string | null;
  aviso: string | null;
}

interface Props {
  item: TumuloCampo;
  onComecou: (foto: FotoPronta) => Promise<void>;
  onTerminou: (foto: FotoPronta) => Promise<void>;
  onNaoDeu: () => void;
}

export default function CardTumulo({ item, onComecou, onTerminou, onNaoDeu }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const camera = useRef<HTMLInputElement | null>(null);
  const acaoPendente = useRef<"comecar" | "terminar" | null>(null);

  const comecado = !!item.iniciadoEm;

  /** Abre a câmera do celular. `capture` faz o Android/iOS pular a galeria. */
  function tocar(acao: "comecar" | "terminar") {
    setErro("");
    acaoPendente.current = acao;
    camera.current?.click();
  }

  async function aoFotografar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";                       // permite refotografar o mesmo arquivo
    if (!arquivo || !acaoPendente.current) return;

    setOcupado(true);
    setErro("");
    try {
      // Reduz ANTES de guardar: uma foto de 8 MB vira ~11 MB em base64 e o
      // envio morre no limite do servidor.
      const foto = await prepararFoto(arquivo);
      if (acaoPendente.current === "comecar") await onComecou(foto);
      else await onTerminou(foto);
    } catch (err) {
      // Mensagem que a Nina entende e consegue agir: nada de código de erro.
      setErro(motivoFalha(err) || "Não consegui salvar a foto. Tente de novo.");
    } finally {
      setOcupado(false);
      acaoPendente.current = null;
    }
  }

  return (
    <div style={s.card}>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={aoFotografar}
        style={{ display: "none" }}
      />

      {/* A FOTO PRIMEIRO — é como ela reconhece o túmulo */}
      {item.fotoReferencia ? (
        <img src={item.fotoReferencia} alt="" style={s.foto} />
      ) : (
        <div style={s.semFoto}>
          <span style={{ fontSize: 40 }}>📷</span>
          <p style={s.semFotoTxt}>Este jazigo ainda não tem foto.<br />Confira pelo endereço.</p>
        </div>
      )}

      <div style={s.corpo}>
        <p style={s.endereco}>{item.quadra} · {item.rua}</p>
        {item.familia && <p style={s.familia}>{item.familia}</p>}
        {item.falecido && <p style={s.falecido}>{item.falecido}</p>}

        {item.aviso && <div style={s.aviso}>{item.aviso}</div>}
        {erro && <div style={s.erro}>{erro}</div>}

        {/* Um botão por vez. Nunca os dois: não existe escolha a fazer. */}
        {!comecado ? (
          <button style={{ ...s.botao, ...s.verde }} disabled={ocupado} onClick={() => tocar("comecar")}>
            {ocupado ? "Salvando..." : "📷  TIRAR FOTO E COMEÇAR"}
          </button>
        ) : (
          <button style={{ ...s.botao, ...s.azul }} disabled={ocupado} onClick={() => tocar("terminar")}>
            {ocupado ? "Salvando..." : "📷  TIRAR FOTO E TERMINAR"}
          </button>
        )}

        <button style={s.naoDeu} disabled={ocupado} onClick={onNaoDeu}>
          Não deu para fazer
        </button>

        {/* Código pequeno e discreto: serve para a Sureya conferir, não para
            a Nina procurar. Ela nunca digita isso. */}
        {item.codigo && <p style={s.codigo}>{item.codigo}</p>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "#fff", borderRadius: 18, overflow: "hidden",
          boxShadow: "0 2px 14px rgba(0,0,0,.10)", marginBottom: 20 },
  foto: { width: "100%", height: 230, objectFit: "cover", display: "block" },
  semFoto: { width: "100%", height: 160, background: "#F1F3F6", display: "flex",
             flexDirection: "column", alignItems: "center", justifyContent: "center" },
  semFotoTxt: { color: "#667", fontSize: 15, textAlign: "center", margin: "8px 0 0" },
  corpo: { padding: 18 },
  endereco: { fontSize: 21, fontWeight: 700, color: "#0E2B4B", margin: 0 },
  familia: { fontSize: 17, color: "#334", margin: "6px 0 0" },
  falecido: { fontSize: 15, color: "#778", margin: "2px 0 0" },
  aviso: { background: "#FFF6DC", border: "1px solid #E8D49A", borderRadius: 12,
           padding: "12px 14px", margin: "14px 0 0", fontSize: 15, color: "#6B5314" },
  erro: { background: "#FDECEC", border: "1px solid #E9B4B4", borderRadius: 12,
          padding: "12px 14px", margin: "14px 0 0", fontSize: 15, color: "#8B2020" },

  // Botões grandes: ela usa de pé, no sol, às vezes de luva.
  botao: { width: "100%", marginTop: 18, padding: "22px 16px", border: "none",
           borderRadius: 14, fontSize: 19, fontWeight: 700, color: "#fff",
           letterSpacing: .3, cursor: "pointer" },
  verde: { background: "#2E7D32" },
  azul: { background: "#1565C0" },
  naoDeu: { width: "100%", marginTop: 10, padding: "14px 16px", borderRadius: 12,
            border: "1px solid #CFD6DE", background: "#fff", color: "#556",
            fontSize: 16, cursor: "pointer" },
  codigo: { textAlign: "center", color: "#AAB2BC", fontSize: 12, margin: "14px 0 0",
            letterSpacing: 1 },
};
