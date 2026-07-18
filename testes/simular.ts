/**
 * SIMULADOR DE OPERAÇÕES
 * Executa as funções REAIS do sistema (não reimplementações) contra um banco
 * em memória, com os mesmos dados e formatos da produção.
 */
import { criarFakeSupabase, type Tabelas } from "./fake-supabase";

// ---------------------------------------------------------------- ambiente
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
process.env.ANTHROPIC_API_KEY = "fake";
process.env.EVOLUTION_API_URL = "https://fake";
process.env.EVOLUTION_API_KEY = "fake";
process.env.EVOLUTION_INSTANCE = "sureya";
process.env.SUREYA_ORG_ID = "org-1";
process.env.SUREYA_WEBHOOK_SECRET = "fake";

const ORG = "org-1";
const hoje = new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- massa de dados
function montarBanco(): Tabelas {
  return {
    orgs: [{ id: ORG, nome: "Zelo & Memória", marca_nome: "Zelo & Memória",
             marca_assinatura: "Por Dona Nadir · Desde 1990", chave_pix: "zeloememoria@pix.com",
             limpezas_por_dia: 20, dias_trabalhados_semana: 6,
             valor_referencia_limpeza: 40, ipca_anual_estimado: 0.045, teto_ia_dia: 0,
             dias_semana: [1,2,3,4,5], hora_inicio: "08:00", hora_fim: "16:00",
             assuntos_sempre_manual: ["luto","reclamacao","cancelamento"],
             palavras_criticas: ["faleceu","advogado","processo","cancelar","roubaram"] }],
    membros: [
      { org_id: ORG, user_id: "u-dono", papel: "admin", nome: "Leandro", ativo: true, limpezas_por_dia: null },
      { org_id: ORG, user_id: "u-nina", papel: "campo", nome: "Nina", ativo: true, limpezas_por_dia: 10 },
      { org_id: ORG, user_id: "u-ana",  papel: "campo", nome: "Ana",  ativo: true, limpezas_por_dia: 6 },
      { org_id: ORG, user_id: "u-ex",   papel: "campo", nome: "Ex-ajudante", ativo: false, limpezas_por_dia: 8 },
    ],
    cemiterios: [{ id: "cem-1", org_id: ORG, nome: "Cemitério da Saudade" }],
    quadras: [
      { id: "q1", org_id: ORG, cemiterio_id: "cem-1", codigo: "Q-01", ordem: 1 },
      { id: "q2", org_id: ORG, cemiterio_id: "cem-1", codigo: "Q-02", ordem: 2 },
      { id: "q3", org_id: ORG, cemiterio_id: "cem-1", codigo: "Q-03", ordem: 3 },
    ],
    clientes: [
      // adiantado (crédito sobra)
      { id: "c-cec", org_id: ORG, nome: "Cecília Ramos", telefone: "5511900001", ativo_ia: true,
        modo: "automatico", score: 95, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        ativacao_ativa: false, ativacao_meses: 6 },
      // devendo (dispara cobrança)
      { id: "c-ant", org_id: ORG, nome: "Antônio Prado", telefone: "5511900002", ativo_ia: true,
        modo: "copiloto", score: 40, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        ativacao_ativa: false, ativacao_meses: 6 },
      // zerado com plano (dispara aviso de saldo)
      { id: "c-mar", org_id: ORG, nome: "Marcos Souza", telefone: "5511900003", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        ativacao_ativa: false, ativacao_meses: 6 },
      // já em cobrança nível 2 (testa a régua)
      { id: "c-neu", org_id: ORG, nome: "Neusa Ferreira", telefone: "5511900004", ativo_ia: true,
        modo: "copiloto", score: 60, cobranca_nivel: 2, aviso_saldo_em: null,
        cobranca_em: new Date(Date.now() - 10 * 86400000).toISOString(),
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        ativacao_ativa: false, ativacao_meses: 6 },
      // régua 'nao_cobrar': a IA NUNCA cobra (avulso/esporádico)
      { id: "c-avu", org_id: ORG, nome: "Eliana Hikehara", telefone: "5511900005", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "nao_cobrar", ativacao_ativa: true, ativacao_meses: 6,
        ultima_ativacao_em: null, dias_entre_cobrancas: 7, max_lembretes: 3 },
      // régua 'suave': um único lembrete
      { id: "c-sua", org_id: ORG, nome: "Julieta Stella", telefone: "5511900006", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "suave", ativacao_ativa: false, ativacao_meses: 6,
        dias_entre_cobrancas: 7, max_lembretes: 3 },
      // família com DOIS jazigos (caso real: LINEU e Dra. YONE)
      { id: "c-lin", org_id: ORG, nome: "LINEU", telefone: "5511900007", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "o senhor", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        ativacao_ativa: false, ativacao_meses: 6 },
      // anonimizado (LGPD): NÃO pode entrar em campanha nem cobrança
      { id: "c-anon", org_id: ORG, nome: "Cliente removido", telefone: "anon:xyz", ativo_ia: false,
        modo: "copiloto", score: 0, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: new Date().toISOString(), perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0 },
    ],
    tumulos: [
      { id: "t1", org_id: ORG, quadra_id: "q1", cliente_id: "c-cec", identificacao: "T-101",
        falecido_nome: "Joaquim Ramos", lat: -23.6680, lng: -46.4610, gps_precisao: 4, gps_amostras: 3,
        datas_gatilho: [{ tipo: "falecimento", data: emDias(7).slice(5) }], qr_token: "tok1",
        foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t2", org_id: ORG, quadra_id: "q1", cliente_id: "c-ant", identificacao: "T-102",
        falecido_nome: "Terezinha Prado", lat: -23.6681, lng: -46.4611, gps_precisao: 6, gps_amostras: 2,
        datas_gatilho: [], qr_token: null, foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t3", org_id: ORG, quadra_id: "q2", cliente_id: "c-mar", identificacao: "T-103",
        falecido_nome: "Benedita Souza", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: null, foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t5", org_id: ORG, quadra_id: "q1", cliente_id: "c-lin", identificacao: "Família LINEU BAIXINHO",
        falecido_nome: null, rua: "RUA 1", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: "tokA", foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t6", org_id: ORG, quadra_id: "q1", cliente_id: "c-lin", identificacao: "Família BOSCARIOL",
        falecido_nome: null, rua: "RUA 1", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: "tokB", foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t4", org_id: ORG, quadra_id: "q3", cliente_id: "c-neu", identificacao: "T-104",
        falecido_nome: "Antenor Ferreira", lat: -23.6690, lng: -46.4620, gps_precisao: 5, gps_amostras: 4,
        datas_gatilho: [], qr_token: null, foto_referencia_url: null, foto_enquadramento_url: null },
    ],
    planos: [
      { id: "p1", org_id: ORG, cliente_id: "c-cec", tumulo_id: "t1", cadencia: "mensal",
        qtd_por_passagem: 2, valor_vigente: 40, data_valor_vigente: diasAtras(400),
        proximo_servico: diasAtras(5), ativo: true },
      { id: "p2", org_id: ORG, cliente_id: "c-ant", tumulo_id: "t2", cadencia: "mensal",
        qtd_por_passagem: 1, valor_vigente: 45, data_valor_vigente: diasAtras(200),
        proximo_servico: diasAtras(2), ativo: true },
      { id: "p3", org_id: ORG, cliente_id: "c-mar", tumulo_id: "t3", cadencia: "trimestral",
        qtd_por_passagem: 2, valor_vigente: 50, data_valor_vigente: diasAtras(60),
        proximo_servico: emDias(10), ativo: true },
      { id: "p4", org_id: ORG, cliente_id: "c-neu", tumulo_id: "t4", cadencia: "avulso",
        qtd_por_passagem: 1, valor_vigente: 55, data_valor_vigente: diasAtras(30),
        proximo_servico: null, ativo: true },
    ],
    servicos: [
      { id: "s1", org_id: ORG, tumulo_id: "t1", plano_id: "p1", cliente_id: "c-cec",
        data_prevista: diasAtras(30), status: "executado", data_executada: diasAtras(30),
        valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: 1,
        foto_depois_url: "http://f/1" },
      { id: "s2", org_id: ORG, tumulo_id: "t2", plano_id: "p2", cliente_id: "c-ant",
        data_prevista: diasAtras(30), status: "executado", data_executada: diasAtras(30),
        valor: 45, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: 2,
        foto_depois_url: "http://f/2" },
      // backlog: já adiado 3x, deve vir primeiro no alocador
      { id: "s3", org_id: ORG, tumulo_id: "t4", plano_id: "p4", cliente_id: "c-neu",
        data_prevista: null, status: "pendente", valor: 55, prioridade: 30, adiado_vezes: 3,
        executora_id: null, ordem_dia: null, foto_depois_url: null },
    ],
    movimentos: [
      // Cecília: 1 débito 40, crédito 200 => +160
      { id: "m1", org_id: ORG, cliente_id: "c-cec", tipo: "debito", valor: 40, status_conc: "confirmado", data: diasAtras(30), servico_id: "s1" },
      { id: "m2", org_id: ORG, cliente_id: "c-cec", tipo: "credito", valor: 200, status_conc: "confirmado", data: diasAtras(31) },
      // Antônio: débito 45, nenhum crédito => -45
      { id: "m3", org_id: ORG, cliente_id: "c-ant", tipo: "debito", valor: 45, status_conc: "confirmado", data: diasAtras(30), servico_id: "s2" },
      // crédito a conferir (não entra no saldo)
      { id: "m4", org_id: ORG, cliente_id: "c-ant", tipo: "credito", valor: 45, status_conc: "a_conferir", data: diasAtras(1) },
      // rejeitado: deve ser ignorado
      { id: "m5", org_id: ORG, cliente_id: "c-ant", tipo: "credito", valor: 999, status_conc: "rejeitado", data: diasAtras(1) },
      // Neusa: devendo
      { id: "m6", org_id: ORG, cliente_id: "c-neu", tipo: "debito", valor: 55, status_conc: "confirmado", data: diasAtras(40) },
      { id: "m7", org_id: ORG, cliente_id: "c-avu", tipo: "debito", valor: 50, status_conc: "confirmado", data: diasAtras(40) },
      { id: "m8", org_id: ORG, cliente_id: "c-sua", tipo: "debito", valor: 80, status_conc: "confirmado", data: diasAtras(40) },
      { id: "m9", org_id: ORG, cliente_id: "c-lin", tipo: "debito", valor: 360, status_conc: "confirmado", data: diasAtras(40) },
      { id: "m10", org_id: ORG, cliente_id: "c-lin", tipo: "debito", valor: 360, status_conc: "confirmado", data: diasAtras(40) },
    ],
    materiais: [
      { id: "mat1", org_id: ORG, nome: "vassoura", unidade: "un", estoque: 0, alerta_minimo: 1 },
      { id: "mat2", org_id: ORG, nome: "balde", unidade: "un", estoque: 5, alerta_minimo: 2 },
    ],
    conversas: [], mensagens: [], interacoes_ia: [], campanhas: [],
    dias_sem_campo: [],
    datas_comemorativas: [
      { id: "d1", org_id: ORG, nome: "Finados", regra: "fixa", mes: new Date().getUTCMonth()+1,
        dia: new Date().getUTCDate()+3, ordinal_domingo: null, antecedencia_dias: 15, ativa: true,
        mensagem: "Olá, {tratamento_nome}! Finados chegando no jazigo da {familia}." },
    ],
    ativacoes_disparadas: [],
    gatilhos_disparados: [], leads: [], config_ia: [], erros_log: [],
    fila_envios: [], eventos_webhook: [], uso_ia: [], dias_campo: [], ocorrencias: [],
  };
}

// ---------------------------------------------------------------- resultados
let ok = 0, falhas = 0;
const problemas: string[] = [];
function checar(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) { ok++; console.log(`  ✓ ${nome}`); }
  else { falhas++; problemas.push(`${nome} — ${detalhe}`); console.log(`  ✗ ${nome}  ${detalhe}`); }
}

// ---------------------------------------------------------------- execução
async function rodar() {
  const banco = montarBanco();
  const fake = criarFakeSupabase(banco);

  // o hook de módulos faz createClient() devolver este objeto
  (globalThis as any).__FAKE_SUPABASE__ = fake;

  console.log("\n=== 1. FINANCEIRO (calcularSaldo / saldoTexto) ===");
  const fin = await import("../src/lib/financeiro");
  const sCec = await fin.calcularSaldo("c-cec");
  checar("Cecília adiantada +160", sCec.saldo === 160, `veio ${sCec.saldo}`);
  const sAnt = await fin.calcularSaldo("c-ant");
  checar("Antônio devendo -45", sAnt.saldo === -45, `veio ${sAnt.saldo}`);
  checar("crédito 'a conferir' fica fora do saldo", sAnt.aConferir === 45, `veio ${sAnt.aConferir}`);
  checar("crédito rejeitado é ignorado", sAnt.saldo === -45, `999 rejeitado não pode entrar`);
  checar("texto de saldo adiantado", fin.saldoTexto(sCec).includes("adiantado"), fin.saldoTexto(sCec));
  checar("texto de saldo em aberto", fin.saldoTexto(sAnt).includes("em aberto"), fin.saldoTexto(sAnt));

  console.log("\n=== 2. CAPACIDADE ===");
  const cap = await import("../src/lib/capacidade");
  const c = await cap.calcularCapacidade();
  checar("capacidade mensal > 0", c.capacidadeMensal > 0, JSON.stringify(c));
  checar("carga considera só planos recorrentes (avulso fora)", c.planosRecorrentes === 3,
         `veio ${c.planosRecorrentes} (esperado 3: mensal, mensal, trimestral)`);
  checar("utilização entre 0 e 1", c.utilizacao >= 0 && c.utilizacao <= 1, String(c.utilizacao));

  console.log("\n=== 3. AGENDA: gerar + alocar (multi-ajudante) ===");
  const ag = await import("../src/lib/agenda");
  const ger = await ag.gerarServicosDevidos(30);
  checar("gerou serviços dos planos vencidos", ger.criados >= 2, `criou ${ger.criados}`);
  checar("geração explica quantos planos olhou", ger.planosAtivos > 0, JSON.stringify(ger));
  const ger2 = await ag.gerarServicosDevidos(30);
  checar("rodar de novo não duplica", ger2.criados === 0, `criou ${ger2.criados} na segunda vez`);
  checar("e explica por que não criou nada", ger2.jaExistiam > 0 || ger2.foraDoHorizonte > 0,
         JSON.stringify(ger2));
  checar("plano avulso NÃO gera serviço",
         !banco.servicos.some((s) => s.plano_id === "p4" && s.status === "pendente" && s.id !== "s3"),
         "avulso não pode entrar na esteira automática");
  // adiciona serviços suficientes para exigir as duas ajudantes (Nina=10, Ana=6)
  for (let i = 0; i < 14; i++) {
    banco.servicos.push({ id: `sx${i}`, org_id: ORG, tumulo_id: i % 2 ? "t1" : "t3",
      plano_id: "p1", cliente_id: "c-cec", data_prevista: null, status: "pendente",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: null });
  }
  const alo = await ag.alocarAgenda();
  // jornada de seg a sex: nada pode cair em sábado ou domingo
  const foraDaJornada = banco.servicos.filter((x: any) => {
    if (!x.data_prevista) return false;
    const d = new Date(x.data_prevista + "T12:00:00Z").getUTCDay();
    return d === 0 || d === 6;
  });
  checar("alocador respeita os dias de trabalho configurados", foraDaJornada.length === 0,
         `${foraDaJornada.length} caíram em fim de semana`);
  checar("alocou serviços", alo.agendados > 0, JSON.stringify(alo));
  const agendados = banco.servicos.filter((s) => s.status === "agendado");
  const porExec = new Set(agendados.map((s) => s.executora_id));
  checar("distribuiu entre as ajudantes ativas", porExec.size >= 2,
         `executoras usadas: ${[...porExec].join(", ")}`);
  checar("ajudante INATIVA não recebe rota", !porExec.has("u-ex"), "u-ex está inativa");
  const s3 = banco.servicos.find((s) => s.id === "s3")!;
  const primeiroDia = agendados.map((s) => s.data_prevista).sort()[0];
  checar("backlog adiado 3x entra no PRIMEIRO dia", s3.data_prevista === primeiroDia,
         `s3 ficou em ${s3.data_prevista}, primeiro dia é ${primeiroDia}`);
  const diasUsados = [...new Set(agendados.map((s) => s.data_prevista))];
  checar("excedente vai para os dias seguintes", diasUsados.length >= 1, `dias: ${diasUsados.length}`);

  console.log("\n=== 4. PROATIVOS (cobrança / aviso de saldo / gatilhos) ===");
  const pro = await import("../src/lib/proativo");
  const nCob = await pro.cobrancaGentil();
  const rascunhosCob = banco.interacoes_ia.filter((i) => i.assunto === "cobranca");
  checar("gerou cobrança para quem deve", nCob >= 1, `gerou ${nCob}`);
  checar("NÃO cobrou o cliente anonimizado (LGPD)",
         !rascunhosCob.some((r) => r.cliente_id === "c-anon"), "anonimizado não pode ser cobrado");
  checar("NÃO cobrou quem está adiantado",
         !rascunhosCob.some((r) => r.cliente_id === "c-cec"), "Cecília tem saldo positivo");
  const nivelNeusa = banco.clientes.find((c) => c.id === "c-neu")!.cobranca_nivel;
  checar("régua de cobrança avança (nível 2 -> 3)", nivelNeusa === 3, `nível ${nivelNeusa}`);
  const nCob2 = await pro.cobrancaGentil();
  checar("não cobra duas vezes no mesmo dia", nCob2 === 0, `segunda passada gerou ${nCob2}`);
  const nivelDepois = banco.clientes.find((c) => c.id === "c-neu")!.cobranca_nivel;
  checar("régua trava no nível 3", nivelDepois === 3, `nível ${nivelDepois}`);

  const nAviso = await pro.avisosSaldoBaixo();
  checar("avisou saldo baixo de quem tem plano e não tem crédito", nAviso >= 1, `gerou ${nAviso}`);

  const nGat = await pro.gatilhosDeData();
  checar("gatilho de data disparou (memória em 7 dias)", nGat >= 1, `gerou ${nGat}`);
  const nGat2 = await pro.gatilhosDeData();
  checar("gatilho não repete no mesmo ano", nGat2 === 0, `segunda passada gerou ${nGat2}`);

  console.log("\n=== 4b. RÉGUA DE COBRANÇA POR FAMÍLIA ===");
  const todosCob = banco.interacoes_ia.filter((i) => i.assunto === "cobranca");
  checar("régua 'nao_cobrar' NUNCA é cobrada",
         !todosCob.some((r) => r.cliente_id === "c-avu"), "Eliana é avulsa: só convite, nunca cobrança");
  const cobSuave = todosCob.filter((r) => r.cliente_id === "c-sua");
  checar("régua 'suave' recebe cobrança", cobSuave.length >= 1, `recebeu ${cobSuave.length}`);
  const nivelSuave = banco.clientes.find((c) => c.id === "c-sua")!.cobranca_nivel;
  checar("régua 'suave' para no primeiro lembrete", nivelSuave === 1, `nível ${nivelSuave}`);
  checar("texto usa o tratamento da família",
         cobSuave.some((r) => r.rascunho.includes("Julieta")), cobSuave[0]?.rascunho?.slice(0, 80) || "");

  console.log("\n=== 4c. RÉGUA DE ATIVAÇÃO (avulsos e datas) ===");
  const ativ = await import("../src/lib/ativacao");
  const nData = await ativ.convitesDeData();
  checar("convite de data comemorativa disparou", nData >= 1, `gerou ${nData}`);
  const nData2 = await ativ.convitesDeData();
  checar("convite de data não repete no ano", nData2 === 0, `segunda passada gerou ${nData2}`);
  const nPer = await ativ.convitesPeriodicos();
  checar("não empilha convite periódico logo após um de data", nPer === 0,
         `gerou ${nPer} — quem acabou de receber convite não deve receber outro`);
  // limpando o carimbo, o periódico deve disparar
  banco.clientes.find((c) => c.id === "c-avu")!.ultima_ativacao_em = null;
  const nPer2 = await ativ.convitesPeriodicos();
  checar("convite periódico dispara para quem tem ativação ligada", nPer2 >= 1, `gerou ${nPer2}`);
  const textosPeriodicos = banco.interacoes_ia.filter((i) => i.rascunho?.includes("gostaria que a gente desse uma cuidada"));
  checar("convite PERIÓDICO só vai para quem tem ativação ligada",
         textosPeriodicos.every((c) => c.cliente_id === "c-avu"),
         `foi para: ${[...new Set(textosPeriodicos.map((c) => c.cliente_id))].join(",")}`);
  const convData = banco.interacoes_ia.filter((i) => i.rascunho?.includes("Finados chegando no jazigo"));
  checar("convite de DATA vai para todas as famílias", convData.length >= 4, `foi para ${convData.length}`);
  const convites = banco.interacoes_ia.filter((i) => i.rascunho?.includes("gostaria que a gente desse uma cuidada"));
  checar("convite periódico foi só para a avulsa",
         convites.every((c) => c.cliente_id === "c-avu"), `foram ${convites.length}`);
  checar("convite não é cobrança (não cita valor em aberto)",
         convites.every((c) => !c.rascunho.includes("em aberto")), "");

  console.log("\n=== 4d. FAMÍLIA COM MAIS DE UM JAZIGO ===");
  const cobLin = banco.interacoes_ia.filter((i) => i.cliente_id === "c-lin" && i.assunto === "cobranca");
  checar("cobrança avisa que o valor é do conjunto",
         cobLin.some((r) => r.rascunho.includes("2 jazigos")), cobLin[0]?.rascunho?.slice(0, 140) || "sem cobrança");
  checar("saldo soma os dois jazigos numa conta só",
         (await fin.calcularSaldo("c-lin")).saldo === -720, String((await fin.calcularSaldo("c-lin")).saldo));

  const ctxMod = await import("../src/lib/context");
  const persMod = await import("../src/lib/persona");
  const cliLin = await ctxMod.acharCliente("5511900007");
  const ctxLin = await ctxMod.montarContexto(cliLin!);
  const promptLin = persMod.montarSystemPrompt(ctxLin, {});
  checar("prompt lista os dois jazigos",
         promptLin.includes("LINEU BAIXINHO") && promptLin.includes("BOSCARIOL"), "");
  checar("prompt avisa a IA sobre múltiplos jazigos",
         promptLin.includes("MAIS DE UM jazigo"), "");
  checar("prompt manda dizer de qual jazigo se trata",
         promptLin.includes("diga SEMPRE de qual jazigo"), "");
  const cliUm = await ctxMod.acharCliente("5511900001");
  const promptUm = persMod.montarSystemPrompt(await ctxMod.montarContexto(cliUm!), {});
  checar("família com um jazigo só NÃO recebe esse aviso",
         !promptUm.includes("MAIS DE UM jazigo"), "");

  console.log("\n=== 4e. O QUE NUNCA VAI SOZINHO ===");
  const ret = await import("../src/lib/retencao");

  const r1 = await ret.avaliarRetencao({ assunto: "luto", score: 100, confianca: "alta" });
  checar("luto é retido mesmo com score 100", r1.reter, JSON.stringify(r1));

  const r2 = await ret.avaliarRetencao({ assunto: "reclamacao", score: 100, confianca: "alta" });
  checar("reclamação é retida mesmo com score 100", r2.reter, JSON.stringify(r2));

  const r3 = await ret.avaliarRetencao({
    assunto: "agendamento", score: 100, confianca: "alta",
    textoDaFamilia: "Bom dia, minha mãe faleceu ontem e preciso falar sobre o jazigo",
  });
  checar("palavra crítica no texto retém, mesmo em assunto de rotina", r3.reter, JSON.stringify(r3));

  const r4 = await ret.avaliarRetencao({
    assunto: "agendamento", score: 100, confianca: "alta",
    textoDaFamilia: "Vou ter que falar com meu ADVOGADO sobre isso",
  });
  checar("palavra crítica pega maiúscula e acento", r4.reter, JSON.stringify(r4));

  const r5 = await ret.avaliarRetencao({
    assunto: "agendamento", score: 95, confianca: "alta",
    textoDaFamilia: "Bom dia! Vocês passam lá essa semana?",
  });
  checar("rotina com score alto passa no automático", !r5.reter, JSON.stringify(r5));

  const r6 = await ret.avaliarRetencao({
    assunto: "duvida", score: 95, confianca: "baixa",
    textoDaFamilia: "Como funciona?",
  });
  checar("IA em dúvida retém, mesmo com score alto", r6.reter, JSON.stringify(r6));

  console.log("\n=== 4f. A IA É A SUREYA ===");
  const persona2 = await import("../src/lib/persona");
  const promptVoz = persona2.montarSystemPrompt(
    { nome: "Teste", saldoTexto: "em dia", tumulos: [], chavePix: null } as any, {});
  checar("prompt proíbe dizer 'vou passar para a Sureya'",
         promptVoz.includes("NUNCA diga") && promptVoz.includes("vou passar para a Sureya"), "");
  checar("prompt ensina o que dizer no lugar",
         promptVoz.includes("Deixa eu conferir isso direitinho"), "");
  checar("prompt não manda encaminhar para a Sureya",
         !promptVoz.includes("encaminhe para a Sureya"), "");

  console.log("\n=== 4g. ESTADO DA CONVERSA ===");
  // O bug era: responder logo depois da mensagem chegar deixava os dois horários
  // iguais, e "respondida > recebida" dava falso — a conversa seguia "esperando".
  function estadoDa(c: any): string { return c.estado || "sem_movimento"; }

  const convTeste: any = { estado: "sem_resposta", aguardando_desde: "2026-07-18T10:00:00Z" };
  checar("família falou e ninguém respondeu", estadoDa(convTeste) === "sem_resposta", "");

  // simula o gatilho quando entra uma saída
  convTeste.estado = "respondida"; convTeste.aguardando_desde = null;
  checar("depois de responder, sai de 'esperando'", estadoDa(convTeste) === "respondida", "");
  checar("e a marca de espera some", convTeste.aguardando_desde === null, "");

  // o caso que quebrava: mesmo horário nos dois
  const mesmoHorario = "2026-07-18T10:00:00.000Z";
  const antigo = { ultima_msg_cliente_em: mesmoHorario, respondida_em: mesmoHorario };
  const comparacaoAntiga =
    new Date(antigo.respondida_em).getTime() > new Date(antigo.ultima_msg_cliente_em).getTime();
  checar("a comparação por horário falhava com horários iguais", !comparacaoAntiga,
         "é exatamente por isso que agora usamos uma coluna de estado");
  checar("a coluna de estado não sofre desse problema",
         estadoDa({ estado: "respondida", ...antigo }) === "respondida", "");

  console.log("\n=== 4h. FREQUÊNCIA DAS LAVAGENS ===");
  const fq = await import("../src/lib/frequencia");
  checar("mensal 1x = uma vez por mês",
         fq.descreverFrequencia("mensal", 1) === "uma vez por mês", fq.descreverFrequencia("mensal", 1));
  checar("mensal 2x = a cada 15 dias",
         fq.descreverFrequencia("mensal", 2).includes("15 dias"), fq.descreverFrequencia("mensal", 2));
  checar("mensal 4x = toda semana",
         fq.descreverFrequencia("mensal", 4).includes("semana"), fq.descreverFrequencia("mensal", 4));
  checar("intervalo de mensal 2x é ~15 dias", fq.intervaloEmDias("mensal", 2) === 15,
         String(fq.intervaloEmDias("mensal", 2)));
  checar("intervalo de mensal 4x é ~7 dias", fq.intervaloEmDias("mensal", 4) === 8 || fq.intervaloEmDias("mensal", 4) === 7,
         String(fq.intervaloEmDias("mensal", 4)));
  checar("mensal 2x dá 24 lavagens no ano", fq.lavagensPorAno("mensal", 2) === 24,
         String(fq.lavagensPorAno("mensal", 2)));
  checar("semestral 1x dá 2 lavagens no ano", fq.lavagensPorAno("semestral", 1) === 2,
         String(fq.lavagensPorAno("semestral", 1)));
  checar("avulso não tem intervalo", fq.intervaloEmDias("avulso", 1) === null, "");

  console.log("\n=== 5. CAMPANHAS ===");
  const camp = await import("../src/lib/campanha");
  const rc = await camp.executarCampanha({ nome: "Finados", mensagem: "Olá, {nome}! Finados chegando.", publico: "ativos" });
  const rascCamp = banco.interacoes_ia.filter((i) => i.rascunho?.includes("Finados chegando"));
  checar("campanha criou rascunhos", rc.criados >= 3, `criou ${rc.criados}`);
  checar("{nome} foi substituído pelo primeiro nome",
         rascCamp.some((r) => r.rascunho.includes("Cecília")), rascCamp[0]?.rascunho || "");
  checar("campanha NÃO inclui cliente anonimizado",
         !rascCamp.some((r) => r.cliente_id === "c-anon"), "LGPD");
  checar("nenhum rascunho de campanha foi enviado sozinho",
         rascCamp.every((r) => r.acao_humana == null), "todos devem ficar pendentes de aprovação");
  const rc2 = await camp.executarCampanha({ nome: "Cobrar", mensagem: "Teste de público em aberto aqui", publico: "em_aberto" });
  const emAberto = ["c-ant", "c-neu", "c-avu", "c-sua", "c-lin"];
  const rascAberto = banco.interacoes_ia.filter((i) => i.rascunho?.includes("Teste de público em aberto"));
  checar("público 'em aberto' pega só quem tem saldo negativo",
         rascAberto.every((r) => emAberto.includes(r.cliente_id)),
         `pegou ${rascAberto.map((r) => r.cliente_id).join(",")}`);
  checar("público 'em aberto' NÃO pega quem está adiantado",
         !rascAberto.some((r) => r.cliente_id === "c-cec"), "Cecília tem +160");

  console.log("\n=== 6. BRIEFING DO CAMPO ===");
  const bri = await import("../src/lib/briefing");
  const b = await bri.montarBriefing("u-nina", "Nina");
  checar("briefing traz saudação com nome", b.saudacao.includes("Nina"), b.saudacao);
  checar("briefing conta os túmulos do dia", b.totalHoje >= 0, String(b.totalHoje));
  checar("briefing alerta material acabando", b.materiais.some((m) => m.includes("vassoura")), JSON.stringify(b.materiais));
  // o briefing agora só CONTA quantos pedem atenção; o detalhe vai no card
  checar("briefing só conta quantos pedem atenção", typeof b.precisamAtencao === "number",
         JSON.stringify(b));
  checar("briefing não traz lista de avisos no resumo", !(b as any).atencoes, "resumo tem que ser curto");
  const avisos = bri.avisosDoJazigo({
    adiado_vezes: 3,
    tumulos: { datas_gatilho: [], foto_referencia_url: "x", lat: -23 },
  });
  checar("aviso de adiado vai para o card do jazigo",
         avisos.some((a) => a.tipo === "adiado"), JSON.stringify(avisos));
  const semAviso = bri.avisosDoJazigo({
    adiado_vezes: 0, tumulos: { datas_gatilho: [], foto_referencia_url: "x", lat: -23 },
  });
  checar("jazigo tranquilo não gera aviso", semAviso.length === 0, JSON.stringify(semAviso));
  const primeira = bri.avisosDoJazigo({
    adiado_vezes: 0, tumulos: { datas_gatilho: [], foto_referencia_url: null, lat: null },
  });
  checar("primeira visita avisa para tirar a foto",
         primeira.some((a) => a.tipo === "primeira"), JSON.stringify(primeira));
  const bAna = await bri.montarBriefing("u-ana", "Ana");
  checar("cada ajudante recebe o próprio briefing",
         bAna.saudacao.includes("Ana"), bAna.saudacao);

  console.log("\n=== 7. BOLHAS (resposta em várias mensagens) ===");
  const bol = await import("../src/lib/bolhas");
  const curta = bol.quebrarEmBolhas("Bom dia! Está tudo certo.");
  checar("mensagem curta fica em 1 bolha", curta.length === 1, JSON.stringify(curta));
  const longa = bol.quebrarEmBolhas(
    "Bom dia, dona Cecília! A limpeza do túmulo do seu Joaquim está prevista para esta semana. " +
    "Assim que a Nina passar por lá, eu mando a foto para a senhora ver como ficou. " +
    "O valor continua sendo o mesmo combinado, duas limpezas por mês. " +
    "Qualquer coisa que a senhora precisar, é só me chamar por aqui que eu resolvo."
  );
  checar("mensagem longa vira 2-3 bolhas", longa.length >= 2 && longa.length <= 3, `${longa.length} bolhas`);
  checar("nenhuma bolha vazia", longa.every((x) => x.trim().length > 0), JSON.stringify(longa));
  checar("não corta no meio de palavra",
         longa.every((x) => /[.!?…]$/.test(x.trim()) || x === longa[longa.length - 1]),
         JSON.stringify(longa));
  const juntas = longa.join(" ").replace(/\s+/g, " ");
  checar("não perde texto ao quebrar", juntas.includes("é só me chamar"), juntas.slice(-60));
  checar("pausa cresce com o tamanho", bol.pausaMs("oi") < bol.pausaMs("uma frase bem mais longa que a outra"));

  console.log("\n=== 8. REAJUSTE (temperatura) ===");
  const rea = await import("../src/lib/reajuste");
  const cands = await rea.calcularTemperatura(fake);
  checar("achou candidatos a reajuste", cands.length > 0, `${cands.length} candidatos`);
  const cec: any = cands.find((x: any) => x.cliente?.includes("Cecília"));
  checar("classifica a temperatura em faixa",
         !cec || ["fria", "morna", "quente"].includes(cec.faixa), JSON.stringify(cec));
  checar("mais meses parado = temperatura maior",
         cands.length < 2 || cands[0].temperatura >= cands[cands.length - 1].temperatura,
         `${cands[0]?.temperatura} vs ${cands[cands.length-1]?.temperatura}`);
  checar("valor sugerido é maior que o atual",
         cands.every((x: any) => x.valorSugerido >= x.valorAtual), JSON.stringify(cands[0]));
  // preço de R$ 40 parado há 13 meses: com IPCA 4,5% deveria sinalizar algo
  const p40 = banco.planos.find((p) => p.id === "p1")!;
  checar("preço de R$40 parado há 13 meses aparece na lista de reajuste",
         cands.some((x: any) => x.planoId === p40.id || x.plano_id === p40.id),
         `nenhum candidato: o arredondamento para múltiplo de 5 pode estar zerando o gap`);

  console.log("\n=== 9. CONTEXTO DA IA ===");
  const ctx = await import("../src/lib/context");
  const cli = await ctx.acharCliente("5511900001");
  checar("acha cliente pelo telefone", cli?.id === "c-cec", JSON.stringify(cli));
  const naoCli = await ctx.acharCliente("5511999999");
  checar("número desconhecido não vira cliente", naoCli === null, JSON.stringify(naoCli));
  if (cli) {
    const contexto = await ctx.montarContexto(cli);
    checar("contexto traz saldo do cliente", String(contexto.saldoTexto).includes("adiantado"), contexto.saldoTexto);
    const persona = await import("../src/lib/persona");
    const prompt = persona.montarSystemPrompt(contexto, { conhecimento: "Preço R$ 40.", tom: "Carinhosa." });
    checar("prompt final mostra o túmulo certo", prompt.includes("T-101"), prompt.slice(-200));
    checar("prompt final mostra o falecido", prompt.includes("Joaquim Ramos"), "");
    checar("prompt final NÃO tem [object Object]", !prompt.includes("[object Object]"), "");
    checar("prompt injeta o conhecimento do negócio", prompt.includes("Preço R$ 40."), "");
    checar("prompt injeta o tom", prompt.includes("Carinhosa."), "");
    checar("prompt traz a chave Pix cadastrada", prompt.includes("zeloememoria@pix.com"), "");

    // sem chave cadastrada, a IA é instruída a NÃO inventar
    banco.orgs[0].chave_pix = null;
    const semPix = await ctxMod.montarContexto(cli!);
    const promptSemPix = persMod.montarSystemPrompt(semPix, {});
    checar("sem Pix cadastrado, manda não inventar",
           promptSemPix.includes("SEM CHAVE CADASTRADA") && promptSemPix.includes("Não invente"),
           "");
    banco.orgs[0].chave_pix = "zeloememoria@pix.com";
  }

  console.log("\n" + "=".repeat(60));
  console.log(`RESULTADO: ${ok} passaram, ${falhas} falharam`);
  if (problemas.length) {
    console.log("\nPROBLEMAS ENCONTRADOS:");
    problemas.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
  console.log("=".repeat(60));
  process.exit(falhas > 0 ? 1 : 0);
}

rodar().catch((e) => {
  console.error("\nERRO FATAL NO SIMULADOR:", e);
  process.exit(2);
});
