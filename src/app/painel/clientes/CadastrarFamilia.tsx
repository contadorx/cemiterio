"use client";

import { useEffect, useState } from "react";
import { Cartao, Campo, Entrada, Selecao, Botao, Selo } from "../pecas";
import { useRecado } from "@/components/Dialogos";
import { ATALHOS_FREQUENCIA } from "@/lib/frequencia";
import { numeroBR } from "../ui";
import { reais } from "@/lib/vocabulario";

/**
 * CADASTRAR UMA FAMÍLIA É UMA TAREFA SÓ (CA-05).
 *
 * O QUE ESTAVA ERRADO
 *
 * Uma tela só, longa, com nome, tratamento, telefone, jazigo novo ou existente,
 * quadra, rua, falecido, frequência, valor, primeira lavagem e consentimento —
 * e, na mesma área, uma aba de importar planilha. A Sureya usa isto no
 * telefone, com a família do outro lado esperando.
 *
 * Dois problemas, e o segundo é o grave:
 *   1. um erro no fim obriga a reler a tela inteira para achar onde foi;
 *   2. quando dá certo PELA METADE, ela não sabe o que existe. A rota cria a
 *      família, depois o jazigo, depois o plano — cada um pode falhar sozinho,
 *      e a resposta vinha `ok: true` com um aviso.
 *
 * QUATRO PASSOS CURTOS, COM CONFERÊNCIA ANTES DE GRAVAR
 *
 *   1. Família     quem é, e por onde falar
 *   2. Jazigo      onde fica (ou qual dos capturados no campo)
 *   3. Contrato    com que frequência, por quanto, a partir de quando
 *   4. Conferir    tudo junto, na tela, antes de existir
 *
 * O passo 4 é o que resolve o problema 1: o erro aparece antes de gravar, e não
 * depois. Cada passo valida o que é dele antes de deixar avançar — errar o
 * valor no passo 3 não faz voltar ao nome.
 *
 * POR QUE NÃO VIROU TRANSAÇÃO ÚNICA
 *
 * A auditoria pedia isso também. Medi antes de escrever a migração: existem 122
 * famílias sem jazigo nenhum na produção, e o Leandro já explicou o que são —
 * "ele não tem contrato pq eu ainda não cadastrei". É cadastro pela metade DE
 * PROPÓSITO, não sobra de gravação que falhou no meio.
 *
 * Ou seja: não achei prova de que o sucesso parcial esteja sujando os dados, e
 * migração que mexe em criação de família por causa de um risco não medido é
 * risco trocado por risco. O que este build faz é o que a medição sustenta:
 * validar antes de gravar (o que evita quase toda falha parcial) e, quando ela
 * mesmo assim acontecer, DIZER com todas as letras o que existe e o que não,
 * com o caminho para terminar.
 */

const PASSOS = ["Família", "Jazigo", "Contrato", "Conferir"] as const;

export default function CadastrarFamilia({ onPronto, onCancelar }: {
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const recado = useRecado();
  const [passo, setPasso] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [parcial, setParcial] = useState<{ nome: string; jazigo: string | null; plano: string | null } | null>(null);

  const [f, setF] = useState({
    nome: "", telefone: "", tratamento: "a senhora", consentimento: false,
    jazigoModo: "novo" as "novo" | "vincular",
    vincularTumuloId: "",
    identificacao: "", quadraCodigo: "", rua: "", falecidoNome: "",
    atalho: 2,
    valorMensal: "", inicio: "",
  });
  const [quadras, setQuadras] = useState<string[]>([]);
  const [semDono, setSemDono] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json()).then((r) => {
      if (!r?.ok) return;
      const codigos = (r.cemiterios || []).flatMap((c: any) => (c.quadras || []).map((q: any) => q.codigo));
      setQuadras([...new Set<string>(codigos)]);
      setSemDono(r.semDono || []);
    }).catch(() => {});
  }, []);

  const at = ATALHOS_FREQUENCIA[f.atalho];
  const temJazigo = f.jazigoModo === "vincular" ? !!f.vincularTumuloId : !!f.identificacao.trim();
  const mensal = numeroBR(f.valorMensal);
  const criaPlano = temJazigo && at.cadencia !== "avulso";

  /**
   * CADA PASSO GUARDA O SEU. Errar o valor no passo 3 não pode fazer voltar ao
   * nome — era exatamente o que a tela longa obrigava.
   */
  function podeAvancar(p: number): string {
    if (p === 0) {
      if (!f.nome.trim()) return "Escreva o nome da família.";
      if (!f.telefone.trim()) return "Escreva o WhatsApp — é por onde a família recebe.";
    }
    if (p === 1) {
      if (f.jazigoModo === "vincular" && !f.vincularTumuloId) {
        return "Escolha o jazigo capturado no campo, ou troque para “novo jazigo”.";
      }
    }
    if (p === 2 && criaPlano && (!isFinite(mensal) || mensal <= 0)) {
      return "Escreva o valor de UMA limpeza, como 40 ou 40,50 — sem R$ e sem ponto de milhar.";
    }
    return "";
  }

  function avancar() {
    const e = podeAvancar(passo);
    if (e) { setErro(e); return; }
    setErro("");
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  }

  async function gravar() {
    setOcupado(true);
    setErro("");
    const r = await fetch("/api/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: f.nome, telefone: f.telefone, tratamento: f.tratamento, consentimento: f.consentimento,
        jazigo: f.jazigoModo === "vincular"
          ? { vincularTumuloId: f.vincularTumuloId, falecidoNome: f.falecidoNome }
          : { identificacao: f.identificacao, quadraCodigo: f.quadraCodigo, rua: f.rua, falecidoNome: f.falecidoNome },
        plano: criaPlano
          ? { cadencia: at.cadencia, lavagensPorCiclo: at.lavagens,
              valorMensal: Math.round(mensal * 100) / 100, inicio: f.inicio || undefined }
          : undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);

    if (!r?.ok) { setErro(r?.erro || "Não consegui cadastrar agora."); return; }

    // O QUE EXISTE E O QUE NÃO EXISTE, COM TODAS AS LETRAS.
    // A rota devolve `ok: true` mesmo quando o jazigo ou o plano não entraram.
    // Um recado que some em quatro segundos não serve para isso: ela precisa
    // ler com calma e saber o que ainda falta fazer.
    if (r.avisoJazigo || r.avisoPlano) {
      setParcial({ nome: f.nome, jazigo: r.avisoJazigo || null, plano: r.avisoPlano || null });
      return;
    }
    recado.ok(`Família ${f.nome} cadastrada.`);
    onPronto();
  }

  if (parcial) {
    return (
      <Cartao titulo="Entrou pela metade">
        <p className="text-[15px] leading-relaxed text-ink">
          A família <b>{parcial.nome}</b> foi cadastrada, mas nem tudo entrou junto:
        </p>
        <ul className="mt-3 space-y-2">
          {parcial.jazigo && (
            <li className="rounded-lg border border-perigo/40 bg-perigo/5 p-3 text-[14px] text-perigo">
              <b>O jazigo NÃO entrou.</b> {parcial.jazigo}
            </li>
          )}
          {parcial.plano && (
            <li className="rounded-lg border border-aviso/40 bg-aviso/10 p-3 text-[14px] text-aviso">
              <b>O contrato não foi criado.</b> {parcial.plano}
            </li>
          )}
        </ul>
        <p className="mt-3 text-[14px] text-ink-soft">
          Dá para terminar na ficha dela, sem cadastrar de novo — cadastrar de novo criaria
          uma segunda família com o mesmo nome.
        </p>
        <div className="mt-4 flex gap-2">
          <Botao tom="principal" onClick={onPronto}>Ir para a lista</Botao>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao
      titulo={`Cadastrar família · ${passo + 1} de ${PASSOS.length}: ${PASSOS[passo]}`}
      acao={<Botao onClick={onCancelar}>Cancelar</Botao>}
    >
      {/* A TRILHA. Saber quanto falta muda a disposição de começar — e quem
          está no telefone precisa saber se dá tempo. */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PASSOS.map((p, i) => (
          <button
            key={p}
            // Só deixa VOLTAR pelos números. Pular para a frente sem passar pela
            // validação do passo do meio recriaria o buraco que isto conserta.
            onClick={() => i < passo && setPasso(i)}
            disabled={i > passo}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              i === passo ? "bg-brand text-sobre"
                : i < passo ? "bg-surface text-ink hover:bg-line"
                : "bg-surface text-ink-soft"
            }`}
          >
            {i + 1}. {p}
          </button>
        ))}
      </div>

      {!!erro && (
        <p role="alert" className="mb-3 rounded-lg border border-perigo/40 bg-perigo/5 p-3 text-[14px] text-perigo">
          {erro}
        </p>
      )}

      {passo === 0 && (
        <div className="space-y-3">
          <Campo rotulo="Nome da família">
            <Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
                     placeholder="Família Silva" autoFocus />
          </Campo>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px] flex-1">
              <Campo rotulo="WhatsApp" dica="É por onde a família recebe as fotos e as cobranças.">
                <Entrada value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })}
                         placeholder="11 99999-9999" inputMode="tel" />
              </Campo>
            </div>
            <div className="min-w-[140px]">
              <Campo rotulo="Como tratar">
                <Selecao value={f.tratamento} onChange={(e) => setF({ ...f, tratamento: e.target.value })}>
                  <option value="a senhora">a senhora</option>
                  <option value="o senhor">o senhor</option>
                  <option value="a Dra">a Dra</option>
                </Selecao>
              </Campo>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={f.consentimento}
                   onChange={(e) => setF({ ...f, consentimento: e.target.checked })} />
            A família autorizou o contato por WhatsApp (LGPD)
          </label>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Botao tom={f.jazigoModo === "novo" ? "principal" : "secundario"}
                   onClick={() => setF({ ...f, jazigoModo: "novo" })}>
              Novo jazigo
            </Botao>
            {semDono.length > 0 && (
              <Botao tom={f.jazigoModo === "vincular" ? "principal" : "secundario"}
                     onClick={() => setF({ ...f, jazigoModo: "vincular" })}>
                Vincular um capturado no campo ({semDono.length})
              </Botao>
            )}
          </div>

          {f.jazigoModo === "novo" ? (
            <>
              <Campo rotulo="Identificação (lote/número)">
                <Entrada value={f.identificacao} onChange={(e) => setF({ ...f, identificacao: e.target.value })}
                         placeholder="045 · lote 12" />
              </Campo>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[130px] flex-1">
                  <Campo rotulo="Quadra">
                    <Entrada value={f.quadraCodigo} list="quadras-cad"
                             onChange={(e) => setF({ ...f, quadraCodigo: e.target.value })} placeholder="Q-12" />
                    <datalist id="quadras-cad">{quadras.map((c) => <option key={c} value={c} />)}</datalist>
                  </Campo>
                </div>
                <div className="min-w-[110px] flex-1">
                  <Campo rotulo="Rua">
                    <Entrada value={f.rua} onChange={(e) => setF({ ...f, rua: e.target.value })} placeholder="Rua 1" />
                  </Campo>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-soft">
                Sem quadra? Deixe em branco: o jazigo entra em “S/Q” e ganha a quadra certa na
                primeira passagem do campo. <b>Atenção:</b> dentro de “S/Q”, dois jazigos com a
                mesma identificação são tratados como o mesmo túmulo.
              </p>
            </>
          ) : (
            <Campo rotulo="Jazigo capturado no campo">
              <Selecao value={f.vincularTumuloId} onChange={(e) => setF({ ...f, vincularTumuloId: e.target.value })}>
                <option value="">— escolha —</option>
                {semDono.map((t) => (
                  <option key={t.id} value={t.id}>
                    {[t.quadra, t.identificacao, t.rua].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}

          <Campo rotulo="Falecido (opcional)" dica="O nome que está na lápide, para quem for lavar reconhecer.">
            <Entrada value={f.falecidoNome} onChange={(e) => setF({ ...f, falecidoNome: e.target.value })}
                     placeholder="Nome no jazigo" />
          </Campo>

          {/* SEM JAZIGO TAMBÉM É UM CAMINHO — e é o mais comum quando ela está
              cadastrando durante a ligação. Não pode parecer erro. */}
          {!temJazigo && (
            <p className="rounded-lg border border-line bg-surface p-3 text-[13px] text-ink-soft">
              Pode seguir sem o jazigo. A família entra cadastrada e você liga o jazigo depois,
              na ficha dela — sem contrato não há lavagem nem cobrança até lá.
            </p>
          )}
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-3">
          {!temJazigo ? (
            <p className="rounded-lg border border-line bg-surface p-3 text-[14px] text-ink-soft">
              Sem jazigo não há contrato para combinar. Este passo fica para quando o jazigo
              existir.
            </p>
          ) : (
            <>
              <Campo rotulo="Com que frequência lavar">
                <Selecao value={f.atalho} onChange={(e) => setF({ ...f, atalho: Number(e.target.value) })}>
                  {ATALHOS_FREQUENCIA.map((a, i) => <option key={i} value={i}>{a.rotulo}</option>)}
                </Selecao>
              </Campo>
              {criaPlano ? (
                <div className="flex flex-wrap gap-3">
                  <div className="min-w-[130px] flex-1">
                    <Campo rotulo="Valor de UMA limpeza" dica="Como 40 ou 40,50 — sem R$.">
                      <Entrada type="text" inputMode="decimal" placeholder="40,00" value={f.valorMensal}
                               onChange={(e) => setF({ ...f, valorMensal: e.target.value })} />
                    </Campo>
                  </div>
                  <div className="min-w-[150px] flex-1">
                    <Campo rotulo="1ª lavagem" dica="Em branco = hoje.">
                      <Entrada type="date" value={f.inicio}
                               onChange={(e) => setF({ ...f, inicio: e.target.value })} />
                    </Campo>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-line bg-surface p-3 text-[13px] text-ink-soft">
                  “Só quando pedirem” não cria contrato: não há data marcada nem cobrança
                  automática. Cada lavagem é pedida pela família, na ficha dela.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-3">
          <p className="text-[14px] text-ink-soft">
            Nada foi gravado ainda. Confira e toque em cadastrar.
          </p>
          <dl className="divide-y divide-line rounded-xl2 border border-line">
            {([
              ["Família", f.nome],
              ["WhatsApp", `${f.telefone}${f.consentimento ? " · autorizou o contato" : " · sem autorização registrada"}`],
              ["Tratamento", f.tratamento],
              ["Jazigo", f.jazigoModo === "vincular"
                ? (semDono.find((t) => t.id === f.vincularTumuloId)
                    ? [semDono.find((t) => t.id === f.vincularTumuloId).quadra,
                       semDono.find((t) => t.id === f.vincularTumuloId).identificacao].filter(Boolean).join(" · ")
                    : "—")
                : (temJazigo
                    ? [f.quadraCodigo || "S/Q", f.identificacao, f.rua].filter(Boolean).join(" · ")
                    : "nenhum — a família entra sem jazigo")],
              ["Falecido", f.falecidoNome || "—"],
              ["Contrato", !temJazigo
                ? "nenhum"
                : criaPlano
                  ? `${at.rotulo} · ${reais(isFinite(mensal) ? mensal : 0)} por limpeza · a partir de ${f.inicio ? f.inicio.split("-").reverse().join("/") : "hoje"}`
                  : "só quando pedirem"],
            ] as [string, string][]).map(([r, v]) => (
              <div key={r} className="flex flex-wrap justify-between gap-2 p-3">
                <dt className="text-[13px] text-ink-soft">{r}</dt>
                <dd className="text-right text-[14px] font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {!temJazigo && (
            <div className="flex items-center gap-2">
              <Selo tom="atencao">sem jazigo</Selo>
              <span className="text-[13px] text-ink-soft">
                Ela vai aparecer em “cadastro incompleto” até você ligar um jazigo.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <Botao onClick={() => (passo === 0 ? onCancelar() : setPasso(passo - 1))}>
          {passo === 0 ? "Cancelar" : "Voltar"}
        </Botao>
        {passo < PASSOS.length - 1 ? (
          <Botao tom="principal" onClick={avancar}>Continuar</Botao>
        ) : (
          <Botao tom="principal" onClick={gravar} disabled={ocupado}>
            {ocupado ? "Cadastrando…" : "Cadastrar família"}
          </Botao>
        )}
      </div>
    </Cartao>
  );
}
