"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Plus, ChevronDown, Pencil, Link2, Trash2, Camera } from "lucide-react";
import { Cartao, Campo, Entrada, Selecao, Botao, Selo, dinheiro } from "../../pecas";
import { prepararFoto, motivoFalha } from "@/lib/foto";

/**
 * A FICHA DA FAMÍLIA.
 *
 * A ordem é a ordem em que se pensa: quem é a família, o que ela contratou, o
 * que foi feito, e só então se está pago.
 *
 * A ficha antiga fazia o contrário — mostrava os pagamentos na quarta posição
 * e os túmulos na sexta, ou seja, o dinheiro antes do que foi vendido. E
 * metade dela servia ao agente de IA: instruções por contato, memória
 * destilada, "treinar com histórico", score de entendimento.
 *
 * CAMPOS QUE SAÍRAM DO CADASTRO, e por quê:
 *   número do jazigo        duplicava a identificação
 *   nascimento/falecimento  eram gatilho de mensagem automática, desligada
 *   tratamento              idem
 *   régua de cobrança       automação de lembrete, desligada
 *   dias entre lembretes    idem
 *   máximo de lembretes     idem
 *   convite a cada N meses  campanha de ativação, desligada
 *   lavagens no período     derivado da periodicidade
 *   pago até / próxima cobrança  a conta corrente responde melhor
 *
 * Sobraram sete campos por túmulo, e todos são usados toda semana.
 */

const MESES_CICLO: Record<string, number> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

/** Quanto sai em cada cobrança, para mostrar antes de salvar. */
function valorDaCobranca(f: any) {
  const v = Number(String(f.valor_mensal).replace(",", "."));
  if (!isFinite(v)) return 0;
  if (f.valor_base === "cobranca") return Math.round(v * 100) / 100;
  return Math.round(v * (MESES_CICLO[f.freq_pagamento] ?? 1) * 100) / 100;
}

const MES_CURTO = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const mesCurto = (d: string) => `${MES_CURTO[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;

const PERIODICIDADES = [
  ["semanal", "toda semana"],
  ["quinzenal", "a cada quinze dias"],
  ["mensal", "uma vez por mês"],
  ["bimestral", "a cada dois meses"],
  ["trimestral", "a cada três meses"],
];

const FREQUENCIAS = [
  ["mensal", "todo mês"],
  ["trimestral", "a cada três meses"],
  ["semestral", "a cada seis meses"],
  ["anual", "uma vez por ano"],
];

/** O mesmo, indexado — a tela mostra o rótulo e grava o código. */
const FREQ_ROTULO: Record<string, string> = Object.fromEntries(FREQUENCIAS);

/**
 * O CÓDIGO INTERNO NÃO VAI PARA A TELA.
 *
 * Apareceu "nada_para_mudar" em letras miúdas embaixo do botão de trocar quem
 * acerta a conta — um nome de variável mostrado a quem está conferindo
 * cadastro. É o padrão `r.mensagem || r.erro`, em que o segundo termo é o
 * código que o servidor usa para si.
 *
 * A mensagem do servidor vem primeiro; sem ela, o código é traduzido; e o que
 * não estiver aqui vira uma frase honesta em vez de um identificador.
 */
const ERRO_EM_PORTUGUES: Record<string, string> = {
  nada_para_mudar: "Nada mudou — não havia o que salvar.",
  nada_para_atualizar: "Nada mudou — não havia o que salvar.",
  telefone_repetido: "Já existe outra pessoa com este telefone.",
  telefone_invalido: "Telefone inválido. Use DDD + número.",
  telefone_vazio: "O telefone não pode ficar em branco.",
  nao_e_desta_familia: "Esta pessoa não está nesta família.",
  e_o_responsavel: "Esta pessoa é o titular. Troque o titular antes de removê-la.",
  familia_nao_encontrada: "Não achei esta família.",
  nome_vazio: "A família precisa de um nome.",
  valor_invalido: "Informe um valor válido.",
};

function traduzirErro(r: any, padrao = "Não consegui salvar. Tente de novo."): string {
  if (r?.mensagem) return String(r.mensagem);
  const cod = String(r?.erro || "");
  if (ERRO_EM_PORTUGUES[cod]) return ERRO_EM_PORTUGUES[cod];
  // Sem tradução: melhor uma frase que admite não saber do que um
  // identificador com underline no meio da ficha. Cada tela passa a sua,
  // porque "não consegui salvar" mente quando o que falhou foi registrar
  // uma limpeza ou ligar um jazigo.
  return padrao;
}

export default function Ficha() {
  const params = useParams();
  const id = String(params?.id || "");
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/clientes/${id}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r); else setErro(r?.erro || "Não consegui abrir esta ficha.");
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  // De onde a pessoa veio, para saber para onde devolver.
  const [veioDaConferencia, setVeio] = useState(false);
  useEffect(() => {
    setVeio(new URLSearchParams(window.location.search).get("de") === "conferencia");
  }, []);

  if (erro) return <p className="text-[15px] text-perigo">{erro}</p>;
  if (!d) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  // ==========================================================================
  // A FICHA É DA FAMÍLIA. A pessoa é uma parte dela.
  //
  // `c` pode ser NULO: família sem contato é estado legítimo desde a 0091, e
  // eram 24 famílias assim em 23/08. A tela quebrava na primeira linha, lendo
  // `c.telefone` — por isso essas famílias não tinham ficha nenhuma.
  //
  // `clienteId` é o id DA PESSOA, e não o da URL: o endereço agora pode ser o
  // da família, e passar o id da família para um componente que espera pessoa
  // faria buscas silenciosamente vazias.
  // ==========================================================================
  const c = d.cliente || null;
  const fam = d.familia || null;
  const familiaId: string | null = fam?.id || c?.familia_id || null;
  const clienteId: string | null = c?.id || null;

  // A API de cliente devolve crédito como positivo — o oposto da conta
  // corrente. Invertemos aqui para que "em aberto" signifique a mesma coisa
  // nas duas telas do sistema.
  const devendo = -d.saldo;
  const emDia = Math.abs(devendo) < 0.005;
  const fone = String(c?.telefone || "").replace(/\D/g, "");

  const pendentes = (d.conferencia || []).filter(
    (i: any) => i.situacao === "pendente" && i.obrigatorio);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* DE ONDE SE VEIO. Quem chegou pela conferência volta para lá; quem
              veio da lista volta para a lista. Um único "← Famílias" mandava
              quem estava conferindo procurar a conferência de novo. */}
          <Link href={veioDaConferencia ? "/painel/conferencia" : "/painel/clientes"}
                className="text-[13px] text-ink-soft hover:text-ink">
            ← {veioDaConferencia ? "Conferência" : "Famílias"}
          </Link>
          {/* O TÍTULO DIZ O QUE CADA NOME É. "ALCANTARA — CLECIA" economiza
              duas palavras e custa a certeza: quem lê rápido não sabe se o
              segundo nome é o responsável, o falecido ou outra família. */}
          <h1 className="mt-1 text-[22px] font-semibold text-ink">
            (Família - {fam?.nome || c?.nome || "sem nome"})
          </h1>
          <p className="text-[15px] text-ink">
            {c
              ? <>(Responsável - {c.nome}){c.telefone ? <span className="text-ink-soft"> · {c.telefone}</span> : null}</>
              : <span className="text-aviso">(Responsável - não definido)</span>}
          </p>
        </div>
        {fone && (
          <a
            href={`https://wa.me/55${fone}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-[15px] font-medium text-ink hover:bg-surface"
          >
            <MessageCircle size={17} /> WhatsApp
          </a>
        )}
      </div>

      {/* A RESPOSTA EM TRÊS SEGUNDOS — a primeira coisa que se quer saber ao
          abrir a ficha. Antes dividia espaço com o "score de entendimento",
          uma métrica da IA que aparecia MAIOR que o dinheiro. */}
      <div className="mb-3 rounded-xl2 bg-brand p-5 text-sobre">
        <p className="text-[13px] opacity-80">Situação</p>
        <p className="mt-0.5 text-[28px] font-semibold leading-tight">
          {emDia
            ? devendo < -0.005
              ? `Pago adiantado · ${dinheiro(-devendo)} a favor`
              : "Em dia"
            : `Em aberto · ${dinheiro(devendo)}`}
        </p>
        {d.aConferir > 0.005 && (
          <p className="mt-1 text-[14px] opacity-80">
            {dinheiro(d.aConferir)} aguardando conferência
          </p>
        )}
      </div>

      {/* A CONFERÊNCIA MORA AQUI, e não numa tela à parte. Corrigir e dar o
          ok são o mesmo minuto de trabalho — ir até a conferência para
          carimbar o que se acabou de arrumar é uma viagem que ninguém faz. */}
      {familiaId && <BarraConferencia familiaId={familiaId} fam={fam}
                                      pendentes={pendentes} aoMudar={carregar} />}

      {/* UM LUGAR SÓ PARA CADA COISA.
          Havia "Dados do contato" (uma pessoa) E "Contatos da família" (todas)
          — dois cartões para o mesmo assunto, e no primeiro não dava para
          dizer quem acerta a conta. Ficou o segundo.
          E havia "Contrato" (da família) E "Túmulo": o valor num, o ritmo no
          outro. O que é do jazigo desceu para o jazigo; o que é da família
          (fotos, quando ela paga, como o extrato soma) subiu para cá. */}
      {familiaId && <DadosDaFamilia fam={fam} familiaId={familiaId} aoMudar={carregar} />}
      <Pessoas familiaId={familiaId} atualId={clienteId || ""} />
      <Tumulos tumulos={d.tumulos || []} clienteId={clienteId} aoMudar={carregar} />
      {familiaId && <ContaCorrente familiaId={familiaId} clienteId={clienteId} aoMudar={carregar} />}
      <Limpezas clienteId={clienteId} tumulos={d.tumulos || []} aoMudar={carregar} />
      {c && <Ajustes clienteId={c.id} nome={c.nome}
                    familiaId={familiaId} familiaNome={fam?.nome || ""} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A BARRA DE CONFERÊNCIA — o ok mora onde se corrige.
 *
 * A conferência tinha tela própria e a ficha era outra. Quem via a pendência
 * numa vinha corrigir na outra, e para carimbar o ok tinha de voltar. Ninguém
 * volta: é assim que se confere o cadastro e nunca se marca nada como
 * conferido.
 *
 * Aqui a barra mostra o que ainda falta (em palavras de quem vai fazer), e o
 * botão só acende quando não falta nada obrigatório — a recusa é do banco
 * (`sureya_conferir_familia`), não da tela, porque ok em cadastro incompleto é
 * pior que nenhum ok: fica registrado que foi conferido.
 */
/**
 * O NOME DA FAMÍLIA — que não era editável em lugar nenhum.
 *
 * O cartão logo abaixo diz "Dados do contato" e edita `clientes`. Ele dizia
 * "Dados da família", e era a confusão inteira num rótulo só: quem abria para
 * corrigir "Família Andre" acabava renomeando a PESSOA.
 *
 * Medido em 23/08: a Família Andre tem uma pessoa chamada "Nagae" e um jazigo
 * chamado "Nagae". O sobrenome está na pessoa e o primeiro nome está na
 * família — trocados. Sem este cartão não havia como desfazer isso pela tela;
 * a rota da família nem aceitava `nome`.
 */
function DadosDaFamilia({ fam, familiaId, aoMudar }: {
  fam: any; familiaId: string; aoMudar: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  // O QUE É DA FAMÍLIA, e só isso. O valor combinado e o início da cobrança
  // desceram para o jazigo (0100): com N túmulos, cada um tem o seu.
  // Aqui fica o que é dela mesma — o nome, se recebe foto, quando paga e
  // como o extrato soma.
  const [f, setF] = useState({
    nome: fam?.nome || "",
    enviar_fotos: fam?.enviar_fotos === null || fam?.enviar_fotos === undefined
      ? "geral" : (fam.enviar_fotos ? "sim" : "nao"),
    freq_pagamento: fam?.freq_pagamento || "",
    modo_cobranca: fam?.modo_cobranca || "consumo",
    // "geral" é ausência de preferência (segue a casa); "nao" é um pedido
    // desta família. Guardar o pedido como ausência faria a próxima mudança
    // da chave geral desfazê-lo sem ninguém perceber.
    lembretes_memoria: fam?.lembretes_memoria === null || fam?.lembretes_memoria === undefined
      ? "geral" : (fam.lembretes_memoria ? "sim" : "nao"),
    lembretes_pausados_ate: fam?.lembretes_pausados_ate || "",
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!f.nome.trim()) { alert("A família precisa de um nome."); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/familias/${familiaId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // As duas chaves de três estados viajam como a string que a tela usa
        // ("geral" | "sim" | "nao"). Quem traduz é a rota, num lugar só —
        // traduzir aqui também criaria duas regras para a mesma pergunta.
        body: JSON.stringify(f),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "Não consegui salvar."); return; }
      setAbrindo(false);
      aoMudar();
    } finally { setSalvando(false); }
  }

  return (
    <Cartao
      titulo="Dados da família"
      acao={
        <Botao onClick={() => setAbrindo((x) => !x)}>
          <Pencil size={16} /> Editar
        </Botao>
      }
    >
      {!abrindo ? (
        <div className="text-[14px] text-ink-soft">
          <p className="text-[15px] text-ink">{fam?.nome || "sem nome"}</p>
          <p>
            {fam?.enviar_fotos === null || fam?.enviar_fotos === undefined
              ? "fotos: segue a chave da casa"
              : fam.enviar_fotos ? "fotos: sempre enviar" : "fotos: nunca enviar"}
            {fam?.freq_pagamento ? ` · paga ${FREQ_ROTULO[fam.freq_pagamento] || fam.freq_pagamento}` : ""}
            {fam?.modo_cobranca === "competencia"
              ? " · extrato por competência" : " · extrato por consumo"}
          </p>
        </div>
      ) : (
        <>
          <Campo rotulo="Nome da família" dica="é por ele que ela aparece nas listas">
            <Entrada value={f.nome} onChange={(e: any) => setF({ ...f, nome: e.target.value })} />
          </Campo>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Fotos do serviço para esta família"
                   dica="a escolha aqui vale mais que a chave geral em Config">
              <Selecao value={f.enviar_fotos}
                       onChange={(e: any) => setF({ ...f, enviar_fotos: e.target.value })}>
                <option value="geral">segue a chave geral da casa</option>
                <option value="sim">sempre enviar</option>
                <option value="nao">nunca enviar</option>
              </Selecao>
            </Campo>
            <Campo rotulo="A família paga" dica="de quanto em quanto tempo ela acerta">
              <Selecao value={f.freq_pagamento}
                       onChange={(e: any) => setF({ ...f, freq_pagamento: e.target.value })}>
                <option value="">escolha</option>
                {Object.entries(FREQ_ROTULO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="No extrato" dica="como o saldo é calculado">
              <Selecao value={f.modo_cobranca}
                       onChange={(e: any) => setF({ ...f, modo_cobranca: e.target.value })}>
                <option value="consumo">cada limpeza desconta do que foi pago</option>
                <option value="competencia">o mês inteiro entra de uma vez</option>
              </Selecao>
            </Campo>

            {/* LEMBRETES DE MEMÓRIA — a chave desta família.
                É aqui que se atende o pedido que chega por telefone: "não me
                mandem mais nada sobre isso". A pausa com prazo existe para o
                luto que a casa já sabe e o cadastro ainda não. */}
            <Campo rotulo="Lembretes de memória" dica="datas de nascimento e falecimento">
              <Selecao value={f.lembretes_memoria}
                       onChange={(e: any) => setF({ ...f, lembretes_memoria: e.target.value })}>
                <option value="geral">segue a chave da casa</option>
                <option value="sim">esta família recebe</option>
                <option value="nao">esta família pediu para não receber</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Pausar até" dica="silêncio com prazo, sem desligar para sempre">
              <input type="date" className="zm-input"
                     value={f.lembretes_pausados_ate || ""}
                     onChange={(e) => setF({ ...f, lembretes_pausados_ate: e.target.value })} />
            </Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
          </div>
        </>
      )}
    </Cartao>
  );
}

function BarraConferencia({ familiaId, fam, pendentes, aoMudar }: {
  familiaId: string; fam: any; pendentes: any[]; aoMudar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function darOk(ok: boolean) {
    setOcupado(true);
    try {
      const r = await fetch("/api/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, ok }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui salvar"); return; }
      aoMudar();
    } finally { setOcupado(false); }
  }

  async function definirRegime(regime: string) {
    setOcupado(true);
    try {
      const r = await fetch("/api/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, regime }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.erro || "não consegui salvar"); return; }
      aoMudar();
    } finally { setOcupado(false); }
  }

  const conferida = !!fam?.conferida_em;
  const regime = fam?.regime || "nao_definido";

  return (
    <section className="mb-3 rounded-xl2 border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">
            Conferência do cadastro
            {conferida && (
              <span className="ml-2 text-[13px] font-normal text-positivo">
                ✓ conferida em {new Date(fam.conferida_em).toLocaleDateString("pt-BR")}
              </span>
            )}
          </p>
          {pendentes.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-[13px] text-aviso">
              {pendentes.map((i: any) => (
                <li key={i.item}><b>{i.item}</b> — {i.acao}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[13px] text-ink-soft">
              Nada obrigatório faltando.
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {conferida ? (
            <button className="text-[13px] underline text-ink-soft" disabled={ocupado}
                    onClick={() => darOk(false)}>
              tirar o ok
            </button>
          ) : (
            <button
              disabled={ocupado || pendentes.length > 0}
              onClick={() => darOk(true)}
              className={`rounded-lg px-4 py-2.5 text-[15px] font-medium ${
                pendentes.length > 0
                  ? "cursor-not-allowed border border-line bg-surface text-ink-soft"
                  : "bg-brand text-sobre hover:opacity-90"}`}>
              {pendentes.length > 0 ? `Faltam ${pendentes.length}` : "Dar o ok nesta família"}
            </button>
          )}
          <Link href="/painel/conferencia"
                className="text-[13px] underline text-ink-soft">
            ir para a conferência
          </Link>
        </div>
      </div>

      {/* CONTRATO OU AVULSO — a decisão que mais falta, e que não tinha onde
          ser tomada nesta ficha. "Sem contrato" era ambíguo: não dava para
          separar a família que ninguém decidiu da que é avulsa de propósito. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-[13px] text-ink-soft">Como se cobra:</span>
        {([["contrato", "Contrato"], ["avulso", "Avulso"]] as const).map(([v, rot]) => (
          <button key={v} disabled={ocupado} onClick={() => definirRegime(v)}
                  className={`rounded-full border px-3 py-1 text-[13px] ${
                    regime === v ? "border-brand bg-brand text-sobre"
                                 : "border-line bg-card text-ink hover:border-brand"}`}>
            {rot}
          </button>
        ))}
        {regime === "nao_definido" && (
          <span className="text-[13px] text-aviso">ainda não decidido</span>
        )}
      </div>
    </section>
  );
}


function Tumulos({ tumulos, clienteId, aoMudar }: {
  // NULO É LEGÍTIMO: família sem contato (0091). Os jazigos são da família e
  // aparecem do mesmo jeito — o que não dá para fazer sem uma pessoa é
  // adicionar jazigo por esta porta, que é a de "cadastrar para o fulano".
  tumulos: any[]; clienteId: string | null; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  return (
    <Cartao
      titulo={tumulos.length === 1 ? "Túmulo" : "Túmulos"}
      acao={
        // SEM PESSOA NÃO HÁ ESTA PORTA. Ela cadastra o jazigo "para o fulano",
        // e numa família sem contato não há fulano. Os jazigos continuam
        // aparecendo — eles são da família —, e ligar um jazigo novo se faz
        // pela tela de Jazigos, que é a que trabalha sem contato.
        clienteId ? (
          <Botao onClick={() => setNovo((x) => !x)}>
            <Plus size={16} /> Adicionar
          </Botao>
        ) : (
          <Link href="/painel/jazigos" className="text-[13px] underline text-ink-soft">
            ligar um jazigo
          </Link>
        )
      }
    >
      {novo && clienteId && (
        <AdicionarTumulo
          clienteId={clienteId}
          aoPronto={() => { setNovo(false); aoMudar(); }}
          aoCancelar={() => setNovo(false)}
        />
      )}
      {!tumulos.length && (
        <p className="text-[14px] text-ink-soft">
          Nenhum túmulo ligado a esta família ainda.
        </p>
      )}
      {tumulos.map((t) => (
        <Tumulo key={t.id} t={t} aoMudar={aoMudar} />
      ))}
    </Cartao>
  );
}

function Tumulo({ t, aoMudar }: { t: any; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [f, setF] = useState({
    periodicidade: t.periodicidade ?? "",
    contratado: !!t.contratado,
    // O COMBINADO É MENSAL E É DESTE TÚMULO (0100). Uma família pode ter três
    // jazigos com ritmos e preços diferentes — guardar o valor na família
    // obriga a inventar um rateio na hora de cobrar.
    valor_mensal: t.valor_mensal ?? "",
    // O preço de uma ida, para quem é avulso: aí não há mês para dividir.
    valor_lavagem: t.valor_lavagem ?? "",
    valor_base: t.valor_base ?? "mes",
    inicio_cobranca: t.inicio_cobranca ?? "",
    // AS DUAS DATAS QUE ERAM UMA (0104). O dinheiro e a rota não começam
    // juntos, e enquanto foram um campo só, mexer numa mexia na outra.
    proxima_cobranca: t.proxima_cobranca ?? "",
    inicio_agendamento: t.inicio_agendamento ?? "",
    // Vazio = segue o combinado da família (0107).
    meses_entre_cobrancas: t.meses_entre_cobrancas ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const local = [t.quadras?.codigo, t.ruas?.nome].filter(Boolean).join(" · ");

  const [aviso, setAviso] = useState("");

  async function salvar() {
    // Marcar "tem plano" sem dizer quando limpar e quando cobrar produz um
    // túmulo que não aparece em lugar nenhum. Melhor barrar aqui que deixar
    // a Sureya descobrir semanas depois.
    if (f.contratado && !f.periodicidade) {
      // O ritmo é o DIVISOR do rateio: sem ele não dá para saber quanto vale
      // uma lavagem de um combinado mensal.
      setAviso("Diga de quanto em quanto tempo este túmulo é lavado — é o que divide o valor mensal.");
      return;
    }
    setAviso("");
    setSalvando(true);
    try {
      const r = await fetch(`/api/tumulos/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          // Vazio é NULO, e não zero: "não combinei ainda" e "combinei zero"
          // são coisas diferentes, e a conferência cobra a primeira.
          valor_mensal: String(f.valor_mensal).trim() === ""
            ? null : Number(String(f.valor_mensal).replace(",", ".")),
          valor_lavagem: String(f.valor_lavagem).trim() === ""
            ? null : Number(String(f.valor_lavagem).replace(",", ".")),
        }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setAviso(r?.mensagem || r?.erro || "Não consegui salvar."); return; }
      setAbrindo(false);
      aoMudar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        {t.foto_referencia_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={t.foto_referencia_url}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] text-ink-soft">
            sem foto
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">
            {local || "sem endereço"}
            {t.identificacao && (
              <span className="font-normal text-ink-muted"> · {t.identificacao}</span>
            )}
          </p>
          {t.falecido_nome && (
            <p className="text-[13px] text-ink-soft">{t.falecido_nome}</p>
          )}
          {/* O código é a identidade de verdade. Discreto: a Sureya confere,
              a Nina nunca digita. */}
          {t.codigo && <p className="text-[11px] tracking-wide text-ink-soft">{t.codigo}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* PLANO PELA METADE — o caso que passava calado.
                Com "tem plano" marcado mas sem periodicidade ou sem frequência
                de pagamento, o túmulo não entra na agenda da Nina NEM na
                cobrança do mês. Ficava tudo parado sem ninguém saber por quê. */}
            {t.contratado && !t.periodicidade && (
              <Selo tom="atencao">falta dizer quando limpar</Selo>
            )}
            {t.contratado ? (
              <Selo tom="neutro">limpeza {t.periodicidade || "—"}</Selo>
            ) : (
              <Selo tom="neutro">não entra na rota</Selo>
            )}
          </div>
        </div>

        {/* Um chevron sozinho não diz que ali se edita — quem olha vê um
            enfeite. A palavra "Editar" resolve, e o ícone só acompanha. */}
        <button
          onClick={() => setAbrindo((x) => !x)}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-2 text-[14px] font-medium text-ink hover:bg-surface"
        >
          {abrindo ? "Fechar" : "Editar"}
          <ChevronDown size={16} className={abrindo ? "rotate-180 transition" : "transition"} />
        </button>
      </div>

      {abrindo && (
        <div className="mt-3 rounded-lg bg-surface p-3">
          {/* O ENDEREÇO NÃO SE EDITA AQUI.
              Ele era editável nos dois lugares — nesta ficha e na tela Jazigos
              — e cadastro que se corrige em dois lugares acaba divergindo:
              alguém arruma num, o outro segue mostrando o antigo.
              Jazigos é onde a correção acontece de verdade, porque é a única
              tela que alcança pedra ainda sem família e permite trabalhar por
              rua, em lote. Aqui fica só o que é do contrato: o ritmo. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* QUEM LAVA NÃO SE DECIDE AQUI.
                O rótulo dizia "A Nina limpa", e isso é duas coisas erradas numa
                frase: prende o cadastro a UMA pessoa (a equipe não é fixa —
                D-11, "limpeza é limpeza") e mistura o CONTRATO com a ESCALA.
                O que está sendo cadastrado é o ritmo combinado com a família;
                quem vai lavar em cada data é decidido na agenda, e pode ser
                ninguém até alguém começar. */}
            <Campo rotulo="Este túmulo é lavado" dica="de quanto em quanto tempo">
              <Selecao
                value={f.periodicidade}
                onChange={(e: any) => setF({ ...f, periodicidade: e.target.value })}
              >
                <option value="">escolha</option>
                {PERIODICIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </Campo>
            {/* O COMBINADO MENSAL, deste túmulo.
                Cada lavagem desconta a fração: R$ 25/mês com lavagem semanal
                dá R$ 6,25 por ida. Antes o valor mensal era cobrado INTEIRO a
                cada lavagem — quatro vezes o combinado num contrato semanal. */}
            <Campo rotulo="Valor mensal deste túmulo"
                   dica="cada lavagem desconta a fração do mês">
              <Entrada value={f.valor_mensal} inputMode="decimal" placeholder="25,00"
                       onChange={(e: any) => setF({ ...f, valor_mensal: e.target.value })} />
            </Campo>
            <Campo rotulo="Valor de uma lavagem avulsa"
                   dica="para quem não tem contrato — aqui não há mês para dividir">
              <Entrada value={f.valor_lavagem} inputMode="decimal" placeholder="40,00"
                       onChange={(e: any) => setF({ ...f, valor_lavagem: e.target.value })} />
            </Campo>
            {/* O RESTO DO CONTRATO DESCE PARA CÁ.
                Havia um cartão "Contrato", da família, com o valor combinado e
                a régua — e ele precisava avisar "um só, mesmo com vários
                túmulos", que é a confissão de que o grão estava errado. Com N
                jazigos por família (24 têm, uma tem três), cada um pode ter o
                seu preço, o seu início e a sua base. */}
            <Campo rotulo="Esse valor é" dica="por mês, ou o valor de cada cobrança">
              <Selecao value={f.valor_base}
                       onChange={(e: any) => setF({ ...f, valor_base: e.target.value })}>
                <option value="mes">por mês</option>
                <option value="cobranca">o valor de cada cobrança</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Cobrar a partir de" dica="o mês em que o serviço começou">
              <Entrada type="month" value={String(f.inicio_cobranca || "").slice(0, 7)}
                       onChange={(e: any) => setF({ ...f, inicio_cobranca: e.target.value })} />
            </Campo>

            {/* O ESTADO INICIAL, EM DOIS CAMPOS.
                A cobrança anda sozinha daqui em diante: a cada competência
                lançada, o sistema empurra esta data para o período seguinte.
                Editá-la é dizer "cobre a partir daqui". */}
            <Campo rotulo="Próxima cobrança"
                   dica="o sistema empurra sozinho a cada competência lançada">
              <Entrada type="month" value={String(f.proxima_cobranca || "").slice(0, 7)}
                       onChange={(e: any) => setF({ ...f, proxima_cobranca: e.target.value })} />
            </Campo>
            <Campo rotulo="Início dos agendamentos"
                   dica="quando a agenda passa a gerar limpezas — não tem relação com a cobrança">
              <Entrada type="date" value={String(f.inicio_agendamento || "").slice(0, 10)}
                       onChange={(e: any) => setF({ ...f, inicio_agendamento: e.target.value })} />
            </Campo>

            {/* DE QUANTOS EM QUANTOS MESES SE COBRA.
                Era um enum na família (mensal/trimestral/semestral/anual) e a
                primeira família que combinou QUATRO meses não coube. Agora é
                um número, e fica no túmulo junto do resto do contrato. */}
            <Campo rotulo="Cobrar a cada"
                   dica="em meses · vazio segue o combinado da família">
              <Selecao value={String(f.meses_entre_cobrancas ?? "")}
                       onChange={(e: any) => setF({ ...f, meses_entre_cobrancas: e.target.value })}>
                <option value="">segue a família</option>
                {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>{n === 1 ? "todo mês" : `${n} meses`}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Endereço, foto e falecido">
              <a
                href={`/painel/jazigos?rua=${encodeURIComponent(t.ruas?.nome || "")}`}
                className="inline-flex items-center gap-1 text-[14px] text-brand underline"
              >
                corrigir em Jazigos →
              </a>
            </Campo>
          </div>

          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            A cobrança é do <b>contrato</b>, não das limpezas: no vencimento entra o
            valor mensal <b>multiplicado pelos meses do período</b>. Quem pagou quatro
            meses adiantados põe a próxima cobrança no mês certo e <b>cobrar a cada 4
            meses</b> — as limpezas começam antes disso, pelo <b>início dos
            agendamentos</b>. As limpezas são a <b>entrega</b> e não mexem no saldo:
            uma adiada não baixa o mês, uma anotada em atraso não vira dívida
            retroativa.
          </p>

          {/* O QUE ESTA CAIXA FAZ, e não quem lava.
              Dizia "A Nina limpa este túmulo" — o nome de uma pessoa numa
              caixa que decide se o jazigo entra na ESTEIRA de geração da
              agenda. Quem lava é decidido na agenda, a cada data, e pode ser
              ninguém até alguém começar (D-11).
              O próprio selo da linha já dizia a verdade: "não entra na rota". */}
          <label className="mt-3 flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={f.contratado}
              onChange={(e: any) => setF({ ...f, contratado: e.target.checked })}
              className="h-4 w-4"
            />
            Este túmulo entra na rota (a agenda gera limpezas para ele)
          </label>

          {aviso && <p className="mt-2 text-[13px] text-perigo">{aviso}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <Botao tom="principal" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
            <Portal tumuloId={t.id} tokenAtual={t.qr_token} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O LINK DO PORTAL — o que a família abre para ver o antes e o depois.
 *
 * Sem senha, de propósito: idoso não guarda senha. O link chega uma vez pelo
 * WhatsApp e fica salvo no celular dele.
 */
function Portal({ tumuloId, tokenAtual }: { tumuloId: string; tokenAtual: string | null }) {
  const [token, setToken] = useState<string | null>(tokenAtual);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const link = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/familia/${token}`
    : "";

  async function emitir() {
    setOcupado(true);
    try {
      const r = await fetch(`/api/tumulos/${tumuloId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "emitir" }),
      }).then((x) => x.json());
      if (r?.ok) setToken(r.token || r.qr_token || null);
    } finally { setOcupado(false); }
  }

  if (!token) {
    return (
      <Botao onClick={emitir} disabled={ocupado}>
        <Link2 size={16} /> {ocupado ? "Gerando…" : "Gerar link do portal"}
      </Botao>
    );
  }

  return (
    <Botao
      onClick={() => {
        navigator.clipboard?.writeText(link);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      <Link2 size={16} /> {copiado ? "link copiado" : "Copiar link do portal"}
    </Botao>
  );
}


/**
 * FECHAR O MÊS — o ajuste de quando faltou limpeza.
 *
 * Cada limpeza debita o que vale. Se a Nina esquecer uma semana, a família é
 * debitada por três e sobra crédito — mas o combinado é MENSAL. Sem fechar,
 * esse crédito vira desconto no mês seguinte sem ninguém ter decidido.
 *
 * O botão só aparece quando FALTA alguma coisa. Mês completo não pede ação.
 */
function FecharMes({ familiaId, aoMudar }: { familiaId: string; aoMudar: () => void }) {
  const [p, setP] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    fetch(`/api/financeiro/fechar-mes?familiaId=${familiaId}`)
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setP(r); })
      .catch(() => {});
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Nada faltando, ou já fechado: não ocupa espaço nem convida a clicar.
  if (!p || p.jaAjustado || p.falta <= 0.005) return null;

  async function fechar() {
    if (!confirm(
      `Este mês teve ${p.limpezas} limpeza(s), somando ${dinheiro(p.consumido)}.\n` +
      `O combinado é ${dinheiro(p.devidoNoMes)}.\n\n` +
      `Lançar ${dinheiro(p.falta)} para fechar o mês no valor do contrato?`
    )) return;

    setOcupado(true);
    try {
      const r = await fetch("/api/financeiro/fechar-mes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId }),
      }).then((x) => x.json());
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "Não consegui fechar."); return; }
      carregar();
      aoMudar();
    } finally { setOcupado(false); }
  }

  return (
    <Botao tom="principal" onClick={fechar} disabled={ocupado} className="flex-shrink-0">
      {ocupado ? "Fechando…" : `Fechar o mês · falta ${dinheiro(p.falta)}`}
    </Botao>
  );
}

/**
 * PÔR NA CONTA O QUE JÁ VENCEU.
 *
 * O fechamento automático roda no dia 1 e olha o mês corrente. Mas a Sureya
 * está cadastrando agora contratos que começaram meses atrás: uma família que
 * paga desde março entra no sistema em agosto, e o extrato nasceria vazio,
 * como se nada fosse devido.
 *
 * O botão só aparece quando há mês em aberto para lançar — se está tudo em
 * dia, ele não ocupa espaço nem convida a clicar à toa.
 */
function PorNaConta({ familiaId, aoMudar }: { familiaId: string; aoMudar: () => void }) {
  const [previa, setPrevia] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    fetch(`/api/financeiro/competencia/familia?familiaId=${familiaId}`)
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setPrevia(r); })
      .catch(() => {});
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!previa?.novos) return null;

  const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const rotulo = (c: string) => `${MES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
  const primeiro = previa.meses?.[0];
  const ultimo = previa.meses?.[previa.meses.length - 1];

  async function lancar() {
    // A prévia vem antes de gravar, sempre: lançar dívida sem ver o que entra
    // é o tipo de botão que ninguém deveria ter.
    const faixa = previa.novos === 1
      ? rotulo(primeiro)
      : `${rotulo(primeiro)} até ${rotulo(ultimo)}`;
    if (!confirm(
      `Vou lançar ${previa.novos} cobrança(s) — ${faixa} — somando ` +
      `${dinheiro(previa.total)}.\n\nConfirma?`
    )) return;

    setOcupado(true);
    try {
      const r = await fetch("/api/financeiro/competencia/familia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId }),
      }).then((x) => x.json());
      if (!r?.ok) { alert(r?.erro || "Não consegui lançar."); return; }
      carregar();
      aoMudar();
    } finally { setOcupado(false); }
  }

  return (
    <Botao tom="principal" onClick={lancar} disabled={ocupado} className="flex-shrink-0">
      {ocupado
        ? "Lançando…"
        : `Pôr na conta ${previa.novos} ${previa.novos === 1 ? "mês" : "meses"} · ${dinheiro(previa.total)}`}
    </Botao>
  );
}

/* ------------------------------------------------------------------ */

function ContaCorrente({ familiaId, clienteId, aoMudar }: {
  familiaId: string | null; clienteId: string | null; aoMudar: () => void;
}) {
  const [dados, setDados] = useState<any>(null);
  // O comprovante entra AQUI, junto com o pagamento — e não num fluxo à
  // parte. Anexar depois é o tipo de tarefa que ninguém volta para fazer.
  const [comprovante, setComprovante] = useState<{ b64: string; mt: string } | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const [abrindo, setAbrindo] = useState<"pagamento" | "avulso" | "abertura" | null>(null);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  // A data nasce hoje porque é o caso comum, mas precisa ser editável: o Pix
  // costuma cair antes de a Sureya sentar para lançar, e sem isso o extrato
  // registra o dia do lançamento em vez do dia do dinheiro.
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    if (!familiaId) return;
    fetch(`/api/conta-corrente?familiaId=${familiaId}`)
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setDados(r); })
      .catch(() => {});
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!familiaId) {
    return (
      <Cartao titulo="Conta corrente">
        <p className="text-[14px] text-ink-soft">
          Esta família ainda não está vinculada — a conta aparece quando o vínculo existir.
        </p>
      </Cartao>
    );
  }

  const temAbertura = (dados?.linhas || []).some((l: any) => l.origem === "abertura");

  function escolherComprovante(e: any) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      setComprovante({ b64: String(leitor.result || ""), mt: arquivo.type || "image/jpeg" });
    };
    leitor.readAsDataURL(arquivo);
  }

  async function lancar() {
    const n = Number(String(valor).replace(",", "."));
    if (!isFinite(n) || (abrindo !== "abertura" && n <= 0)) {
      setErro(abrindo === "abertura" ? "Informe o valor." : "Informe um valor maior que zero.");
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      // Sobe o comprovante ANTES do lançamento: se a imagem falhar, nada é
      // gravado e a Sureya tenta de novo. Ao contrário, ela ficaria com um
      // pagamento registrado sem prova e sem saber.
      let comprovanteId: string | null = null;
      if (comprovante) {
        const up = await fetch("/api/comprovantes/anexar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId, imagemBase64: comprovante.b64, mimetype: comprovante.mt, valor: n, data,
          }),
        }).then((x) => x.json());
        if (!up?.ok) { setErro(up?.mensagem || "Não consegui salvar o comprovante."); return; }
        comprovanteId = up.id;
      }

      const r = await fetch("/api/conta-corrente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, acao: abrindo, valor: n, descricao, comprovanteId, data }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui lançar."); return; }
      setAbrindo(null); setValor(""); setDescricao(""); setComprovante(null);
      setData(new Date().toISOString().slice(0, 10));
      carregar(); aoMudar();
    } finally {
      setOcupado(false);
    }
  }

  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const periodo = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`;

  return (
    <Cartao
      titulo="Conta corrente"
      acao={dados && (
        <span className={`text-[14px] font-semibold ${dados.emDia ? "text-positivo" : "text-aviso"}`}>
          {dados.frase}
        </span>
      )}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Botao tom="principal" onClick={() => { setAbrindo("pagamento"); setErro(""); }}>
          <Plus size={16} /> Pagamento
        </Botao>
        <Botao onClick={() => { setAbrindo("avulso"); setErro(""); }}>Avulso</Botao>
        {dados && !temAbertura && (
          <Botao onClick={() => { setAbrindo("abertura"); setErro(""); }}>Situação inicial</Botao>
        )}
      </div>

      {abrindo && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          {abrindo === "abertura" && (
            <p className="mb-2 text-[13px] leading-relaxed text-ink-muted">
              Se ela <b>deve</b>, escreva o valor normal (240). Se está{" "}
              <b>adiantada</b>, escreva com menos (-80). Lançado uma vez só, para
              o extrato começar contando a verdade.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor">
              <Entrada inputMode="decimal" value={valor}
                       onChange={(e: any) => setValor(e.target.value)}
                       placeholder={abrindo === "abertura" ? "240 ou -80" : "160,00"} />
            </Campo>
            <Campo
              rotulo={abrindo === "pagamento" ? "Quando o dinheiro entrou" : "Data"}
              dica={abrindo === "pagamento" ? "a data do Pix, não a de hoje" : undefined}
            >
              <Entrada type="date" value={data}
                       onChange={(e: any) => setData(e.target.value)} />
            </Campo>
            <Campo rotulo="Descrição">
              <Entrada value={descricao} onChange={(e: any) => setDescricao(e.target.value)}
                       placeholder="opcional" />
            </Campo>
          </div>
          {/* O COMPROVANTE, sem depender do WhatsApp.
              Ela tira foto da tela ou escolhe o print que a família mandou no
              WhatsApp pessoal. Funciona com a instância de pé ou caída. */}
          {abrindo === "pagamento" && (
            <div className="mt-3">
              <input ref={camera} type="file" accept="image/*" capture="environment"
                     onChange={escolherComprovante} className="hidden" />
              {comprovante ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={comprovante.b64} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <span className="text-[14px] text-positivo">comprovante anexado</span>
                  <button onClick={() => setComprovante(null)}
                          className="text-[13px] text-ink-soft underline">
                    trocar
                  </button>
                </div>
              ) : (
                <Botao onClick={() => camera.current?.click()}>
                  <Camera size={16} /> Anexar comprovante
                </Botao>
              )}
            </div>
          )}

          {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={lancar} disabled={ocupado}>
              {ocupado ? "Lançando…" : "Lançar"}
            </Botao>
            <Botao onClick={() => { setAbrindo(null); setComprovante(null); }}>Cancelar</Botao>
          </div>
        </div>
      )}

      {dados?.linhas?.length === 0 && (
        <p className="text-[14px] text-ink-soft">Nenhum lançamento ainda.</p>
      )}

      {(dados?.linhas || []).map((l: any) => (
        <Lancamento key={l.id} l={l} aoMudar={() => { carregar(); aoMudar(); }} />
      ))}
    </Cartao>
  );
}

/**
 * UMA LINHA DO EXTRATO, corrigível.
 *
 * Errar a data de um Pix é banal. Sem poder corrigir, a pessoa passa a evitar
 * registrar — e aí o extrato deixa de valer.
 */
function Lancamento({ l, aoMudar }: { l: any; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ data: l.data, valor: String(l.valor), descricao: l.descricao || "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const periodo = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`;

  async function salvar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/conta-corrente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id, ...f }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui salvar."); return; }
      setEditando(false); aoMudar();
    } finally { setOcupado(false); }
  }

  async function apagar() {
    if (!confirm("Apagar este lançamento? O saldo muda na hora.")) return;
    setOcupado(true);
    await fetch(`/api/conta-corrente?id=${l.id}`, { method: "DELETE" });
    setOcupado(false);
    aoMudar();
  }

  if (editando) {
    return (
      <div className="border-t border-line py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Data"><Entrada type="date" value={f.data}
            onChange={(e: any) => setF({ ...f, data: e.target.value })} /></Campo>
          <Campo rotulo="Valor"><Entrada inputMode="decimal" value={f.valor}
            onChange={(e: any) => setF({ ...f, valor: e.target.value })} /></Campo>
          <Campo rotulo="Descrição"><Entrada value={f.descricao}
            onChange={(e: any) => setF({ ...f, descricao: e.target.value })} /></Campo>
        </div>
        {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Botao tom="principal" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar"}
          </Botao>
          <Botao onClick={() => setEditando(false)}>Cancelar</Botao>
          <Botao tom="perigo" onClick={apagar} disabled={ocupado}>
            <Trash2 size={16} /> Apagar
          </Botao>
        </div>
      </div>
    );
  }

  return (
        <div className="flex items-center justify-between gap-3 border-t border-line py-2.5">
          <div className="min-w-0">
            <p className="text-[14px] text-ink">{l.descricao}</p>
            <p className="text-[12px] text-ink-soft">
              {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
              {l.competencia && ` · ${periodo(l.competencia)}`}
              {l.local && ` · ${l.local}`}
              {l.comprovanteUrl && (
                <>
                  {" · "}
                  <a href={l.comprovanteUrl} target="_blank" rel="noreferrer"
                     className="text-brand underline">ver comprovante</a>
                </>
              )}
            </p>
          </div>
          {/* A lavagem é REGISTRO, não dinheiro: "+ R$ 0,00" pareceria uma
              cobrança de valor zero. */}
          {/* A lavagem é REGISTRO, não dinheiro, e não se edita: ela é o
              espelho do serviço executado. */}
          {l.origem === "lavagem" ? (
            <span className="flex-shrink-0 text-[12px] text-ink-soft">✓ serviço feito</span>
          ) : (
            <button
              onClick={() => setEditando(true)}
              className={`flex-shrink-0 text-[14px] font-semibold underline decoration-dotted ${
                l.tipo === "debito" ? "text-aviso" : "text-positivo"}`}
              title="Corrigir data, valor ou descrição"
            >
              {l.tipo === "debito" ? "+" : "−"} {dinheiro(l.valor)}
            </button>
          )}
        </div>
  );
}

/* ------------------------------------------------------------------ */

function Limpezas({ clienteId, tumulos, aoMudar }: {
  clienteId: string | null; tumulos: any[]; aoMudar: () => void;
}) {
  const [lista, setLista] = useState<any[]>([]);
  const [lancando, setLancando] = useState(false);
  const [tumuloId, setTumuloId] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [depois, setDepois] = useState<{ b64: string; mt: string; previa: string } | null>(null);
  const [antes, setAntes] = useState<{ b64: string; mt: string; previa: string } | null>(null);
  const [fotoErro, setFotoErro] = useState("");
  const [feito, setFeito] = useState<any>(null);
  // Câmera e galeria são inputs SEPARADOS: sem o atributo `capture` o celular
  // só abre a galeria, e o painel não conseguiria tirar a foto na hora.
  const refDep = useRef<HTMLInputElement>(null);
  const refDepCam = useRef<HTMLInputElement>(null);
  const refAnt = useRef<HTMLInputElement>(null);
  const refAntCam = useRef<HTMLInputElement>(null);

  async function lerFoto(arq: File, set: (v: any) => void) {
    setFotoErro("");
    try {
      // Reduz no navegador: foto de celular em tamanho cheio não cabe no envio.
      const f = await prepararFoto(arq);
      set({ b64: f.b64, mt: f.mt, previa: f.previa });
    } catch (e) { setFotoErro(motivoFalha(e)); }
  }

  // LIMPEZA AVULSA — a que a Sureya registra à mão.
  // Existe porque nem toda limpeza passa pelo app da Nina: a própria Sureya
  // faz uma de vez em quando, e sem isto ela não teria como registrar.
  async function registrar() {
    if (!tumuloId) return;
    setOcupado(true);
    setErro("");
    try {
      // A RESPOSTA PRECISA SER CONFERIDA.
      //
      // Isto era um `await fetch(...)` solto: se a gravação falhasse, a tela
      // fechava o formulário e não dizia nada. A Sureya registrou quatro
      // limpezas, três falharam e ela só descobriu olhando a lista vazia.
      // A PORTA NOVA (0088). A antiga (`POST /api/servico` com `dataExecutada`)
      // criava o serviço executado e inseria em `conta_corrente` por conta
      // própria — sem foto, sem fila, sem remuneração e sem material. Uma
      // limpeza registrada aqui valia menos que a mesma registrada pelo campo.
      // Esta passa pela MESMA transação, e aceita a foto.
      const r = await fetch("/api/servico/registrar-feito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tumuloId,
          data,
          fotoDepoisBase64: depois?.b64,
          fotoAntesBase64: antes?.b64,
          mimetype: depois?.mt || antes?.mt,
        }),
      }).then((x) => x.json()).catch(() => null);

      if (!r?.ok) {
        setErro(traduzirErro(r, "Não consegui registrar a limpeza."));
        return;
      }
      setFeito(r);
      setLancando(false);
      setTumuloId("");
      setDepois(null); setAntes(null); setFotoErro("");
      aoMudar();
      recarregar();
    } finally { setOcupado(false); }
  }

  function recarregar() {
    // A API devolve `executadaEm`, e não `data_executada` — o nome muda ali
    // porque a rota já entrega os campos prontos para a tela. Filtrar pelo
    // nome do banco fazia a lista vir SEMPRE vazia, mesmo com a limpeza
    // gravada corretamente.
    fetch(`/api/servicos?clienteId=${clienteId}&situacao=feitos&limite=100`)
      .then((x) => x.json())
      .then((r) => {
        if (!r?.ok) { setErro(r?.erro || "Não consegui carregar as limpezas."); return; }
        setErro("");
        setLista((r.servicos || []).filter((sv: any) => sv.executadaEm));
      })
      .catch(() => setErro("Não consegui carregar as limpezas."));
  }

  useEffect(() => { recarregar(); }, [clienteId]);

  return (
    <Cartao
      titulo="Limpezas"
      acao={
        tumulos.length ? (
          <Botao onClick={() => setLancando((x) => !x)}>
            <Plus size={16} /> Registrar
          </Botao>
        ) : undefined
      }
    >
      {lancando && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Qual túmulo">
              <Selecao value={tumuloId} onChange={(e: any) => setTumuloId(e.target.value)}>
                <option value="">escolha</option>
                {tumulos.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {[t.quadras?.codigo, t.ruas?.nome, t.identificacao].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Quando foi feita" dica="pode ser uma data passada">
              <Entrada type="date" value={data} max={new Date().toISOString().slice(0, 10)}
                       onChange={(e: any) => setData(e.target.value)} />
            </Campo>
          </div>

          {/* AS FOTOS.
              Opcionais: sem elas a limpeza é registrada inteira — cobrança,
              extrato, histórico, urgência do jazigo — e só não há mensagem
              para aprovar, porque não há o que mandar. Com a do depois, a
              mensagem cai na fila de liberação e espera você. */}
          <input ref={refDep} type="file" accept="image/*" hidden
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerFoto(f, setDepois); }} />
          <input ref={refDepCam} type="file" accept="image/*" capture="environment" hidden
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerFoto(f, setDepois); }} />
          <input ref={refAnt} type="file" accept="image/*" hidden
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerFoto(f, setAntes); }} />
          <input ref={refAntCam} type="file" accept="image/*" capture="environment" hidden
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerFoto(f, setAntes); }} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                Foto do depois <span className="font-normal">— é a que a família recebe</span>
              </label>
              <div className="flex gap-2">
                <Botao onClick={() => refDepCam.current?.click()}>
                  <Camera size={16} /> {depois ? "Trocar" : "Tirar"}
                </Botao>
                <Botao onClick={() => refDep.current?.click()}>Da galeria</Botao>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {depois && <img src={depois.previa} alt="depois" className="mt-2 h-28 w-full rounded-lg object-cover" />}
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                Foto do antes <span className="font-normal">— opcional</span>
              </label>
              <div className="flex gap-2">
                <Botao onClick={() => refAntCam.current?.click()}>
                  <Camera size={16} /> {antes ? "Trocar" : "Tirar"}
                </Botao>
                <Botao onClick={() => refAnt.current?.click()}>Da galeria</Botao>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {antes && <img src={antes.previa} alt="antes" className="mt-2 h-28 w-full rounded-lg object-cover" />}
            </div>
          </div>
          {fotoErro && <p className="mt-2 text-[13px] text-perigo">{fotoErro}</p>}

          <p className="mt-3 text-[13px] text-ink-soft">
            {depois
              ? "Com a foto, a mensagem entra na fila de liberação e espera você aprovar. Nada sai sozinho."
              : "Sem foto, a limpeza é registrada normalmente (cobrança, histórico e urgência do jazigo) — só não há mensagem para aprovar."}
          </p>

          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={registrar} disabled={ocupado || !tumuloId}>
              {ocupado ? "Registrando…" : "Registrar limpeza"}
            </Botao>
            <Botao onClick={() => setLancando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {erro && <p className="mb-2 text-[13px] text-perigo">{erro}</p>}

      {/* O QUE ACONTECEU, escrito.
          Registrar limpeza dispara cinco efeitos invisíveis — cobrança,
          extrato, remuneração, material e a mensagem na fila. Sem esta lista a
          Sureya não tem como saber se a foto virou mensagem ou se a chave de
          envio daquela família estava desligada, e descobriria pela ausência. */}
      {feito && (
        <div className="mb-3 rounded-lg border border-positivo/30 bg-positivo/10 p-3 text-[13px] leading-relaxed text-positivo">
          <b>Limpeza registrada em {feito.data.slice(8, 10)}/{feito.data.slice(5, 7)}.</b>
          <ul className="mt-1 list-disc pl-4">
            {feito.reaproveitado && <li>Aproveitou a limpeza que já estava marcada nesse dia.</li>}
            <li>{feito.debitou
                  ? `Cobrança lançada: ${dinheiro(Number(feito.valor) || 0)}`
                  : "Sem cobrança nova (já paga, já lançada, ou plano por competência)"}</li>
            {feito.lancamentosDatados > 0 && <li>Lançamento movido para o mês da limpeza.</li>}
            {feito.material > 0 && <li>Material descontado: {dinheiro(Number(feito.material))}</li>}
            <li>{feito.naFila
                  ? "A mensagem está na fila de liberação, esperando você aprovar."
                  : feito.comFoto
                    ? "A mensagem NÃO entrou na fila — o envio de fotos está desligado para esta família (ou na chave geral)."
                    : "Sem foto, então não há mensagem para enviar."}</li>
          </ul>
          <button className="mt-2 underline" onClick={() => setFeito(null)}>ok</button>
        </div>
      )}

      {!lista.length && !erro && (
        <p className="text-[14px] text-ink-soft">Nenhuma limpeza registrada ainda.</p>
      )}
      {lista.map((l: any) => (
        <div key={l.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-ink">
              {l.executadaEm
                ? new Date(l.executadaEm + "T12:00:00").toLocaleDateString("pt-BR")
                : "sem data"}
            </p>
            {l.tumulo && l.tumulo !== "—" && (
              <p className="text-[12px] text-ink-soft">{l.tumulo}</p>
            )}
          </div>
          {/* O VALOR AO LADO DO SERVIÇO. Sem ele, a lista diz "três limpezas"
              e não diz quanto isso consumiu do que a família pagou. */}
          {l.valorLimpeza > 0 && (
            <span className="text-[14px] font-semibold text-aviso">
              {dinheiro(l.valorLimpeza)}
            </span>
          )}
          <Selo tom="bom">feita</Selo>
        </div>
      ))}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */

/**
 * OS CONTATOS DA FAMÍLIA, E QUEM ACERTA A CONTA.
 *
 * O QUE MUDOU E POR QUÊ (migration 0091)
 * ---------------------------------------------------------------------------
 * Este cartão se chamava "Pessoas da família" e só LISTAVA — e só aparecia
 * quando havia mais de uma pessoa. Fazia sentido enquanto a família era o
 * apelido de um contato: 298 famílias, 298 contatos, um para um.
 *
 * Agora a família é a entidade, e duas coisas que ela não fazia viraram o
 * trabalho do dia:
 *
 *   · **acrescentar um contato** a uma família que ainda não tem nenhum — é o
 *     caminho de volta dos jazigos cadastrados sem telefone;
 *   · **trocar quem paga**, com o motivo escrito. "Tem família que o contato
 *     financeiro muda ano após ano", e a troca precisa deixar rastro: a
 *     pergunta que aparece depois é sobre o passado — "para quem foi a cobrança
 *     de março?".
 *
 * Por isso ele aparece SEMPRE, inclusive com zero contato: é justamente aí que
 * há trabalho a fazer.
 */
function Pessoas({ familiaId, atualId }: { familiaId: string | null; atualId: string }) {
  const [dados, setDados] = useState<any>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState<any>({});
  // `mexendo` e nao `ocupado`: ja existe um `ocupado` booleano neste
  // componente, para o POST. Dois estados com o mesmo nome viram um bug que
  // so aparece quando as duas acoes acontecem juntas.
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [novo, setNovo] = useState({ nome: "", telefone: "" });
  const [trocando, setTrocando] = useState(false);
  const [escolha, setEscolha] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(() => {
    if (!familiaId) return;
    fetch(`/api/familias/${familiaId}/contatos`)
      .then((x) => x.json())
      .then((r) => {
        if (!r?.ok) return;
        setDados(r);
        setEscolha(r.familia?.responsavelId || "");
      })
      .catch(() => {});
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!familiaId || !dados) return null;

  const contatos = dados.contatos || [];
  const historico = dados.historico || [];
  const semContato = !dados.familia?.responsavelId;

  async function agir(corpo: any) {
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/familias/${familiaId}/contatos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json());
      // O CÓDIGO INTERNO NÃO VAI PARA A TELA. Aparecia "nada_para_mudar" em
      // letras miúdas embaixo do botão — um nome de variável mostrado a quem
      // está conferindo cadastro. A mensagem vem primeiro; o código só se não
      // houver mensagem, e mesmo assim traduzido.
      if (!r?.ok) { setErro(traduzirErro(r)); return false; }
      carregar();
      return true;
    } finally { setOcupado(false); }
  }

  /**
   * Liga ou desliga "esta pessoa acerta a conta".
   *
   * Não mexe no TITULAR: são duas perguntas diferentes — "quem responde"
   * (um só, com histórico) e "quem pode pagar" (quantos forem). A exceção é
   * a família sem titular nenhum: aí o primeiro marcado assume, porque uma
   * família com quem paga e sem para quem cobrar é o pior dos dois mundos.
   *
   * QUEM DIZ NÃO É O BANCO, NÃO ESTA FUNÇÃO.
   *
   * Havia aqui uma recusa própria: desmarcar o titular era proibido pela tela.
   * Ela era mais dura que a regra da casa — o titular pode deixar de ser quem
   * paga desde que outro pague, e era justamente isso que o usuário pediu ao
   * permitir vários contatos financeiros.
   *
   * O limite verdadeiro é um só, e mora no gatilho da 0102: não dá para tirar
   * o ÚLTIMO. Deixar a recusa num lugar só evita o pior dos casos — a tela
   * proibir o que o banco permite, e ninguém entender por quê.
   */
  async function marcarPagador(p: any, ligar: boolean) {
    setMexendo(p.id); setErro("");
    try {
      const r = await fetch(`/api/familias/${familiaId}/contatos`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contatoId: p.id, acertaConta: ligar }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(traduzirErro(r)); return; }
      carregar();
    } finally { setMexendo(null); }
  }

  /** Corrige os dados de uma pessoa da família. */
  async function salvarPessoa(id: string) {
    setMexendo(id); setErro("");
    try {
      const r = await fetch(`/api/familias/${familiaId}/contatos`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contatoId: id, ...ed }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(traduzirErro(r)); return; }
      setEditando(null); setEd({});
      carregar();
    } finally { setMexendo(null); }
  }

  /**
   * Tira a pessoa da família.
   *
   * Quem responde pelo dinheiro NÃO sai por aqui — o servidor recusa, e com
   * razão: deixar a família sem quem responde tem de ser uma escolha ("trocar
   * quem acerta a conta"), e não o efeito colateral de remover um contato.
   */
  async function removerPessoa(p: any) {
    if (!confirm(
      `Remover ${p.nome} desta família?\n\n` +
      `Os jazigos e o histórico ficam onde estão — sai só a pessoa.`)) return;
    setMexendo(p.id); setErro("");
    try {
      const r = await fetch(`/api/familias/${familiaId}/contatos?contatoId=${p.id}`, {
        method: "DELETE",
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(traduzirErro(r)); return; }
      if (r.mensagem) alert(r.mensagem);
      carregar();
    } finally { setMexendo(null); }
  }

  return (
    <Cartao
      titulo="Contatos da família"
      acao={
        <Botao onClick={() => setAbrindo((x) => !x)}>
          <Plus size={16} /> Contato
        </Botao>
      }
    >
      {/* SEM CONTATO NÃO É ERRO — é uma família cadastrada de quem ainda não se
          tem telefone, que era o caso de 81 jazigos. Mas precisa aparecer, ou a
          Sureya descobre pela cobrança que nunca chega. */}
      {semContato && (
        <p className="mb-3 rounded-lg border border-aviso/30 bg-aviso/10 p-3 text-[14px] leading-relaxed text-aviso">
          <b>Esta família ainda não tem com quem falar.</b> As limpezas continuam
          sendo registradas e cobradas normalmente — mas nada é enviado, porque
          não há para quem.
        </p>
      )}

      {abrindo && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Entrada value={novo.nome} onChange={(e: any) => setNovo({ ...novo, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="WhatsApp com DDD">
              <Entrada inputMode="tel" value={novo.telefone}
                       onChange={(e: any) => setNovo({ ...novo, telefone: e.target.value })} />
            </Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" disabled={ocupado || !novo.nome.trim() || !novo.telefone.trim()}
                   onClick={async () => {
                     if (await agir({ acao: "novo", ...novo })) {
                       setNovo({ nome: "", telefone: "" }); setAbrindo(false);
                     }
                   }}>
              {ocupado ? "Salvando…" : "Acrescentar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
          </div>
          {semContato && (
            <p className="mt-2 text-[13px] text-ink-soft">
              Sendo o primeiro, ele já passa a ser quem acerta a conta.
            </p>
          )}
        </div>
      )}

      {!contatos.length && !abrindo && (
        <p className="text-[14px] text-ink-soft">Nenhum contato cadastrado.</p>
      )}

      {/* EDITAR E REMOVER A PESSOA.
          A lista era só de leitura: dava para ADICIONAR contato e TROCAR quem
          acerta a conta, e não dava para corrigir o nome de quem já estava lá
          nem tirar alguém. As rotas existiam (PATCH e DELETE em
          /api/familias/[id]/contatos) e nenhuma tela as chamava. */}
      {contatos.map((p: any) => (
        <div key={p.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
          {editando === p.id ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome">
                <Entrada value={ed.nome ?? p.nome}
                         onChange={(e: any) => setEd({ ...ed, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="WhatsApp">
                <Entrada value={ed.telefone ?? (p.telefone || "")} inputMode="tel"
                         onChange={(e: any) => setEd({ ...ed, telefone: e.target.value })} />
              </Campo>
              <Campo rotulo="Parentesco">
                <Entrada value={ed.parentesco ?? (p.parentesco || "")} placeholder="filha, neto…"
                         onChange={(e: any) => setEd({ ...ed, parentesco: e.target.value })} />
              </Campo>
              <Campo rotulo="Como tratar">
                <Entrada value={ed.tratamento ?? (p.tratamento || "")} placeholder="a senhora, o senhor…"
                         onChange={(e: any) => setEd({ ...ed, tratamento: e.target.value })} />
              </Campo>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Botao tom="principal" disabled={mexendo === p.id}
                       onClick={() => salvarPessoa(p.id)}>Salvar</Botao>
                <Botao onClick={() => { setEditando(null); setEd({}); }}>Cancelar</Botao>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] text-ink">
                  {p.nome}
                  {p.id === atualId && <span className="text-ink-soft"> · esta ficha</span>}
                </p>
                <p className="text-[13px] text-ink-soft">
                  {[p.telefone, p.parentesco, p.tratamento].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                {/* PODE HAVER VÁRIOS. O casal que divide, a filha que assume
                    quando o pai viaja. `responsavel_financeiro` sempre foi um
                    booleano por pessoa — o que impedia vários era a tela.
                    O TITULAR continua sendo um: é quem recebe a cobrança e
                    quem tem histórico com data (0091). */}
                {p.id === dados?.familia?.responsavelId && <Selo tom="bom">titular</Selo>}
                {p.paga && p.id !== dados?.familia?.responsavelId && (
                  <Selo tom="bom">acerta a conta</Selo>
                )}
                {p.recebeFotos && <Selo tom="neutro">recebe fotos</Selo>}
                <button className="text-[13px] text-ink-soft underline decoration-dotted hover:text-brand"
                        disabled={mexendo === p.id}
                        onClick={() => marcarPagador(p, !p.paga)}>
                  {p.paga ? "não acerta mais" : "também acerta a conta"}
                </button>
                <button className="text-[13px] text-ink-soft underline decoration-dotted hover:text-brand"
                        onClick={() => { setEditando(p.id); setEd({}); }}>
                  editar
                </button>
                <button className="text-[13px] text-perigo underline decoration-dotted"
                        disabled={mexendo === p.id}
                        onClick={() => removerPessoa(p)}>
                  remover
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* QUEM ACERTA A CONTA — a troca, com o motivo.
          O motivo não é burocracia: é o que responde "por que a cobrança
          mudou de pessoa?" seis meses depois, quando alguém pergunta. */}
      {!!contatos.length && (
        <div className="mt-3 border-t border-line pt-3">
          {!trocando ? (
            <button className="text-[14px] text-ink-soft underline decoration-dotted hover:text-brand"
                    onClick={() => setTrocando(true)}>
              Trocar quem acerta a conta
            </button>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Quem acerta a conta">
                  <Selecao value={escolha} onChange={(e: any) => setEscolha(e.target.value)}>
                    {/* "Ninguém por enquanto" é escolha legítima, não um campo
                        vazio: a família pode ficar sem contato de propósito. */}
                    <option value="">ninguém por enquanto</option>
                    {contatos.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Por quê" dica="fica no histórico">
                  <Entrada value={motivo} placeholder="ex.: este ano quem acerta é a filha"
                           onChange={(e: any) => setMotivo(e.target.value)} />
                </Campo>
              </div>
              <div className="mt-3 flex gap-2">
                <Botao tom="principal" disabled={ocupado}
                       onClick={async () => {
                         if (await agir({ acao: "quem_paga", clienteId: escolha || null, motivo })) {
                           setMotivo(""); setTrocando(false);
                         }
                       }}>
                  {ocupado ? "Salvando…" : "Salvar"}
                </Botao>
                <Botao onClick={() => { setTrocando(false); setEscolha(dados.familia?.responsavelId || ""); }}>
                  Cancelar
                </Botao>
              </div>
            </>
          )}
        </div>
      )}

      {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}

      {historico.length > 1 && (
        <div className="mt-3 border-t border-line pt-3">
          <button className="text-[14px] text-ink-soft underline decoration-dotted hover:text-brand"
                  onClick={() => setVerHistorico((v) => !v)}>
            {verHistorico ? "Esconder o histórico" : `Histórico de quem acertou a conta (${historico.length})`}
          </button>
          {verHistorico && (
            <div className="mt-2">
              {historico.map((h: any) => (
                <p key={h.id} className="border-t border-line py-2 text-[13px] text-ink-soft first:border-t-0">
                  <b className="text-ink">{h.quem || "ninguém"}</b>
                  {" desde "}{String(h.desde).slice(8, 10)}/{String(h.desde).slice(5, 7)}/{String(h.desde).slice(0, 4)}
                  {h.motivo && <> — {h.motivo}</>}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */

/** Liga um túmulo novo a esta família — escolhendo quadra e rua das listas. */
/**
 * LIGAR UM TÚMULO À FAMÍLIA.
 *
 * Duas portas, e a ordem importa: **primeiro os que a Nina já cadastrou no
 * campo**, depois criar do zero.
 *
 * O motivo é o estado real do cadastro: os 71 túmulos capturados no cemitério
 * estavam todos sem família. Se esta tela abrisse no formulário de criar,
 * a Sureya cadastraria de novo o que já existe — e o cemitério acabaria com
 * dois registros para a mesma pedra, cada um com metade da história.
 */
function AdicionarTumulo({ clienteId, aoPronto, aoCancelar }: {
  clienteId: string; aoPronto: () => void; aoCancelar: () => void;
}) {
  const [porta, setPorta] = useState<"campo" | "novo">("campo");
  const [orfaos, setOrfaos] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [quadras, setQuadras] = useState<any[]>([]);
  const [ruas, setRuas] = useState<any[]>([]);
  const [f, setF] = useState({ quadraId: "", quadraCodigo: "", rua: "", identificacao: "", falecidoNome: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json())
      .then((r) => {
        if (!r?.ok) return;
        setOrfaos(r.semDono || []);
        // Sem nenhum órfão esperando, a porta do campo não serve — abre direto
        // no formulário em vez de mostrar uma lista vazia.
        if (!(r.semDono || []).length) setPorta("novo");
        setQuadras(r.cemiterios?.[0]?.quadras || []);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!f.quadraId) { setRuas([]); return; }
    fetch(`/api/ruas?quadraId=${f.quadraId}`).then((x) => x.json())
      .then((r) => { if (r?.ok) setRuas(r.ruas || []); }).catch(() => {});
  }, [f.quadraId]);

  async function enviar(corpo: any) {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/clientes/${clienteId}/tumulos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(traduzirErro(r, "Não consegui ligar.")); return; }
      // Falha parcial ainda é sucesso parcial: mostra o que não deu, mas segue
      // com o que entrou — esconder isso faria a Sureya ligar de novo o que já
      // estava ligado.
      if (r?.mensagem) alert(r.mensagem);
      setMarcados([]);
      aoPronto();
    } finally { setSalvando(false); }
  }

  // A busca varre tudo que identifica a pedra: código, nome escrito nela,
  // falecido, quadra e rua. Com dezenas de jazigos quase iguais, procurar só
  // por um campo não acha nada.
  const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtrados = orfaos.filter((t: any) => {
    if (!termos.length) return true;
    const alvo = [t.codigo, t.identificacao, t.falecido, t.quadra, t.rua]
      .filter(Boolean).join(" ").toLowerCase();
    // TODOS os termos precisam bater: "rua 5 almeida" é mais específico que
    // "rua 5", e é assim que se estreita uma lista grande.
    return termos.every((x) => alvo.includes(x));
  });

  return (
    <div className="mb-3 rounded-lg bg-surface p-3">
      <div className="mb-3 flex gap-2">
        <Botao
          tom={porta === "campo" ? "principal" : "secundario"}
          onClick={() => setPorta("campo")}
        >
          Cadastrados no campo{orfaos.length ? ` (${orfaos.length})` : ""}
        </Botao>
        <Botao
          tom={porta === "novo" ? "principal" : "secundario"}
          onClick={() => setPorta("novo")}
        >
          Criar novo
        </Botao>
      </div>

      {porta === "campo" ? (
        <>
          {!orfaos.length ? (
            <p className="text-[14px] text-ink-soft">
              Nenhum túmulo do campo esperando família. Use &ldquo;Criar novo&rdquo;.
            </p>
          ) : (
            <>
              <Entrada
                value={busca}
                onChange={(e: any) => setBusca(e.target.value)}
                placeholder="Buscar por código, nome na pedra, falecido, quadra ou rua"
              />

              <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-ink-soft">
                <span>
                  {filtrados.length} de {orfaos.length}
                  {marcados.length > 0 && ` · ${marcados.length} selecionado(s)`}
                </span>
                {filtrados.length > 0 && (
                  <button
                    className="underline"
                    onClick={() => {
                      const ids = filtrados.map((t: any) => t.id);
                      const todosMarcados = ids.every((x) => marcados.includes(x));
                      // Marca/desmarca só o que está FILTRADO: com a lista
                      // estreitada por busca, marcar os 68 seria o oposto do
                      // que ela quer.
                      setMarcados(todosMarcados
                        ? marcados.filter((x) => !ids.includes(x))
                        : [...new Set([...marcados, ...ids])]);
                    }}
                  >
                    {filtrados.every((t: any) => marcados.includes(t.id))
                      ? "desmarcar estes" : "marcar estes"}
                  </button>
                )}
              </div>

              {/* A FOTO É O QUE ELA RECONHECE.
                  Quase nenhum jazigo do campo tem nome na pedra, e "Quadra 1 ·
                  Rua 2" se repete dezenas de vezes. Sem a foto, escolher é
                  adivinhar. */}
              <div className="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {filtrados.map((t: any) => {
                  const escolhido = marcados.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setMarcados(escolhido
                        ? marcados.filter((x) => x !== t.id)
                        : [...marcados, t.id])}
                      className={`overflow-hidden rounded-lg border text-left transition-colors ${
                        escolhido ? "border-brand bg-brand-light" : "border-line bg-card hover:bg-surface"
                      }`}
                    >
                      <span className="relative block">
                        {t.foto ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.foto} alt="" className="h-24 w-full object-cover" />
                        ) : (
                          <span className="flex h-24 w-full items-center justify-center bg-surface text-[11px] text-ink-soft">
                            sem foto
                          </span>
                        )}
                        <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                          escolhido ? "border-brand bg-brand text-sobre" : "border-line bg-card text-transparent"
                        }`}>✓</span>
                      </span>
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {[t.quadra, t.rua].filter(Boolean).join(" · ") || "sem endereço"}
                        </span>
                        <span className="block truncate text-[11px] text-ink-soft">
                          {t.identificacao || t.falecido || t.codigo || "—"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!filtrados.length && (
                  <p className="col-span-full py-2 text-[14px] text-ink-soft">
                    Nada com esse termo.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Quadra">
            <Selecao
              value={f.quadraId}
              onChange={(e: any) => {
                const q = quadras.find((x: any) => x.id === e.target.value);
                setF({ ...f, quadraId: e.target.value, quadraCodigo: q?.codigo || "", rua: "" });
              }}
            >
              <option value="">escolha</option>
              {quadras.map((q: any) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Rua">
            <Selecao value={f.rua} disabled={!ruas.length}
                     onChange={(e: any) => setF({ ...f, rua: e.target.value })}>
              <option value="">{f.quadraId ? "escolha" : "escolha a quadra antes"}</option>
              {ruas.map((r: any) => <option key={r.id} value={r.nome}>{r.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Nome escrito na pedra" dica="opcional">
            <Entrada value={f.identificacao}
                     onChange={(e: any) => setF({ ...f, identificacao: e.target.value })}
                     placeholder="Ex.: Almeida" />
          </Campo>
          <Campo rotulo="Nome do falecido">
            <Entrada value={f.falecidoNome}
                     onChange={(e: any) => setF({ ...f, falecidoNome: e.target.value })}
                     placeholder="opcional" />
          </Campo>
        </div>
      )}

      {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {porta === "campo" && marcados.length > 0 && (
          <Botao
            tom="principal"
            disabled={salvando}
            onClick={() => enviar({ vincularTumuloIds: marcados })}
          >
            {salvando
              ? "Ligando…"
              : `Ligar ${marcados.length} ${marcados.length === 1 ? "jazigo" : "jazigos"}`}
          </Botao>
        )}
        {porta === "novo" && (
          <Botao
            tom="principal"
            disabled={salvando}
            onClick={() => {
              if (!f.quadraCodigo) return setErro("Escolha a quadra.");
              if (!f.rua) return setErro("Escolha a rua — é ela que põe o jazigo no roteiro.");
              enviar({
                quadraCodigo: f.quadraCodigo, rua: f.rua,
                identificacao: f.identificacao || null,
                falecidoNome: f.falecidoNome || null,
              });
            }}
          >
            {salvando ? "Criando…" : "Criar e ligar"}
          </Botao>
        )}
        <Botao onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * AJUSTES — recolhido por padrão.
 *
 * Coisas de fazer uma vez: exportar dados e excluir. Ficavam abertas
 * competindo com o que se usa todo dia.
 */
function Ajustes({ clienteId, nome, familiaId, familiaNome }:
  { clienteId: string; nome: string; familiaId: string | null; familiaNome: string }) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function excluir() {
    if (!confirm(
      `Excluir a ficha de ${nome}?\n\nOs túmulos ficam cadastrados e podem ser ligados a outra família. Esta ação não volta.`
    )) return;
    setOcupado(true);
    const r = await fetch(`/api/clientes/${clienteId}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) window.location.href = "/painel/clientes";
    else alert(r?.mensagem || r?.erro || "Não consegui excluir.");
  }

  return (
    <div className="mt-1">
      <Botao className="w-full" onClick={() => setAberto((x) => !x)}>
        {aberto ? "Fechar ajustes" : "Ajustes da família"}
      </Botao>
      {aberto && (
        <Cartao className="mt-2">
          <a
            href={`/api/clientes/${clienteId}/lgpd`}
            className="mb-3 block text-[14px] text-brand underline"
          >
            Exportar os dados desta família
          </a>
          <Botao tom="perigo" onClick={excluir} disabled={ocupado}>
            <Trash2 size={16} /> Excluir ficha
          </Botao>

          {familiaId && <FundirOuExcluir familiaId={familiaId} familiaNome={familiaNome} />}
        </Cartao>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * FUNDIR OU EXCLUIR A FAMÍLIA.
 *
 * Medido em 23/08: 31 nomes repetidos, 97 famílias — "Família Cemitério"
 * sozinha aparece ~30 vezes, resto de importação. E NENHUMA delas está vazia:
 * 97 têm contato, 48 têm jazigo.
 *
 * Por isso as duas ações andam juntas. "Excluir" sozinho seria inútil (recusa
 * as 97) ou destrutivo (levaria 48 jazigos junto — o mesmo desenho que já
 * mordeu esta casa quando apagar uma pessoa apagava os jazigos dela).
 *
 * O que duplicata pede é FUSÃO: tudo vai para a família que fica, e a outra
 * some. A exclusão serve para o cadastro criado por engano, que existe — e o
 * banco recusa dizendo o que está preso, para a pessoa saber ir fundir.
 */
function FundirOuExcluir({ familiaId, familiaNome }:
  { familiaId: string; familiaNome: string }) {
  const [abrindo, setAbrindo] = useState(false);
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<any[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function procurar(q: string) {
    setBusca(q);
    if (q.trim().length < 2) { setAchadas([]); return; }
    const r = await fetch(`/api/clientes?busca=${encodeURIComponent(q)}`)
      .then((x) => x.json()).catch(() => null);
    // Uma linha por família, e nunca ela mesma: fundir consigo é o erro que a
    // função recusa, mas oferecer a opção já é confuso.
    const vistas = new Map<string, any>();
    for (const c of (r?.clientes || [])) {
      if (!c.familia_id || c.familia_id === familiaId) continue;
      if (!vistas.has(c.familia_id)) {
        vistas.set(c.familia_id, { id: c.familia_id, nome: c.familia || c.nome });
      }
    }
    setAchadas([...vistas.values()].slice(0, 8));
  }

  async function fundir(destino: any) {
    if (!confirm(
      `Fundir "${familiaNome}" em "${destino.nome}"?\n\n` +
      `Os contatos, os jazigos e o histórico passam para "${destino.nome}", ` +
      `e "${familiaNome}" some da lista.\n\nIsto não tem desfazer.`)) return;
    setOcupado(true); setErro("");
    const r = await fetch(`/api/familias/${familiaId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "fundir", destino: destino.id }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) { setErro(r?.mensagem || "Não consegui fundir."); return; }
    const m = r.movido || {};
    alert(`Pronto. Foram para "${destino.nome}": ${m.contatos || 0} contato(s), `
        + `${m.tumulos || 0} jazigo(s), ${m.lancamentos || 0} lançamento(s).`);
    window.location.href = `/painel/clientes/${destino.id}`;
  }

  async function excluirFamilia() {
    if (!confirm(`Excluir a família "${familiaNome}"?\n\nSó dá certo se ela estiver vazia.`)) return;
    setOcupado(true); setErro("");
    const r = await fetch(`/api/familias/${familiaId}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) { setErro(r?.mensagem || "Não consegui excluir."); return; }
    window.location.href = "/painel/clientes";
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-[13px] leading-relaxed text-ink-soft">
        <b>Família duplicada?</b> Funda — tudo passa para a que fica e nada se perde.
        Excluir só funciona com a família vazia.
      </p>

      {!abrindo ? (
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => setAbrindo(true)}>Fundir com outra família</Botao>
          <Botao tom="perigo" onClick={excluirFamilia} disabled={ocupado}>
            Excluir família
          </Botao>
        </div>
      ) : (
        <div>
          <input className="zm-input" autoFocus placeholder="Nome da família que FICA"
                 value={busca} onChange={(e) => procurar(e.target.value)} />
          {achadas.map((f) => (
            <button key={f.id} onClick={() => fundir(f)} disabled={ocupado}
                    className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-left text-[14px] hover:border-brand">
              {f.nome}
            </button>
          ))}
          {busca.trim().length >= 2 && !achadas.length && (
            <p className="mt-2 text-[13px] text-ink-soft">Nenhuma outra família com esse nome.</p>
          )}
          <Botao className="mt-2" onClick={() => { setAbrindo(false); setBusca(""); setAchadas([]); }}>
            Cancelar
          </Botao>
        </div>
      )}

      {erro && <p className="mt-2 text-[14px] text-perigo">{erro}</p>}
    </div>
  );
}
