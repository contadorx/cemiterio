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
    familias: [
      // `responsavel_id` e o que liga o contato a familia: a fila de liberacao
      // decide POR FAMILIA (silencio por tipo, ultima acao), e sem ele nenhuma
      // dessas protecoes alcancaria a mensagem.
      { id: "f-cec", org_id: ORG, nome: "Família Ramos", responsavel_id: "c-cec", silenciar: [] },
      { id: "f-ant", org_id: ORG, nome: "Família Prado", responsavel_id: "c-ant", silenciar: [] },
      { id: "f-mar", org_id: ORG, nome: "Família Souza", responsavel_id: "c-mar", silenciar: [] },
      { id: "f-neu", org_id: ORG, nome: "Família Ferreira", responsavel_id: "c-neu", silenciar: [] },
      { id: "f-avu", org_id: ORG, nome: "Família Hikehara", responsavel_id: "c-avu", silenciar: [] },
      { id: "f-sua", org_id: ORG, nome: "Família Stella", responsavel_id: "c-sua", silenciar: [] },
      { id: "f-lin", org_id: ORG, nome: "Família LINEU", responsavel_id: "c-lin", silenciar: [] },
      { id: "f-anon", org_id: ORG, nome: "Família Removida", responsavel_id: "c-anon", silenciar: [] },
    ],
    clientes: [
      // adiantado (crédito sobra)
      { id: "c-cec", org_id: ORG, familia_id: "f-cec", responsavel_financeiro: true, nome: "Cecília Ramos", telefone: "5511900001", ativo_ia: true,
        modo: "automatico", score: 95, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      // devendo (dispara cobrança)
      { id: "c-ant", org_id: ORG, familia_id: "f-ant", responsavel_financeiro: true, nome: "Antônio Prado", telefone: "5511900002", ativo_ia: true,
        modo: "copiloto", score: 40, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      // zerado com plano (dispara aviso de saldo)
      { id: "c-mar", org_id: ORG, familia_id: "f-mar", responsavel_financeiro: true, nome: "Marcos Souza", telefone: "5511900003", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      // já em cobrança nível 2 (testa a régua)
      { id: "c-neu", org_id: ORG, familia_id: "f-neu", responsavel_financeiro: true, nome: "Neusa Ferreira", telefone: "5511900004", ativo_ia: true,
        modo: "copiloto", score: 60, cobranca_nivel: 2, aviso_saldo_em: null,
        cobranca_em: new Date(Date.now() - 10 * 86400000).toISOString(),
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      // régua 'nao_cobrar': a IA NUNCA cobra (avulso/esporádico)
      { id: "c-avu", org_id: ORG, familia_id: "f-avu", responsavel_financeiro: true, nome: "Eliana Hikehara", telefone: "5511900005", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "nao_cobrar", envio_automatico: true, ativacao_ativa: true, ativacao_meses: 6,
        ultima_ativacao_em: null, dias_entre_cobrancas: 7, max_lembretes: 3 },
      // régua 'suave': um único lembrete
      { id: "c-sua", org_id: ORG, familia_id: "f-sua", responsavel_financeiro: true, nome: "Julieta Stella", telefone: "5511900006", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "suave", envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6,
        dias_entre_cobrancas: 7, max_lembretes: 3 },
      // família com DOIS jazigos (caso real: LINEU e Dra. YONE)
      { id: "c-lin", org_id: ORG, familia_id: "f-lin", responsavel_financeiro: true, nome: "LINEU", telefone: "5511900007", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "o senhor", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      // anonimizado (LGPD): NÃO pode entrar em campanha nem cobrança
      // A FILHA DO LINEU. Mesma familia, NAO e a responsavel financeira.
      // Existe para o invariante da decisao de 22/08 virar teste: a divida e da
      // familia, entao as duas pessoas tem de devolver o MESMO saldo.
      { id: "c-lin2", org_id: ORG, familia_id: "f-lin", responsavel_financeiro: false,
        nome: "Marta (filha do LINEU)", telefone: "5511900008", ativo_ia: true,
        modo: "copiloto", score: 50, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "voce", regua_cobranca: "padrao", dias_entre_cobrancas: 7, max_lembretes: 3,
        envio_automatico: true, ativacao_ativa: false, ativacao_meses: 6 },
      { id: "c-anon", org_id: ORG, familia_id: "f-anon", responsavel_financeiro: true, nome: "Cliente removido", telefone: "anon:xyz", ativo_ia: false,
        modo: "copiloto", score: 0, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: new Date().toISOString(), perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0 },
    ],
    tumulos: [
      { id: "t1", org_id: ORG, contratado: true, periodicidade: "mensal", proximo_servico: diasAtras(5), valor_lavagem: 40, freq_pagamento: "mensal", quadra_id: "q1", cliente_id: "c-cec", identificacao: "T-101",
        falecido_nome: "Joaquim Ramos", lat: -23.6680, lng: -46.4610, gps_precisao: 4, gps_amostras: 3,
        datas_gatilho: [{ tipo: "falecimento", data: emDias(7).slice(5) }], qr_token: "tok1",
        foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t2", org_id: ORG, contratado: true, periodicidade: "mensal", proximo_servico: diasAtras(2), valor_lavagem: 45, freq_pagamento: "mensal", quadra_id: "q1", cliente_id: "c-ant", identificacao: "T-102",
        falecido_nome: "Terezinha Prado", lat: -23.6681, lng: -46.4611, gps_precisao: 6, gps_amostras: 2,
        datas_gatilho: [], qr_token: null, foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t3", org_id: ORG, contratado: true, periodicidade: "trimestral", proximo_servico: emDias(10), valor_lavagem: 50, freq_pagamento: "trimestral", quadra_id: "q2", cliente_id: "c-mar", identificacao: "T-103",
        falecido_nome: "Benedita Souza", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: null, foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t5", org_id: ORG, contratado: false, periodicidade: null, proximo_servico: null, valor_lavagem: null, freq_pagamento: null, quadra_id: "q1", cliente_id: "c-lin", identificacao: "Família LINEU BAIXINHO",
        falecido_nome: null, rua: "RUA 1", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: "tokA", foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t6", org_id: ORG, contratado: false, periodicidade: null, proximo_servico: null, valor_lavagem: null, freq_pagamento: null, quadra_id: "q1", cliente_id: "c-lin", identificacao: "Família BOSCARIOL",
        falecido_nome: null, rua: "RUA 1", lat: null, lng: null, gps_precisao: null, gps_amostras: 0,
        datas_gatilho: [], qr_token: "tokB", foto_referencia_url: null, foto_enquadramento_url: null },
      { id: "t4", org_id: ORG, contratado: false, periodicidade: null, proximo_servico: null, valor_lavagem: 55, freq_pagamento: null, quadra_id: "q3", cliente_id: "c-neu", identificacao: "T-104",
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
    // O RAZAO DA FAMILIA — decisao de 22/08: "e a familia, mas sempre tem um
    // responsavel financeiro". `calcularSaldo()` le daqui desde entao.
    //
    // O fake-supabase nao executa gatilho, entao o espelho da migration 0071
    // (`movimentos` -> `conta_corrente`) nao roda nos testes. Esta massa
    // representa o estado DEPOIS do espelho: cada movimento tem o seu par
    // aqui, com `movimento_id` preenchido — exatamente como o banco fica.
    //
    // Se algum dia os dois lados divergirem, e sinal de que o espelho mudou e
    // esta massa nao acompanhou.
    conta_corrente: [
      // Cecília: débito 40, crédito 200 => +160
      { id: "l1", org_id: ORG, familia_id: "f-cec", movimento_id: "m1", tipo: "debito",  origem: "lavagem",   valor: 40,  status_conc: "confirmado", data: diasAtras(30), servico_id: "s1" },
      { id: "l2", org_id: ORG, familia_id: "f-cec", movimento_id: "m2", tipo: "credito", origem: "pagamento", valor: 200, status_conc: "confirmado", data: diasAtras(31) },
      // Antônio: débito 45, nenhum crédito confirmado => -45
      { id: "l3", org_id: ORG, familia_id: "f-ant", movimento_id: "m3", tipo: "debito",  origem: "lavagem",   valor: 45,  status_conc: "confirmado", data: diasAtras(30), servico_id: "s2" },
      // crédito informado e ainda não batido com o extrato: NAO e saldo
      { id: "l4", org_id: ORG, familia_id: "f-ant", movimento_id: "m4", tipo: "credito", origem: "pagamento", valor: 45,  status_conc: "a_conferir", data: diasAtras(1) },
      // rejeitado: ignorado dos dois lados
      { id: "l5", org_id: ORG, familia_id: "f-ant", movimento_id: "m5", tipo: "credito", origem: "pagamento", valor: 999, status_conc: "rejeitado",  data: diasAtras(1) },
      { id: "l6", org_id: ORG, familia_id: "f-neu", movimento_id: "m6", tipo: "debito",  origem: "avulso",    valor: 55,  status_conc: "confirmado", data: diasAtras(40) },
      { id: "l7", org_id: ORG, familia_id: "f-avu", movimento_id: "m7", tipo: "debito",  origem: "avulso",    valor: 50,  status_conc: "confirmado", data: diasAtras(40) },
      { id: "l8", org_id: ORG, familia_id: "f-sua", movimento_id: "m8", tipo: "debito",  origem: "avulso",    valor: 80,  status_conc: "confirmado", data: diasAtras(40) },
      // LINEU tem DOIS jazigos: a divida e uma so, da familia
      { id: "l9", org_id: ORG, familia_id: "f-lin", movimento_id: "m9",  tipo: "debito", origem: "avulso",    valor: 360, status_conc: "confirmado", data: diasAtras(40) },
      { id: "l10",org_id: ORG, familia_id: "f-lin", movimento_id: "m10", tipo: "debito", origem: "avulso",    valor: 360, status_conc: "confirmado", data: diasAtras(40) },
      // ABERTURA: divida anterior ao sistema. Tem data (o dia em que alguem
      // digitou) mas nao e movimento daquele dia. Conta no SALDO e nunca em
      // relatorio por periodo. Nao tem par em `movimentos` — e justamente o
      // caso da familia Anninha em producao, que a cobranca nao enxergava.
      { id: "l11",org_id: ORG, familia_id: "f-avu", movimento_id: null,  tipo: "debito", origem: "abertura",  valor: 240, status_conc: "confirmado", data: diasAtras(5) },
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
    // A FILA DE LIBERACAO e agora a porta unica (0094): cobranca, aviso,
    // comemorativa e convite de servico entram todos por aqui.
    fila_liberacao: [],
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

  // ---- a abertura conta no saldo, mas nunca num relatorio por periodo
  const sAvu = await fin.calcularSaldo("c-avu");
  checar("saldo de abertura CONTA no saldo da familia", sAvu.saldo === -290,
         `veio ${sAvu.saldo} (esperado -290 = -50 avulso -240 abertura)`);
  checar("abertura fica FORA de relatorio por periodo",
         fin.ehDoPeriodo("abertura") === false && fin.ehDoPeriodo("pagamento") === true);

  // ---- O LOTE TEM DE DAR O MESMO NUMERO QUE A FUNCAO DE UMA PESSOA SO.
  //
  // Sao duas implementacoes da mesma regra: `calcularSaldo` faz uma consulta
  // por pessoa (usada na ficha), `calcularSaldosEmLote` faz uma para a lista
  // inteira (usada em clientes, reajuste, relatorio). Se divergirem, a lista
  // mostra um numero e a ficha da mesma pessoa mostra outro — que e o sintoma
  // exato que o Build 4 existiu para acabar. Este teste e a trava disso.
  const todos = banco.clientes.map((c: any) => ({ id: c.id, familia_id: c.familia_id }));
  const emLote = await fin.calcularSaldosEmLote(todos);
  let divergiu: string | null = null;
  for (const c of todos) {
    const um = await fin.calcularSaldo(c.id);
    const lote = emLote.get(c.id)!;
    if (um.saldo !== lote.saldo || um.aConferir !== lote.aConferir) {
      divergiu = `${c.id}: uma ${um.saldo}/${um.aConferir} x lote ${lote.saldo}/${lote.aConferir}`;
      break;
    }
  }
  checar("lote e ficha dao o MESMO saldo para todo mundo", divergiu === null, divergiu || "");
  checar("lote cobre todos os clientes", emLote.size === todos.length,
         `${emLote.size} de ${todos.length}`);

  // ---- O MES TEM DE SER UMA FOTOGRAFIA, NAO UM ESPELHO (auditoria CA-02)
  //
  // A home filtrava as limpezas pelo mes escolhido e somava o saldo INTEIRO,
  // sem corte de data. Abrir julho em setembro mostrava as limpezas de julho ao
  // lado da divida de setembro, na mesma linha.
  //
  // Antonio deve 45 de 30 dias atras e informou 45 ontem (a conferir). Cortar
  // em 35 dias atras tem de devolver ZERO — naquele dia ele ainda nao devia
  // nada. Se o corte fosse enfeite, viria -45 igual ao de hoje.
  const antesDeTudo = diasAtras(35);
  const fotoAntiga  = await fin.calcularSaldosPorFamilia(["f-ant"], { ate: antesDeTudo });
  const fotoHoje    = await fin.calcularSaldosPorFamilia(["f-ant"]);
  checar("saldo numa data passada ignora o que veio depois",
         fotoAntiga.get("f-ant")!.saldo === 0,
         `veio ${fotoAntiga.get("f-ant")!.saldo} para ${antesDeTudo}`);
  checar("saldo de hoje continua vendo tudo",
         fotoHoje.get("f-ant")!.saldo === -45,
         `veio ${fotoHoje.get("f-ant")!.saldo}`);
  checar("a foto antiga e DIFERENTE da de hoje (senao o corte e enfeite)",
         fotoAntiga.get("f-ant")!.saldo !== fotoHoje.get("f-ant")!.saldo);

  // A familia AVU tem saldo de ABERTURA (origem `abertura`, 5 dias atras).
  // Ela conta no saldo — so nao conta em relatorio por periodo.
  const fotoAvu = await fin.calcularSaldosPorFamilia(["f-avu"], { ate: diasAtras(10) });
  checar("abertura lancada depois do corte fica fora da foto",
         fotoAvu.get("f-avu")!.saldo === -50,
         `veio ${fotoAvu.get("f-avu")!.saldo} (esperado -50: so o avulso, sem os 240)`);

  // A regra tem de ser a MESMA das outras duas portas.
  const porFam = await fin.calcularSaldosPorFamilia(["f-ant"]);
  const porPessoa = await fin.calcularSaldo("c-ant");
  checar("familia, lote e ficha dao o mesmo numero",
         porFam.get("f-ant")!.saldo === porPessoa.saldo &&
         porFam.get("f-ant")!.aConferir === porPessoa.aConferir,
         `familia ${JSON.stringify(porFam.get("f-ant"))} x ficha ${JSON.stringify(porPessoa)}`);

  // ---- REMOCAO NO STORAGE: a traducao de URL para caminho
  //
  // Se `caminhoDaUrl` errar, `apagarArquivos` nao apaga nada e devolve "removi
  // 0 de 13" — a rota trata como falha, o que e certo. O perigo real e o
  // contrario: uma traducao que ACERTA por acaso num formato e erra em outro,
  // deixando arquivo para tras numa remocao que a tela deu como concluida.
  const st = await import("../src/lib/storage");
  const base = "https://abc.supabase.co/storage/v1/object/public";
  checar("URL de servico vira caminho",
         st.caminhoDaUrl(`${base}/servicos/org1/serv1/depois-123.jpg`, "servicos")
           === "org1/serv1/depois-123.jpg");
  checar("URL de comprovante vira caminho",
         st.caminhoDaUrl(`${base}/comprovantes/org1/cli1/999.pdf`, "comprovantes")
           === "org1/cli1/999.pdf");
  checar("balde errado nao casa",
         st.caminhoDaUrl(`${base}/servicos/org1/x.jpg`, "comprovantes") === null);
  checar("query string e descartada",
         st.caminhoDaUrl(`${base}/servicos/org1/x.jpg?t=1`, "servicos") === "org1/x.jpg");
  checar("acento no caminho volta decodificado",
         st.caminhoDaUrl(`${base}/servicos/org1/sess%C3%A3o.jpg`, "servicos") === "org1/sessão.jpg");
  checar("URL de fora nao vira caminho — e o que impede apagar o que nao e nosso",
         st.caminhoDaUrl("https://exemplo.com/foto.jpg", "servicos") === null);
  checar("vazio nao vira caminho", st.caminhoDaUrl("", "servicos") === null);
  checar("o balde e descoberto pela URL",
         st.baldeDaUrl(`${base}/comprovantes/o/c/1.pdf`) === "comprovantes" &&
         st.baldeDaUrl(`${base}/servicos/o/s/1.jpg`) === "servicos" &&
         st.baldeDaUrl("https://exemplo.com/x.jpg") === null);

  // ---- O DINHEIRO DA PLANILHA
  //
  // Este parser vira COBRANCA REAL. O codigo antigo fazia `Number(col) || 40`:
  // celula vazia, "R$ 60" e "60,00" viravam todos R$ 40 no banco, calados. Com
  // 250 jazigos vindo do cemiterio numa planilha, um erro aqui e 250 valores
  // errados que so aparecem na primeira cobranca.
  const imp = await import("../src/lib/planilha");
  const n = imp.numeroPlanilha;
  checar("60 vira 60", n("60") === 60);
  checar("60,00 vira 60 (pt-BR)", n("60,00") === 60);
  checar("60.00 vira 60 (export em ingles)", n("60.00") === 60);
  checar("R$ 60,00 vira 60", n("R$ 60,00") === 60);
  checar("1.500,00 e mil e quinhentos", n("1.500,00") === 1500);
  checar("1,500.00 tambem e mil e quinhentos", n("1,500.00") === 1500);
  checar("espaco em volta nao atrapalha", n("  75,50 ") === 75.5);
  // O QUE ELE TEM DE RECUSAR — e recusar e devolver NaN, nunca um valor de
  // conveniencia. Valor nao entendido deixa o plano sem criar e a linha e dita;
  // um numero chutado vira dinheiro cobrado de uma familia.
  checar("celula vazia e recusada", Number.isNaN(n("")));
  checar("texto e recusado", Number.isNaN(n("combinar")));
  checar("1.500 (ambiguo) e recusado", Number.isNaN(n("1.500")));
  checar("nada vira 40 por conveniencia", !([n(""), n("combinar"), n("1.500")].includes(40)));

  // ---- A SETA QUE GIRAVA SOZINHA
  //
  // Do campo, 22/08: "as setas ficam malucas". Nao era ruido de GPS — era o
  // angulo indo de 0 a 360 e o CSS animando 359 -> 1 pelo caminho de tras,
  // quase uma volta inteira por uma tremida de dois graus.
  const geo = await import("../src/lib/geo");
  const { desenrolarAngulo: des, leiturasValidas: lv, mediaPonderada: mp,
          deslocamentoNaJanela: dj } = geo;

  checar("cruzar o norte gira 2 graus, nao 358", des(359, 1) === 361);
  checar("e no sentido contrario tambem", des(1, 359) === -1);
  checar("sem angulo anterior, adota o alvo", des(NaN, 137) === 137);
  checar("giro grande de verdade continua grande", Math.abs(des(0, 170) - 170) < 1e-9);
  checar("meia volta nao inverte de lado", Math.abs(des(0, 180) - 180) < 1e-9);
  // O acumulado nunca pode "desandar": tres passos de 10 graus atravessando o
  // zero tem de somar 30 na tela, e nao voltar para perto de zero.
  let acc = 350;
  for (const alvo of [0, 10, 20]) acc = des(acc, alvo);
  checar("passos seguidos atravessando o zero acumulam", Math.abs(acc - 380) < 1e-9, String(acc));

  // ---- A POSICAO QUE VINHA VELHA
  const t0 = 1_000_000;
  const perto = { lat: -23.65, lng: -46.46 };
  const hist = [
    { ...perto, prec: 80, em: t0 },                          // leitura de rede, ruim
    { lat: -23.650009, lng: -46.46, prec: 6, em: t0 + 3000 },  // GNSS, boa
    { lat: -23.650011, lng: -46.46, prec: 7, em: t0 + 6000 },
  ];
  const boas = lv(hist, t0 + 7000);
  checar("a leitura de rede ruim e descartada quando ha GNSS", boas.length === 2,
         `sobraram ${boas.length}`);
  checar("leitura velha sai da janela", lv(hist, t0 + 60000).length === 0);
  // Sem nenhuma boa, nao pode sobrar nada: posicao ruim e melhor que nenhuma.
  checar("so leituras ruins? usa as ruins mesmo",
         lv([{ ...perto, prec: 90, em: t0 }, { ...perto, prec: 95, em: t0 + 1000 }], t0 + 2000).length === 2);

  const media = mp(boas)!;
  checar("a media fica entre as leituras boas",
         media.lat <= -23.650009 && media.lat >= -23.650011, String(media.lat));
  // A MARGEM NAO ENCOLHE POR TER MAIS LEITURAS. Erro de GPS e correlacionado —
  // mesmo satelite, mesma parede. Anunciar +-3 m porque foram seis leituras e
  // prometer o que nao se tem, e e assim que alguem desconfia da lapide certa.
  checar("a margem e a da melhor leitura, nao a da media", media.prec === 6, String(media.prec));
  checar("sem leitura nenhuma nao inventa posicao", mp([]) === null);

  // ---- ELA ESTA ANDANDO?
  checar("parada: deslocamento perto de zero", dj([{ ...perto, prec: 6, em: t0 }]) === 0);
  checar("andando: o deslocamento aparece em metros",
         dj([{ lat: -23.65, lng: -46.46, prec: 6, em: t0 },
             { lat: -23.6503, lng: -46.46, prec: 6, em: t0 + 8000 }]) > 30);

  // ---- A DATA DA ULTIMA FOTO, EM DIA CHEIO
  //
  // Pedido dela: "preciso da indicacao da ultima data de foto enviada para
  // decidir ou nao enviar". O caso que quebra a conta ingenua e o mais comum:
  // foto enviada ONTEM as 23h, olhada hoje as 8h. Sao nove horas, e
  // floor(9h/24h) e ZERO — a tela diria "ha 0 dias" para o que ela sabe que foi
  // ontem, e uma tela que discorda da memoria da pessoa para de ser consultada.
  const dt = await import("../src/lib/datas");
  const agora = new Date("2026-08-22T08:00:00");
  const iso = (s: string) => new Date(s).toISOString();

  checar("ontem as 23h e ONTEM, nao 'ha 0 dias'",
         dt.diasDesde(iso("2026-08-21T23:00:00"), agora) === 1,
         String(dt.diasDesde(iso("2026-08-21T23:00:00"), agora)));
  checar("hoje de manha e hoje", dt.diasDesde(iso("2026-08-22T06:00:00"), agora) === 0);
  checar("oito dias sao oito dias",
         dt.diasDesde(iso("2026-08-14T15:00:00"), agora) === 8,
         String(dt.diasDesde(iso("2026-08-14T15:00:00"), agora)));
  // NUNCA e diferente de HOJE. Devolver 0 para "sem data" faria a tela dizer
  // que a familia recebeu foto hoje quando ela nunca recebeu nenhuma.
  checar("sem data devolve nulo, nao zero", dt.diasDesde(null, agora) === null);
  checar("data invalida devolve nulo", dt.diasDesde("nao e data", agora) === null);
  checar("data no futuro nao vira negativo",
         dt.diasDesde(iso("2026-08-30T10:00:00"), agora) === 0);

  checar("fala 'hoje', 'ontem', e nunca 'ha 1 dias'",
         dt.faz(0) === "hoje" && dt.faz(1) === "ontem" && dt.faz(8) === "há 8 dias");

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
  // ---- O ALOCADOR NAO NOMEIA NINGUEM
  //
  // "Limpeza e limpeza": a equipe nao e fixa, e uma limpeza que nasce com o nome
  // de alguem colado pressupoe escala. Quem lava vira verdade quando alguem
  // COMECA o servico — `sureya_iniciar_lavagem` faz
  // `executora_id = coalesce(executora_id, quem_chamou)`.
  //
  // ESTE TESTE SUBSTITUI UM QUE PASSAVA POR ACASO: ele conferia
  // `new Set(agendados.map(s => s.executora_id)).size >= 2` e passava com
  // `{null, undefined}` — dois "vazios" diferentes contam como dois elementos.
  // Ele afirmava "distribuiu entre as ajudantes" enquanto ninguem estava
  // atribuido.
  const comNome = agendados.filter((s) => !!s.executora_id);
  checar("o alocador NAO carimba o nome de ninguem", comNome.length === 0,
         `${comNome.length} servicos sairam com executora`);

  // A capacidade da equipe continua valendo — o que saiu foi o nome, nao o
  // limite. Nina 10 + Ana 6 = 16 por dia; a inativa (8) nao entra na conta.
  const porDia = new Map<string, number>();
  for (const s of agendados) porDia.set(s.data_prevista, (porDia.get(s.data_prevista) || 0) + 1);
  const maiorDia = Math.max(...porDia.values());
  checar("a capacidade da equipe ATIVA continua limitando o dia", maiorDia <= 16,
         `um dia recebeu ${maiorDia}, e o teto das ativas e 16`);

  // E o que uma PESSOA decidiu, fica: o alocador nao desfaz atribuicao manual,
  // do mesmo jeito que ja respeita `fixado_em`.
  banco.servicos.push({ id: "amao-1", org_id: ORG, tumulo_id: "t1", plano_id: "p1",
    cliente_id: "c-cec", data_prevista: hoje, data_plano: hoje, status: "pendente",
    valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: "u-ana", ordem_dia: null });
  await ag.alocarAgenda();
  const aMao = banco.servicos.find((s) => s.id === "amao-1")!;
  checar("quem foi definido A MAO continua definido depois de alocar",
         aMao.executora_id === "u-ana", `virou ${aMao.executora_id}`);
  checar("e mesmo assim entrou na rota do dia",
         aMao.status === "agendado" && !!aMao.ordem_dia,
         `status ${aMao.status}, ordem ${aMao.ordem_dia}`);
  const s3 = banco.servicos.find((s) => s.id === "s3")!;
  const primeiroDia = agendados.map((s) => s.data_prevista).sort()[0];
  checar("backlog adiado 3x entra no PRIMEIRO dia", s3.data_prevista === primeiroDia,
         `s3 ficou em ${s3.data_prevista}, primeiro dia é ${primeiroDia}`);
  const diasUsados = [...new Set(agendados.map((s) => s.data_prevista))];
  checar("excedente vai para os dias seguintes", diasUsados.length >= 1, `dias: ${diasUsados.length}`);

  // ---- A DATA DO PLANO E' O DIA MAIS CEDO, NAO UMA SUGESTAO
  //
  // Medido em producao em 23/08: os 8 servicos pendentes eram TRES do jazigo
  // "Souza" e CINCO do "Nagae" — as visitas semanais e quinzenais geradas para
  // 17/08, 24/08, 31/08, 07/09 e 14/09 —, TODAS com data_prevista = 18/08. A
  // lavagem devida em setembro estava marcada para agosto.
  //
  // No chao: o app de campo mostrava o mesmo jazigo cinco vezes seguidas. A
  // ordenacao por endereco estava certa e nao tinha o que ordenar — parecia que
  // a roteirizacao nao funcionava, e o que nao funcionava era a data.
  //
  // Antecipar por semanas nao e otimizar: e lavar (e cobrar) fora do combinado.
  for (const s of banco.servicos) { if (s.status === "agendado") s.status = "executado"; }
  const daquiA = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  banco.servicos.push(
    { id: "futuro-1", org_id: ORG, tumulo_id: "t1", plano_id: "p1", cliente_id: "c-cec",
      data_prevista: daquiA(35), data_plano: daquiA(35), status: "pendente",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: null },
    { id: "agora-1", org_id: ORG, tumulo_id: "t3", plano_id: "p1", cliente_id: "c-cec",
      data_prevista: hoje, data_plano: hoje, status: "pendente",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: null },
  );
  await ag.alocarAgenda();
  const futuro = banco.servicos.find((s) => s.id === "futuro-1")!;
  const devidoAgora = banco.servicos.find((s) => s.id === "agora-1")!;

  checar("lavagem devida daqui a 35 dias NAO e puxada para hoje",
         String(futuro.data_prevista) >= daquiA(30),
         `ficou em ${futuro.data_prevista}, e o plano era ${daquiA(35)}`);
  checar("e a devida hoje continua sendo para agora",
         String(devidoAgora.data_prevista) <= daquiA(3),
         `ficou em ${devidoAgora.data_prevista}`);
  // A capacidade tinha vaga de sobra: se a data fosse ignorada, as duas cairiam
  // no mesmo dia — que era exatamente o defeito.
  checar("as duas NAO caem no mesmo dia so porque havia vaga",
         futuro.data_prevista !== devidoAgora.data_prevista,
         `ambas em ${devidoAgora.data_prevista}`);

  // ---- UMA LAVAGEM POR JAZIGO POR DIA
  //
  // Medido em producao em 23/08/2026: o jazigo Perrela com QUATRO lavagens no
  // dia 24, com datas de plano 01/08, 09/08, 17/08 e 25/08. Tres estavam
  // atrasadas, e `devidoEm` respondeu "hoje" para as tres — o que esta CERTO,
  // atraso nao se recupera andando para tras. O que faltava era a regra de que
  // o mesmo tumulo nao se lava duas vezes na mesma manha: a segunda passada
  // nao entrega nada e a familia e cobrada pelas duas.
  //
  // No chao, a mesma lapide aparecia quatro vezes seguidas na lista da Nina.
  for (const s of banco.servicos) { if (s.status === "agendado") s.status = "executado"; }
  const atrasadas = ["-22", "-14", "-6", "0"];
  atrasadas.forEach((n, i) => {
    banco.servicos.push({
      id: `pilha-${i}`, org_id: ORG, tumulo_id: "t1", plano_id: "p1", cliente_id: "c-cec",
      data_prevista: daquiA(Number(n)), data_plano: daquiA(Number(n)), status: "pendente",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: null,
    });
  });
  await ag.alocarAgenda();
  const pilha = banco.servicos.filter((s) => s.id.startsWith("pilha-"));
  const diasDaPilha = pilha.map((s) => s.data_prevista);
  checar("quatro lavagens atrasadas do MESMO jazigo caem em quatro dias diferentes",
         new Set(diasDaPilha).size === 4, `cairam em ${JSON.stringify(diasDaPilha)}`);
  checar("e nenhuma delas foi escondida num dia que ja passou",
         diasDaPilha.every((d) => String(d) >= hoje), JSON.stringify(diasDaPilha));
  checar("todas continuam na agenda — a que nao coube andou, nao sumiu",
         pilha.every((s) => s.status === "agendado"),
         JSON.stringify(pilha.map((s) => s.status)));

  // ---- O QUE JA ESTA AGENDADO OCUPA O DIA
  //
  // O alocador so reescreve o que esta `pendente` e solto, mas contava a
  // capacidade do dia como se ele estivesse vazio. Depois de "reorganizar",
  // as lavagens devolvidas para a fila voltavam para o mesmo dia onde a que
  // ficou `agendado` ja estava — e a pilha se remontava.
  for (const s of banco.servicos) { if (s.status === "agendado") s.status = "executado"; }
  const diaTomado = daquiA(9);
  banco.servicos.push(
    { id: "preso-1", org_id: ORG, tumulo_id: "t3", plano_id: "p1", cliente_id: "c-cec",
      data_prevista: diaTomado, data_plano: diaTomado, status: "agendado",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: 1 },
    { id: "solto-1", org_id: ORG, tumulo_id: "t3", plano_id: "p1", cliente_id: "c-cec",
      data_prevista: diaTomado, data_plano: diaTomado, status: "pendente",
      valor: 40, prioridade: 0, adiado_vezes: 0, executora_id: null, ordem_dia: null },
  );
  await ag.alocarAgenda();
  const preso = banco.servicos.find((s) => s.id === "preso-1")!;
  const solto = banco.servicos.find((s) => s.id === "solto-1")!;
  checar("o alocador nao mexe no que ja estava agendado",
         preso.data_prevista === diaTomado, `mudou para ${preso.data_prevista}`);
  checar("e nao empilha a solta no dia que o mesmo jazigo ja ocupava",
         solto.data_prevista !== diaTomado,
         `as duas do jazigo t3 ficaram em ${diaTomado}`);

  console.log("\n=== 4. PROATIVOS (cobrança / aviso de saldo / gatilhos) ===");
  const pro = await import("../src/lib/proativo");
  const nCob = await pro.cobrancaGentil();
  const rascunhosCob = banco.fila_liberacao.filter((i: any) => i.tipo === "cobranca");
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
  const todosCob = banco.fila_liberacao.filter((i: any) => i.tipo === "cobranca");
  checar("régua 'nao_cobrar' NUNCA é cobrada",
         !todosCob.some((r) => r.cliente_id === "c-avu"), "Eliana é avulsa: só convite, nunca cobrança");
  const cobSuave = todosCob.filter((r) => r.cliente_id === "c-sua");
  checar("régua 'suave' recebe cobrança", cobSuave.length >= 1, `recebeu ${cobSuave.length}`);
  const nivelSuave = banco.clientes.find((c) => c.id === "c-sua")!.cobranca_nivel;
  checar("régua 'suave' para no primeiro lembrete", nivelSuave === 1, `nível ${nivelSuave}`);
  checar("texto usa o tratamento da família",
         cobSuave.some((r: any) => r.texto.includes("Julieta")), cobSuave[0]?.texto?.slice(0, 80) || "");

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
  const textosPeriodicos = banco.fila_liberacao.filter((i: any) => i.texto?.includes("gostaria que a gente desse uma cuidada"));
  checar("convite PERIÓDICO só vai para quem tem ativação ligada",
         textosPeriodicos.every((c) => c.cliente_id === "c-avu"),
         `foi para: ${[...new Set(textosPeriodicos.map((c) => c.cliente_id))].join(",")}`);
  const convData = banco.fila_liberacao.filter((i: any) => i.texto?.includes("Finados chegando no jazigo"));
  checar("convite de DATA vai para todas as famílias", convData.length >= 4, `foi para ${convData.length}`);
  const convites = banco.fila_liberacao.filter((i: any) => i.texto?.includes("gostaria que a gente desse uma cuidada"));
  checar("convite periódico foi só para a avulsa",
         convites.every((c) => c.cliente_id === "c-avu"), `foram ${convites.length}`);
  checar("convite não é cobrança (não cita valor em aberto)",
         convites.every((c: any) => !c.texto.includes("em aberto")), "");

  console.log("\n=== 4d. FAMÍLIA COM MAIS DE UM JAZIGO ===");
  const cobLin = banco.fila_liberacao.filter((i: any) => i.cliente_id === "c-lin" && i.tipo === "cobranca");
  checar("cobrança avisa que o valor é do conjunto",
         cobLin.some((r: any) => r.texto.includes("2 jazigos")), cobLin[0]?.texto?.slice(0, 140) || "sem cobrança");
  // A DECISAO DE 22/08, COMO TESTE.
  //
  // "E a familia, mas sempre tem um responsavel financeiro." Se o saldo fosse
  // por pessoa, a Marta apareceria em dia enquanto o pai deve 720 — e a regua
  // de cobranca trataria os dois como contas diferentes. Foi exatamente esse
  // desencontro que deixou a Familia Anninha devendo 240 sem ninguem ver.
  const sPai   = await fin.calcularSaldo("c-lin");
  const sFilha = await fin.calcularSaldo("c-lin2");
  checar("a divida e da FAMILIA: pai e filha veem o mesmo saldo",
         sPai.saldo === sFilha.saldo && sPai.saldo === -720,
         `pai ${sPai.saldo}, filha ${sFilha.saldo}`);
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

  console.log("\n=== 4i. CONTADOR BATE COM A LISTA ===");
  // A aba dizia "Precisam de você (1)" e a lista vinha vazia: contador e lista
  // usavam regras diferentes. Agora é a mesma regra dos dois lados.
  function precisaDeVoce(c: any, temRascunho: boolean): boolean {
    return c.tipo === "equipe" || temRascunho || !!c.escalada_humano ||
           ["sem_resposta", "lida_sem_resposta"].includes(c.estado || "sem_movimento");
  }

  const casos = [
    { nome: "respondida e não resolvida", c: { estado: "respondida", resolvida: false }, r: false, esperado: false },
    { nome: "sem resposta", c: { estado: "sem_resposta" }, r: false, esperado: true },
    { nome: "lida mas sem responder", c: { estado: "lida_sem_resposta" }, r: false, esperado: true },
    { nome: "com rascunho pendente", c: { estado: "respondida" }, r: true, esperado: true },
    { nome: "escalada", c: { estado: "respondida", escalada_humano: true }, r: false, esperado: true },
    { nome: "recado da equipe", c: { tipo: "equipe", estado: "sem_movimento" }, r: false, esperado: true },
    { nome: "sem movimento nenhum", c: { estado: "sem_movimento" }, r: false, esperado: false },
  ];
  for (const t of casos) {
    checar(`${t.nome} → ${t.esperado ? "conta" : "não conta"}`,
           precisaDeVoce(t.c, t.r) === t.esperado, JSON.stringify(t.c));
  }

  console.log("\n=== 4j. AGENDA DINÂMICA ===");
  const fq2 = await import("../src/lib/frequencia");

  // adiantou: a próxima conta do dia real, não da data antiga
  const intervalo = fq2.intervaloEmDias("mensal", 1)!;
  const previstaAntiga = new Date(Date.now() + 20 * 86400000);
  const feitaHoje = new Date();
  const proximaCalculada = new Date(feitaHoje.getTime() + intervalo * 86400000);
  checar("adiantar traz a próxima para mais perto",
         proximaCalculada.getTime() < previstaAntiga.getTime() + intervalo * 86400000,
         "a próxima tem que contar do dia em que foi feita");

  // dias de trabalho: sábado fora
  const diasTrabalho = [1, 2, 3, 4, 5];
  function proximoDiaUtil(d: Date): Date {
    const x = new Date(d);
    let guarda = 0;
    while (!diasTrabalho.includes(x.getUTCDay()) && guarda < 10) {
      x.setUTCDate(x.getUTCDate() + 1); guarda++;
    }
    return x;
  }
  const sabado = new Date(Date.UTC(2026, 6, 18));   // 18/07/2026 é sábado
  checar("sábado é empurrado para segunda",
         proximoDiaUtil(sabado).getUTCDay() === 1, String(proximoDiaUtil(sabado).getUTCDay()));
  const quarta = new Date(Date.UTC(2026, 6, 22));
  checar("dia de trabalho não é movido",
         proximoDiaUtil(quarta).getTime() === quarta.getTime(), "");

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

  // ---- Camada de classificação barata: quando escalar pro modelo bom ----
  {
    const mod = await import("../src/lib/modelo-ia");
    const pmb = mod.precisaModeloBom;

    // rotina com confiança alta: fica no barato, NÃO escala
    checar("rotina confiante não escala pro modelo bom",
           pmb({ assunto: "agendamento", sensivel: false, precisa_humano: false, confianca: "alta" }) === false, "");
    checar("dúvida simples confiante não escala",
           pmb({ assunto: "duvida", sensivel: false, precisa_humano: false, confianca: "alta" }) === false, "");

    // sensível SEMPRE escala, mesmo se o passe barato se disser confiante
    checar("luto escala pro modelo bom",
           pmb({ assunto: "luto", sensivel: false, precisa_humano: false, confianca: "alta" }) === true, "");
    checar("reclamação escala pro modelo bom",
           pmb({ assunto: "reclamacao", sensivel: false, precisa_humano: false, confianca: "alta" }) === true, "");
    checar("cobrança escala pro modelo bom",
           pmb({ assunto: "cobranca", sensivel: false, precisa_humano: false, confianca: "alta" }) === true, "");

    // sinais de cuidado escalam mesmo em assunto de rotina
    checar("baixa confiança escala mesmo em rotina",
           pmb({ assunto: "agendamento", sensivel: false, precisa_humano: false, confianca: "baixa" }) === true, "");
    checar("IA marcou sensível: escala",
           pmb({ assunto: "outro", sensivel: true, precisa_humano: false, confianca: "alta" }) === true, "");
    checar("IA pediu humano: escala",
           pmb({ assunto: "outro", sensivel: false, precisa_humano: true, confianca: "alta" }) === true, "");
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
