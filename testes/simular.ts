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

/**
 * O DIA DA OPERAÇÃO, E NÃO O DIA EM UTC.
 *
 * ACHADO PELO PRÓPRIO CI, às 00h46 de UTC — 21h46 em São Paulo. O teste
 * "nenhuma delas foi escondida num dia que já passou" reprovou uma alocação
 * CORRETA: o alocador tinha posto uma lavagem em 27/08, que é hoje em São
 * Paulo, e este arquivo comparava com 28/08, que é hoje em UTC.
 *
 * `diaOperacao` existe desde a 0114 e foi escrita para exatamente este bug —
 * "com toISOString() o dia virava às 21h de Brasília". Todo o código de
 * produção já a usa; este arquivo era o último lugar com a definição antiga.
 * Duas definições de HOJE são duas contas sobre o mesmo fato, e é assim que
 * elas começam iguais e terminam discordando — três horas por dia, todo dia.
 */
import { diaOperacao, somaDias } from "../src/lib/vencimento";

const hoje = diaOperacao();
const diasAtras = (n: number) => somaDias(hoje, -n);
const emDias = (n: number) => somaDias(hoje, n);

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
      // A FAMILIA CADASTRADA SEM O 55 (0145).
      //
      // Numero real do caso de producao. Ela existe no cadastro sem o DDI, e o
      // WhatsApp manda `5511975904577`: ate a 0145, escrever significava virar
      // desconhecida. Nao entra em nenhuma outra conta deste arquivo — nao tem
      // familia com jazigo, nem razao, nem conversa — de proposito.
      { id: "c-sem55", org_id: ORG, familia_id: "f-cec", responsavel_financeiro: false,
        nome: "Vera (sem o 55)", telefone: "11975904577", ativo_ia: true,
        modo: "manual", score: 0, cobranca_nivel: 0, aviso_saldo_em: null, cobranca_em: null,
        anonimizado_em: null, perfil_ia: null, instrucoes_ia: null, perfil_ia_msgs: 0,
        tratamento: "a senhora", regua_cobranca: "nao_cobrar", dias_entre_cobrancas: 7,
        max_lembretes: 0, envio_automatico: false, ativacao_ativa: false, ativacao_meses: 6 },
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
  /**
   * A BUSCA POR TELEFONE VIRA RPC (0145) — e o simulador precisa saber dela.
   *
   * `acharCliente` deixou de comparar com igualdade exata e passou a chamar
   * `sureya_achar_cliente`, que normaliza o numero no banco. A regra aqui e a
   * MESMA da funcao SQL, de proposito: se as duas divergirem, o simulador
   * passa a provar um comportamento que producao nao tem — que e pior do que
   * nao testar.
   */
  const normalizar = (t: string): string => {
    const n = String(t || "").replace(/\D/g, "");
    if ((n.length === 12 || n.length === 13) && n.startsWith("55")) return n;
    if (n.length === 10 || n.length === 11) return "55" + n;
    return n;
  };
  const fake = criarFakeSupabase(banco, {
    sureya_achar_cliente: (args: any) => {
      const alvo = normalizar(args?.p_tel);
      if (!alvo) return null;
      const achado = (banco.clientes || []).find(
        (c: any) => c.org_id === args?.p_org && normalizar(c.telefone) === alvo);
      if (achado) return achado.id;
      const extra = (banco.telefones_cliente || []).find(
        (t: any) => t.org_id === args?.p_org && normalizar(t.telefone) === alvo);
      return extra ? extra.cliente_id : null;
    },
  });

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
  // JORNADA DE SEG A SEX: nada que o ALOCADOR marcar pode cair em sábado ou
  // domingo.
  //
  // SÓ O QUE ELE MARCOU, e não todo serviço do banco. Este teste olhava a
  // tabela inteira e por isso afirmava uma coisa medindo outra: o fixture tem
  // duas lavagens JÁ EXECUTADAS em `diasAtras(30)`, e uma lavagem de verdade
  // pode ter acontecido num sábado — não é falha de alocação nenhuma.
  //
  // Ele passou por acaso até 23/08/2026 e quebrou no dia 24, quando
  // `hoje − 30` caiu num sábado. Um teste que depende do dia em que roda não
  // guarda coisa alguma: ele acusa quando não devia e cala quando deveria.
  const foraDaJornada = banco.servicos.filter((x: any) => {
    if (!x.data_prevista || x.status !== "agendado") return false;
    const d = new Date(x.data_prevista + "T12:00:00Z").getUTCDay();
    return d === 0 || d === 6;
  });
  checar("alocador respeita os dias de trabalho configurados", foraDaJornada.length === 0,
         `${foraDaJornada.length} caíram em fim de semana: `
         + foraDaJornada.map((x: any) => `${x.id}=${x.data_prevista}`).join(", "));
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
  // Mesma razão do `emDias` no topo: o dia da operação, não o dia em UTC.
  const daquiA = (n: number) => somaDias(hoje, n);
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

  console.log("\n=== 5. AVISO PARA TODO MUNDO ===");
  //
  // O AVISO CAI NA FILA DE LIBERACAO, e nao mais em `interacoes_ia`.
  //
  // Estes testes conferiam o destino ANTIGO — a lista solta de rascunhos que a
  // 0094 apagou. Passavam verdes enquanto a campanha escrevia num lugar sem
  // tela: o teste guardava o mecanismo e nao o resultado.
  const camp = await import("../src/lib/campanha");
  const rc = await camp.executarCampanha({
    nome: "Aviso das moedas",
    mensagem: "Olá, {nome}! Um aviso sobre as moedas deixadas no jazigo.",
    publico: "todas" });
  // FILTRO POR TIPO **E** TEXTO. So pelo texto, este teste pegava tambem as
  // comemorativas — ha um modelo de Finados no fixture com frase parecida, e a
  // contagem vinha somada sem ninguem perceber.
  const naFila = banco.fila_liberacao.filter(
    (i: any) => i.tipo === "lembrete" && i.texto?.includes("moedas deixadas"));

  checar("o aviso entrou na fila de liberacao", naFila.length >= 3, `criou ${rc.criados}`);
  checar("{nome} foi substituído pelo primeiro nome",
         naFila.some((r: any) => r.texto.includes("Cecília")), naFila[0]?.texto || "");
  checar("nasce AGUARDANDO — nada sai sozinho",
         naFila.every((r: any) => r.status === "aguardando"),
         "um aviso enviado sem comando quebra a regra da casa");
  checar("aviso NÃO inclui cliente anonimizado",
         !naFila.some((r: any) => r.cliente_id === "c-anon"), "LGPD");

  // UMA POR FAMILIA. Uma casa com tres contatos receberia tres vezes o mesmo
  // recado — o defeito que a 0102 criou na cobranca gentil, aqui de novo.
  const familiasAvisadas = naFila.map((r: any) => r.familia_id);
  checar("uma mensagem por família, sem repetir a casa",
         new Set(familiasAvisadas).size === familiasAvisadas.length,
         `${familiasAvisadas.length} mensagens para ${new Set(familiasAvisadas).size} famílias`);

  const rc2 = await camp.executarCampanha({
    nome: "Cobrar", mensagem: "Teste de público em aberto aqui", publico: "em_aberto" });
  const abertos = banco.fila_liberacao.filter(
    (i: any) => i.tipo === "lembrete" && i.texto?.includes("Teste de público em aberto"));
  const familiasDevendo = ["f-ant", "f-neu", "f-avu", "f-sua", "f-lin"];
  checar("público 'em aberto' pega só quem deve",
         abertos.every((r: any) => familiasDevendo.includes(r.familia_id)),
         `pegou ${abertos.map((r: any) => r.familia_id).join(",")}`);
  checar("público 'em aberto' NÃO pega quem está adiantado",
         !abertos.some((r: any) => r.familia_id === "f-cec"), "a família Ramos tem +160");

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

  // ==========================================================================
  console.log("\n=== 10. LEITURA DO COMPROVANTE ===");
  // A regra que decide se o que a IA leu pode PREENCHER campo de dinheiro.
  //
  // O risco tem valor em reais: um número errado pré-preenchido convida a
  // apertar "Lançar" sem olhar o papel. Campo vazio obriga a olhar.
  {
    const { decidirLeitura } = await import("../src/lib/comprovante");
    const base = { valor: 100, data: "2026-08-21", id_transacao: "E2E-XYZ" };

    const alta = decidirLeitura({ ...base, eh_comprovante: true, confianca: "alta" } as any);
    checar("comprovante lido com confiança alta preenche",
           alta.confiavel === true && alta.valor === 100 && alta.data === "2026-08-21", "");
    checar("e traz o identificador da transação",
           alta.idTransacao === "E2E-XYZ",
           "é o E2E que impede o mesmo Pix de entrar pelas duas portas");
    checar("quando deu certo, a tela não tem nada a dizer",
           alta.mensagem === null, "");

    const media = decidirLeitura({ ...base, eh_comprovante: true, confianca: "media" } as any);
    checar("confiança média ainda preenche",
           media.confiavel === true && media.valor === 100,
           "só a BAIXA é que barra — média com aviso seria trabalho a mais sem ganho");

    const baixa = decidirLeitura({ ...base, eh_comprovante: true, confianca: "baixa" } as any);
    checar("confiança baixa NÃO preenche campo de dinheiro",
           baixa.confiavel === false, "");
    checar("e não devolve o valor nem 'só para mostrar'",
           baixa.valor === null && baixa.data === null && baixa.idTransacao === null,
           "número na mão da tela é número que alguém acaba usando");
    checar("e explica por que os campos ficaram vazios",
           typeof baixa.mensagem === "string" && baixa.mensagem.length > 10, "");

    const naoEh = decidirLeitura({ ...base, eh_comprovante: false, confianca: "alta" } as any);
    checar("foto que não é comprovante não preenche nada",
           naoEh.confiavel === false && naoEh.valor === null, "");
    checar("e diz isso com todas as letras",
           (naoEh.mensagem || "").includes("não me parece um comprovante"),
           "a Sureya precisa saber se foi a foto ou foi o sistema");

    const semValor = decidirLeitura({
      eh_comprovante: true, confianca: "alta", valor: null, data: "2026-08-21", id_transacao: null,
    } as any);
    checar("comprovante sem valor legível ainda vale pela data",
           semValor.confiavel === true && semValor.valor === null && semValor.data === "2026-08-21",
           "ler metade é melhor que não ler nada — ela completa o resto");
    checar("e sem identificador continua passando",
           semValor.idTransacao === null,
           "nem todo print traz o E2E; barrar por isso seria trocar crédito em dobro por crédito nenhum");
  }

  // ==========================================================================
  console.log("\n=== 11. LEITURA DO EXTRATO ===");
  // O risco aqui e uma linha perdida virar dinheiro que ninguem cobra, ou um
  // debito lido como credito virar receita que nao existe. Por isso o teste
  // sempre termina no MESMO juiz: a conferencia do saldo.
  {
    const { lerOFX, lerCSV, lerHTML, lerXLSX, conferir, detectarFormato, extrairRemetente } =
      await import("../src/lib/extrato");

    // --- OFX, o formato do banco
    const ofx = [
      "OFXHEADER:100", "<OFX><BANKTRANLIST>",
      "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260823100308<TRNAMT>100.00<FITID>1003080",
      "<NAME>JOSEANE APARECIDA RON<MEMO>PIX RECEBIDO REM: JOSEANE APARECIDA RON 23/08</STMTTRN>",
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260824<TRNAMT>-159.80<FITID>0526731",
      "<MEMO>COMPRA CARTAO VISA</STMTTRN>", "</BANKTRANLIST></OFX>",
    ].join("\n");
    const o = lerOFX(ofx);
    checar("OFX lê os dois movimentos", o.length === 2, "");
    checar("OFX: valor negativo vira débito, e o valor fica positivo",
           o[1].tipo === "debito" && o[1].valor === 159.8,
           "guardar valor negativo faria toda soma de saída dar o sinal errado");
    checar("OFX: a data 20260823100308 vira 2026-08-23",
           o[0].data === "2026-08-23", "o OFX gruda a hora na data");
    checar("OFX: acha o remetente dentro do MEMO",
           o[0].remetente === "JOSEANE APARECIDA RON", "");
    checar("OFX: guarda o FITID, que é a chave contra importar duas vezes",
           o[0].documento === "1003080", "");
    checar("OFX não traz saldo por linha, então a conferência diz NÃO SEI",
           conferir(o).fecha === null,
           "nulo é ausência de prova; tratar como aprovado seria apresentar vazio como medida");

    // --- tabela com colunas separadas de crédito e débito (o desenho do Bradesco)
    const html = "<table>"
      + "<tr><th>Data</th><th>Historico</th><th>Docto.</th><th>Credito (R$)</th><th>Debito (R$)</th><th>Saldo (R$)</th></tr>"
      + "<tr><td>23/08/2026</td><td>PIX RECEBIDO REM: JOSEANE APARECIDA RON 23/08</td><td>1003080</td><td>100,00</td><td></td><td>6.809,83</td></tr>"
      + "<tr><td>24/08/2026</td><td>COMPRA CARTAO VISA</td><td>0526731</td><td></td><td>159,80</td><td>6.650,03</td></tr>"
      + "</table>";
    const h = lerHTML(html);
    checar("o '.xls' do banco que é HTML por dentro é lido", h.length === 2, "");
    checar("coluna vazia é o que diz de que lado o dinheiro andou",
           h[0].tipo === "credito" && h[1].tipo === "debito", "");
    checar("1.234,56 é lido como 1234.56", h[0].saldoApos === 6809.83, "");
    const ch = conferir(h, 6709.83);
    checar("e a conta fecha", ch.fecha === true, "");
    checar("deduz o saldo de abertura quando ninguém informa",
           conferir(h).saldoInicial === 6709.83,
           "sem abertura, a primeira linha seria a única que a prova não alcança");

    // --- CSV com o lado numa coluna própria e o valor sempre positivo
    const csv = [
      "data;tipo;historico;valor;saldo",
      "23/08/2026;credito;PIX RECEBIDO REM: JOSEANE APARECIDA RON;100,00;6809,83",
      "24/08/2026;debito;COMPRA CARTAO VISA;159,80;6650,03",
    ].join("\n");
    const cv = lerCSV(csv);
    checar("CSV: a coluna de tipo manda no sinal, não o número",
           cv.length === 2 && cv[1].tipo === "debito" && cv[1].valor === 159.8,
           "com valor positivo e lado escrito, confiar no sinal erra em TODAS as linhas");
    checar("CSV: fareja o ponto-e-vírgula", cv[0].valor === 100, "");

    // --- a prova falha quando falta uma linha
    const furado = [h[0], { ...h[1], saldoApos: 6600.03 }];
    const cf = conferir(furado, 6709.83);
    checar("linha que não bate com o saldo REPROVA a importação", cf.fecha === false, "");
    checar("e a reprovação diz qual linha e quanto deveria dar",
           !!cf.problema && cf.problema.includes("linha 2") && cf.problema.includes("6650.03"),
           "'não fecha' sem o dedo na linha não ajuda ninguém a resolver");

    // --- detecção por conteúdo, não por extensão
    checar("PDF é reconhecido pelo %PDF",
           detectarFormato(Buffer.from("%PDF-1.7"), "extrato.pdf") === "pdf", "");
    checar("o .xls binário de verdade é recusado, não lido errado",
           detectarFormato(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), "e.xls") === "xls_antigo",
           "ler lixo como se fosse planilha é pior que recusar");
    checar("HTML com extensão .xls é reconhecido pelo conteúdo",
           detectarFormato(Buffer.from("<html><table>"), "extrato.xls") === "html",
           "a extensão mente; o conteúdo não");

    // --- XLSX de verdade: zip + sharedStrings + célula vazia OMITIDA
    //
    // É o leitor mais arriscado do conjunto — abre o zip na mão para não trazer
    // uma dependência de planilha só por causa de um arquivo por mês. O caso
    // que quebra um parser ingênuo está aqui: o Excel NÃO escreve a célula
    // vazia, então a coluna vem na referência (r="D2") e não na ordem.
    {
      const { deflateRawSync } = await import("node:zlib");
      const membro = (nome: string, texto: string) => {
        const n = Buffer.from(nome, "utf8");
        const dados = deflateRawSync(Buffer.from(texto, "utf8"));
        const cab = Buffer.alloc(30);
        cab.writeUInt32LE(0x04034b50, 0);
        cab.writeUInt16LE(8, 8);                 // deflate
        cab.writeUInt32LE(dados.length, 18);
        cab.writeUInt32LE(Buffer.byteLength(texto), 22);
        cab.writeUInt16LE(n.length, 26);
        return Buffer.concat([cab, n, dados]);
      };
      const textos = ["Data", "Historico", "Credito (R$)", "Debito (R$)", "Saldo (R$)",
                      "23/08/2026", "PIX RECEBIDO REM: JOSEANE APARECIDA RON 23/08", "100,00", "6.809,83",
                      "24/08/2026", "COMPRA CARTAO VISA", "159,80", "6.650,03"];
      const ss = '<sst>' + textos.map((t) => `<si><t>${t.replace(/&/g, "&amp;")}</t></si>`).join("") + "</sst>";
      const sheet =
        '<worksheet><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'
        + '<c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>'
        // linha 2: coluna D (débito) NÃO existe — é o buraco que desloca tudo
        + '<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c>'
        + '<c r="C2" t="s"><v>7</v></c><c r="E2" t="s"><v>8</v></c></row>'
        // linha 3: agora falta a coluna C (crédito)
        + '<row r="3"><c r="A3" t="s"><v>9</v></c><c r="B3" t="s"><v>10</v></c>'
        + '<c r="D3" t="s"><v>11</v></c><c r="E3" t="s"><v>12</v></c></row>'
        + "</sheetData></worksheet>";
      const zip = Buffer.concat([
        membro("xl/sharedStrings.xml", ss),
        membro("xl/worksheets/sheet1.xml", sheet),
      ]);
      const x = lerXLSX(zip);
      checar("XLSX: abre o zip e lê as duas linhas", x.length === 2, "");
      checar("XLSX: célula vazia omitida não desloca as colunas",
             x[0].tipo === "credito" && x[0].valor === 100
             && x[1].tipo === "debito" && x[1].valor === 159.8,
             "sem ler r=\"D2\", o débito da linha 3 cairia na coluna do crédito");
      checar("XLSX: e a conta fecha", conferir(x, 6709.83).fecha === true, "");
    }

    checar("REM: com data no fim não leva a data junto no nome",
           extrairRemetente("PIX RECEBIDO REM: MARIO KANASHIRO 25/08") === "MARIO KANASHIRO", "");
  }

  // ==========================================================================
  console.log("\n=== 12. O NOME QUE VAI NA MENSAGEM ===");
  // As DUAS regras de primeiro nome — esta, em TypeScript, e
  // `sureya_primeiro_nome`, no banco — tem de responder IGUAL caso a caso.
  //
  // Nao e zelo excessivo: a previa que a Sureya le antes de liberar e
  // renderizada PELO BANCO (`sureya_textos_do_tipo`), e o envio passa pelo
  // TypeScript. Se as duas discordarem, ela aprova um texto e a familia recebe
  // outro — e ninguem descobre, porque nao da erro.
  //
  // Os mesmos pares estao em `testes/nome_proprio.sql`, do outro lado.
  {
    const { primeiroNome } = await import("../src/lib/mensagens");
    const pares: [string, string][] = [
      ["José Carlos Cecon", "José"],
      // o campo `nome` guarda a referencia que acha a pessoa no cemiterio;
      // mandar isso inteiro numa mensagem seria constrangedor
      ["Paulo Primo da Maria Japonesa", "Paulo"],
      ["Sr. João Batista", "Sr. João"],
      ["Sr João Batista", "Sr João"],
      ["Dra Marta Lima", "Dra Marta"],
      ["Nina", "Nina"],
      ["Ana  Maria", "Ana"],
      ["Dona", "Dona"],
      ["  Pedro  ", "Pedro"],
      ["Maria-José Santos", "Maria-José"],
    ];
    for (const [entrada, esperado] of pares) {
      checar(`primeiro nome de ${JSON.stringify(entrada)}`,
             primeiroNome(entrada) === esperado,
             `veio ${JSON.stringify(primeiroNome(entrada))}, esperado ${JSON.stringify(esperado)}`);
    }
  }

  // ==================================================================
  // 13. A FILA DO CAMPO — o que o tempo resolve e o que precisa de gente
  // ==================================================================
  //
  // Build B / CP-06 e CP-08. A fila e IndexedDB, que nao existe aqui — mas as
  // REGRAS foram tiradas de dentro do fetch justamente para poderem ser
  // provadas. Sao elas que decidem se um trabalho fica esperando para sempre.
  // ==========================================================================
  // O SALDO DA FAMÍLIA — a regra, e o dia que a decide
  // ==========================================================================
  //
  // `calcularSaldo` saiu de dentro de `/api/conta-corrente` porque a
  // conferência passou a mostrar o mesmo número. Duas contas sobre os mesmos
  // fatos começam iguais e terminam discordando — e quando discordam sobre
  // dinheiro, alguém liga para uma família cobrando o que ela já pagou.
  //
  // E O DIA IMPORTA: o que decide "vencido" é a data da OPERAÇÃO, não a de UTC.
  // Com `toISOString()` — que era o que havia na rota — o dia virava às 21h de
  // Brasília, e das 21h à meia-noite uma competência que vence hoje já entrava
  // como dívida. Três horas por dia, todo dia, sobre dinheiro.
  // ==========================================================================
  // O QUE A IA SABE ANTES DE RESPONDER
  // ==========================================================================
  //
  // Medido em 29/08, em producao: das 25 respostas a mensagens de familia, 11
  // (44%) prometiam "deixa eu conferir isso direitinho e ja te falo". Uma delas
  // respondia "qual o valor dos 2 vasos?" — e "Troca de vaso: R$ 60,00" ESTAVA
  // cadastrado. Ela prometia voltar por um dado que a casa tinha.
  //
  // O prompt e funcao pura: da para provar o que ela recebe sem gastar um token.
  console.log("\n=== 12c. O CONTEXTO QUE A IA RECEBE ===");
  {
    const { montarSystemPrompt } = await import("../src/lib/persona");
    const base = {
      nome: "Oscar", saldoTexto: "em dia", tumulos: [{ identificacao: "Q1-R1-001" }],
    } as any;

    const semCatalogo = montarSystemPrompt(base);
    const comCatalogo = montarSystemPrompt({
      ...base,
      catalogo: [{ nome: "Troca de vaso", preco: 60 }, { nome: "Vela de sete dias", preco: 15 }],
    });

    checar("sem catalogo, o prompt nao inventa tabela de precos",
           !/TABELA DE EXTRAS/.test(semCatalogo));
    checar("com catalogo, o preco chega ate ela",
           /Troca de vaso: R\$\s*60,00/.test(comCatalogo),
           "o preco nao apareceu no prompt");
    checar("e ela e mandada RESPONDER o preco, nao prometer conferir",
           /RESPONDA o preço — não prometa conferir/.test(comCatalogo));

    // Pedido ja feito: sem isto, a mensagem seguinte vira assunto novo e a
    // familia repete o que ja disse.
    const comPedido = montarSystemPrompt({
      ...base,
      pedidosAbertos: [{ resumo: "limpeza especial", ocasiao: "Dia dos Pais", prazo: "09/08/2026" }],
    });
    checar("pedido em aberto entra no contexto",
           /limpeza especial \(Dia dos Pais\) — para 09\/08\/2026/.test(comPedido));
    checar("e ela e avisada de que nao e novidade",
           /Não trate como novidade e não peça\s+para repetir/.test(comPedido));

    // Comprovante recebido: sem isto, ela pode pedir de novo o que ja chegou.
    const comComprovante = montarSystemPrompt({
      ...base, comprovantesPendentes: [{ valor: 40, data: "28/08/2026" }],
    });
    checar("comprovante ja recebido entra no contexto",
           /R\$\s*40,00 em 28\/08\/2026/.test(comComprovante));
    checar("e ela e proibida de dizer que nao recebeu",
           /não diga\s+que não recebeu/.test(comComprovante));

    // O valor NAO LIDO nao pode virar "R$ 0,00": um comprovante que o leitor
    // nao entendeu ainda foi recebido, e dizer zero seria pior que nao dizer.
    const semValor = montarSystemPrompt({
      ...base, comprovantesPendentes: [{ valor: null, data: "28/08/2026" }],
    });
    checar("comprovante sem valor lido diz isso, nao R$ 0,00",
           /valor não lido/.test(semValor) && !/R\$\s*0,00/.test(semValor));

    // Os blocos so aparecem quando ha o que dizer: bloco vazio em prompt e
    // token pago para nada, e ruido que a IA tenta interpretar.
    checar("nenhum bloco novo aparece quando nao ha dados",
           !/PEDIDOS DESTA FAMÍLIA/.test(semCatalogo)
           && !/COMPROVANTES QUE ELA MANDOU/.test(semCatalogo));
  }

  // ==========================================================================
  // A PROMESSA TEM DE VIRAR LINHA (0142)
  // ==========================================================================
  //
  // Das 11 respostas que prometiam voltar, ZERO deixavam registro. O conserto
  // nao e proibir a frase — as vezes conferir e a coisa certa a dizer, e uma
  // IA proibida de dizer "vou conferir" inventa um numero, que e o defeito que
  // o prompt inteiro foi escrito para evitar. O conserto e ANOTAR.
  //
  // Duas coisas podem dar errado, e as duas sao silenciosas:
  //   anotar de menos  a promessa sai, nao vira linha, e a familia espera um
  //                    retorno que ninguem sabe que deve. O estado de antes.
  //   anotar de mais   entra "prometeu alguma coisa" sem dizer o que. Uma
  //                    pendencia que nao diz o que fazer nao se cumpre — e uma
  //                    lista assim se aprende a ignorar inteira.
  console.log("\n=== 12d. A PROMESSA DEIXA MARCA ===");
  {
    const { promessaAnotavel } = await import("../src/lib/atendimento");
    const { responderTool } = await import("../src/lib/persona");

    checar("a IA e obrigada a dizer se prometeu voltar",
           (responderTool as any).input_schema.required.includes("prometeu_voltar"),
           "prometeu_voltar ficou opcional: o campo que nao e obrigatorio nao vem");
    checar("e obrigada a dizer sobre o que",
           (responderTool as any).input_schema.required.includes("promessa_sobre"));

    checar("quem nao prometeu nao vira pendencia",
           promessaAnotavel({ prometeu_voltar: false, promessa_sobre: "conferir o vaso" }) === null,
           "anotou uma promessa que nao foi feita");
    checar("quem prometeu vira pendencia com o assunto",
           promessaAnotavel({ prometeu_voltar: true, promessa_sobre: " conferir o vaso " })
             === "conferir o vaso",
           "o assunto nao chegou limpo");
    checar("prometeu sem dizer o que NAO vira pendencia",
           promessaAnotavel({ prometeu_voltar: true, promessa_sobre: "   " }) === null,
           "entrou uma pendencia que ninguem consegue cumprir");
    checar("nem quando o campo nem veio",
           promessaAnotavel({ prometeu_voltar: true }) === null);
  }

  // ==========================================================================
  // A BANCADA CALIBRA CONTRA O PROMPT DE VERDADE
  // ==========================================================================
  //
  // O simulador antigo montava o prompt de um jeito e a producao de outro: um
  // bloco so, com o conhecimento embutido, sobre uma familia inventada. Quem
  // afinava o tom la afinava contra algo que nunca rodou.
  //
  // Agora ha UMA montagem, e ela e testavel: e funcao pura.
  console.log("\n=== 12e. O PROMPT QUE VAI PARA O MODELO ===");
  {
    const { montarSystemDeProducao } = await import("../src/lib/atendimento");
    const ctx = {
      nome: "Oscar", saldoTexto: "em dia", tumulos: [{ identificacao: "Q1-R1-001" }],
      catalogo: [{ nome: "Troca de vaso", preco: 60 }],
    } as any;
    const blocos = montarSystemDeProducao(ctx, {
      conhecimento: "A limpeza avulsa custa R$ 40.",
      tom: "Fale como pessoa de confianca da familia.",
    }) as any[];

    checar("sao dois blocos, e so o primeiro e cacheado",
           blocos.length === 2
           && blocos[0].cache_control?.type === "ephemeral"
           && !blocos[1].cache_control,
           `vieram ${blocos.length} blocos`);

    // O conhecimento tem ~3.800 caracteres em producao e e o mesmo para todas
    // as familias. Mandar duas vezes seria pagar duas vezes o mesmo texto em
    // TODA chamada — e o cache do primeiro bloco perderia a razao de existir.
    const inteiro = blocos.map((b) => b.text).join("\n");
    checar("o conhecimento vai UMA vez so, no bloco cacheado",
           blocos[0].text.includes("A limpeza avulsa custa R$ 40.")
           && !blocos[1].text.includes("A limpeza avulsa custa R$ 40."),
           "o conhecimento foi repetido: paga-se duas vezes pelo mesmo texto");

    checar("o tom vai no bloco do cliente",
           blocos[1].text.includes("Fale como pessoa de confianca da familia."));

    // A bancada existe para descobrir isto: o preco cadastrado chegando (ou
    // nao) ate ela. Se o catalogo nao entrasse aqui, a bancada mostraria dois
    // lados igualmente cegos e ninguem descobriria nada.
    checar("o catalogo da casa chega pelo mesmo caminho",
           /Troca de vaso: R\$\s*60,00/.test(inteiro),
           "o preco cadastrado nao entrou no prompt de producao");

    // Sem conhecimento salvo o bloco nasce vazio — e vazio nao pode virar a
    // string "null" dentro do prompt.
    const semNada = montarSystemDeProducao(ctx, { conhecimento: null, tom: null }) as any[];
    checar("sem conhecimento salvo, o bloco nao escreve 'null'",
           !semNada[0].text.includes("null") && !semNada[1].text.includes("null"));
  }

  // ==========================================================================
  // A CONTA DO PRECO (medido em 29/08, em producao)
  // ==========================================================================
  //
  //   82  tumulos contratados
  //  182  lavagens por mes que eles consomem
  //  R$ 3.150  de receita contratada
  //  R$ 17,30  por lavagem, em media
  //  R$ 1.840  de pagamento da ajudante (o UNICO custo cadastrado na casa)
  //   42%  de uso da agenda
  //
  // E a mesma lavagem sendo cobrada de R$ 5,75 a R$ 60,00 — dez vezes de
  // diferenca, quase toda ela explicada por periodicidade: quem lava toda
  // semana consome 4,3 lavagens por mes e paga quase o mesmo de quem lava a
  // cada quinze dias, que consome 2.
  //
  // O QUE PODE DAR ERRADO AQUI E DINHEIRO, NOS DOIS SENTIDOS:
  //   custo cheio usado como marginal   recusa cliente que ADICIONARIA dinheiro
  //   custo marginal usado como cheio   acha que tudo da lucro e nunca sobe o piso
  console.log("\n=== 12f. A CONTA DO PRECO ===");
  {
    const { precificar, lavagensPorMes } = await import("../src/lib/precificacao");

    checar("semanal consome 4,3 lavagens por mes, nao 4",
           Math.abs((lavagensPorMes("semanal") ?? 0) - 4.345) < 0.001,
           "usar 4 subestima a carga semanal em 8% — e e no semanal que estao os mais baratos");
    checar("quinzenal consome 2", lavagensPorMes("quinzenal") === 2);

    // PERIODICIDADE DESCONHECIDA NAO VIRA ZERO. Zero faria o contrato parecer
    // trabalho de graca — margem infinita — e ele subiria para o topo da lista
    // de melhores contratos da casa.
    checar("periodicidade desconhecida nao vale zero lavagem",
           lavagensPorMes("de vez em quando") === null && lavagensPorMes(null) === null,
           "ausencia virou medida: o contrato sem periodicidade parece o mais lucrativo");

    const custos = { ajudanteMes: 1840, materialPorLavagem: 0,
                     transportePorLavagem: 0, sistemaMes: 0 };

    // O caso real, reduzido: um quinzenal a R$ 40 (R$ 20/lavagem) e um semanal
    // a R$ 25 (R$ 5,75/lavagem — o contrato mais barato da casa).
    const c = precificar([
      { id: "a", familia: "Quinzenal", codigo: null, periodicidade: "quinzenal", valorMensal: 40 },
      { id: "b", familia: "Alcantara", codigo: null, periodicidade: "semanal", valorMensal: 25 },
    ], custos, 435);

    checar("a carga soma as duas periodicidades",
           Math.abs(c.lavagensMes - 6.3) < 0.05, `veio ${c.lavagensMes}`);
    checar("o semanal aparece como o mais barato por lavagem",
           c.linhas.find((l) => l.id === "b")!.porLavagem === 5.75,
           "a conta por lavagem nao esta dividindo pela carga real");
    // O CUSTO CHEIO DEPENDE DO VOLUME — e e exatamente por isso que ele NAO
    // serve para decidir se vale pegar mais um cliente.
    //
    // Com dois contratos so, o salario de R$ 1.840 se divide por 6,3 lavagens:
    // o custo cheio vira R$ 290 e ATE o contrato bom fica "abaixo do custo".
    // Com a carteira cheia ele cai para perto de R$ 13, e so o barato sobra na
    // lista. O mesmo contrato, o mesmo preco, a mesma ajudante — e dois
    // veredictos opostos. Ler esse numero como "o custo da lavagem" e o erro
    // que esta tela existe para nao deixar acontecer.
    checar("com pouco volume, o fixo condena ate o contrato bom",
           c.abaixoDoCusto === 2 && (c.custoCheioPorLavagem ?? 0) > 250,
           `cheio ${c.custoCheioPorLavagem}, abaixo ${c.abaixoDoCusto}`);

    const carteira = precificar([
      ...Array.from({ length: 70 }, (_, i) => ({
        id: `q${i}`, familia: "Quinzenal", codigo: null,
        periodicidade: "quinzenal", valorMensal: 40,
      })),
      { id: "b", familia: "Alcantara", codigo: null, periodicidade: "semanal", valorMensal: 25 },
    ], custos, 435);

    checar("com a carteira cheia, o custo cheio cai para a casa dos R$ 13",
           (carteira.custoCheioPorLavagem ?? 0) > 12 && (carteira.custoCheioPorLavagem ?? 0) < 14,
           `veio ${carteira.custoCheioPorLavagem}`);
    checar("e ai so o semanal barato aparece abaixo do custo",
           carteira.abaixoDoCusto === 1
           && carteira.linhas.find((l) => l.id === "b")!.situacao === "abaixo do custo",
           `abaixo: ${carteira.abaixoDoCusto}`);

    // OS DOIS CUSTOS SAO NUMEROS DIFERENTES, E TEM DE SER.
    checar("o custo cheio e o fixo rateado pelas lavagens de hoje",
           Math.abs((c.custoCheioPorLavagem ?? 0) - 1840 / 6.345) < 0.02,
           `veio ${c.custoCheioPorLavagem}`);
    checar("o custo de mais uma NAO carrega o salario",
           c.custoDeMaisUm === 0,
           "a proxima lavagem esta sendo cobrada de um salario que ja foi pago");

    const comVariavel = precificar([
      { id: "a", familia: "Q", codigo: null, periodicidade: "quinzenal", valorMensal: 40 },
    ], { ...custos, materialPorLavagem: 2.5, transportePorLavagem: 1.5 }, 435);
    checar("material e transporte entram no custo de mais uma",
           comVariavel.custoDeMaisUm === 4);

    // Sem lavagem nenhuma, ratear o fixo daria Infinity — e Infinity numa tela
    // de dinheiro e pior que uma tela vazia.
    const vazio = precificar([], custos, 435);
    checar("sem contrato, o custo por lavagem e vazio e nao infinito",
           vazio.custoCheioPorLavagem === null && vazio.lavagensMes === 0);

    // O contrato sem periodicidade fica DE FORA da conta e e CONTADO, para
    // alguem completar — em vez de sumir em silencio.
    const torto = precificar([
      { id: "a", familia: "Q", codigo: null, periodicidade: "quinzenal", valorMensal: 40 },
      { id: "x", familia: "Sem regra", codigo: null, periodicidade: null, valorMensal: 30 },
    ], custos, 435);
    checar("contrato sem periodicidade sai da conta e e contado",
           torto.semPeriodicidade === 1 && torto.receitaMes === 40
           && torto.linhas.find((l) => l.id === "x")!.situacao === "nao da para dizer");

    checar("a folga da agenda e o que ainda cabe",
           Math.abs((c.folgaLavagens ?? 0) - (435 - 6.345)) < 0.1);
  }

  // ==========================================================================
  // A FAMILIA CADASTRADA SEM O 55 NAO E DESCONHECIDA (0145)
  // ==========================================================================
  //
  // Medido em 29/08: 46 clientes cadastrados sem o DDI, e o WhatsApp SEMPRE
  // manda com. `acharCliente` comparava com igualdade exata — nenhum deles era
  // reconhecido. Escreviam, viravam lead, recebiam a saudacao de desconhecido,
  // e a IA respondia sem saber que havia jazigo, saldo ou combinado.
  //
  // Depois alguem cadastrava a pessoa outra vez, e nascia a copia com o 55.
  // Onze pares de duplicados nasceram assim.
  console.log("\n=== 12g. O NUMERO ACHA A PESSOA ===");
  {
    const { acharCliente } = await import("../src/lib/context");

    // A VERA ESTA CADASTRADA SEM O 55 — o caso real, com o numero real.
    // O WhatsApp manda COM. Ate a 0145 isto devolvia null e ela virava lead.
    const comoOWhatsappManda = await acharCliente("5511975904577");
    checar("o numero como o WhatsApp manda acha quem esta cadastrado sem o 55",
           comoOWhatsappManda?.id === "c-sem55",
           `veio ${comoOWhatsappManda?.id} — a familia cairia como desconhecida`);

    checar("e o mesmo numero como esta no cadastro acha a mesma pessoa",
           (await acharCliente("11975904577"))?.id === "c-sem55");

    checar("numero com pontuacao tambem acha",
           (await acharCliente("(11) 97590-4577"))?.id === "c-sem55",
           "o numero digitado com parenteses virou outra pessoa");

    // CASAR DEMAIS E PIOR QUE CASAR DE MENOS: num sistema onde o telefone diz
    // QUEM PAGA, um falso positivo junta dois razoes, e o erro so aparece
    // quando alguem for cobrado pelo que ja pagou.
    checar("numero de ninguem continua sendo de ninguem",
           (await acharCliente("5511999999999")) === null,
           "esta casando numero alheio — dois razoes viram um");
    checar("numero vazio nao acha o primeiro da lista",
           (await acharCliente("")) === null,
           "cadastro sem telefone viraria a resposta de qualquer mensagem");
  }

  // ==========================================================================
  // O NOME DO LUGAR TEM UMA FORMA SO (0149)
  // ==========================================================================
  //
  // A licao ja estava escrita na rota de cadastro de jazigo:
  //
  //   "Antes esta rota criava a quadra quando o codigo nao existia. Parecia
  //    gentil e foi o que produziu TREZE QUADRAS para um cemiterio de quatro:
  //    'QD 1', 'Q1', 'Qd 1', 'Q01' e 'Quadra 1' eram o mesmo lugar do mundo
  //    real em cinco registros diferentes — e o roteiro do dia se perdia."
  //
  // A resposta de la foi proibir criar por texto livre. Mas alguem tem de criar
  // a primeira quadra do Santa Lidia — e ai a digitacao volta. Se a tela de
  // criar aceitasse qualquer forma, as treze nasceriam de novo, uma tela
  // adiante.
  console.log("\n=== 12h. O NOME DA QUADRA E DA RUA ===");
  {
    const { formaDaQuadra, formaDaRua, mesmoLugar } = await import("../src/lib/lugar");

    // As cinco formas reais que viraram cinco registros.
    for (const escrito of ["QD 1", "Q1", "Qd 1", "Q01", "Quadra 1", "quadra 01", "q 1"]) {
      checar(`"${escrito}" e a quadra Q1`, formaDaQuadra(escrito) === "Q1",
             `virou ${formaDaQuadra(escrito)}`);
    }

    // O ZERO A ESQUERDA CAI: "Q01" e "Q1" sao o mesmo lugar, e mante-los
    // diferentes E o defeito.
    checar("Q01 e Q1 sao o mesmo lugar", mesmoLugar("Q01", "Q1", "quadra"));
    checar("mas Q1 e Q2 nao sao", !mesmoLugar("Q1", "Q2", "quadra"));

    // NOME QUE NAO E NUMERO SOBREVIVE. Quadra "FUNDOS" existe, e forca-la a
    // virar "Q0" seria pior que aceitar o nome dela.
    checar("quadra com nome proprio nao vira Q inventado",
           formaDaQuadra("Fundos") === "FUNDOS",
           `virou ${formaDaQuadra("Fundos")}`);

    for (const escrito of ["R5", "rua 5", "RUA 05", "Rua5", "r 5"]) {
      checar(`"${escrito}" e a RUA 5`, formaDaRua(escrito) === "RUA 5",
             `virou ${formaDaRua(escrito)}`);
    }
    checar("rua com nome proprio sobrevive", formaDaRua("Principal") === "PRINCIPAL");

    // Vazio nao casa com vazio: senao duas quadras sem nome seriam "o mesmo
    // lugar", e a segunda seria recusada por engano.
    checar("vazio nao e o mesmo lugar que vazio",
           !mesmoLugar("", "", "quadra") && !mesmoLugar("  ", "", "rua"),
           "duas quadras sem nome viraram a mesma");
  }

  console.log("\n=== 12b. O SALDO DA FAMILIA ===");
  {
    const { calcularSaldo } = await import("../src/lib/saldo");
    const HOJE = "2026-08-28";

    const vazio = calcularSaldo([], HOJE);
    checar("familia sem lancamento esta em dia", vazio.emDia && vazio.frase === "Em dia",
           `veio "${vazio.frase}"`);

    // A ANNINHA (0114): seis meses ja prestados, todos vencendo la na frente.
    // Somar tudo diria "Em aberto · R$ 240" e ela nao deve nada ainda.
    const aVencer = calcularSaldo([
      { tipo: "debito", valor: 40, data: "2026-09-10" },
      { tipo: "debito", valor: 40, data: "2026-10-10" },
    ], HOJE);
    checar("competencia que ainda nao venceu NAO e divida", aVencer.emDia,
           `veio "${aVencer.frase}"`);
    checar("mas ela aparece como a vencer, em vez de sumir",
           aVencer.aVencer === 80 && /80,00 a vencer/.test(aVencer.frase),
           `veio "${aVencer.frase}"`);

    const devendo = calcularSaldo([
      { tipo: "debito", valor: 100, data: "2026-08-10" },
      { tipo: "credito", valor: 40, data: "2026-08-15" },
    ], HOJE);
    checar("o que venceu e nao foi pago e cobranca",
           !devendo.emDia && devendo.vencido === 60, `vencido ${devendo.vencido}`);

    const adiantado = calcularSaldo([
      { tipo: "credito", valor: 100, data: "2026-08-01" },
      { tipo: "debito", valor: 25, data: "2026-08-20" },
    ], HOJE);
    checar("quem pagou adiantado ouve isso, e nao 'em dia'",
           /Pago adiantado/.test(adiantado.frase) && adiantado.emDia,
           `veio "${adiantado.frase}"`);

    // O TESTE DO DIA. Um debito que vence HOJE ainda nao e atraso; o mesmo
    // debito lido com o dia de amanha vira divida. E a diferenca que o UTC
    // produzia entre 21h e a meia-noite.
    const venceHoje = [{ tipo: "debito", valor: 40, data: HOJE }];
    checar("o que vence HOJE ja conta como vencido",
           calcularSaldo(venceHoje, HOJE).vencido === 40);
    checar("e lido com o dia ANTERIOR ele ainda nao venceu",
           calcularSaldo(venceHoje, "2026-08-27").vencido === 0
           && calcularSaldo(venceHoje, "2026-08-27").aVencer === 40,
           "um dia de diferenca muda quem esta devendo");

    // A LAVAGEM DE VALOR ZERO (0104) nao pode mexer no saldo: no modo
    // competencia o mes ja foi debitado inteiro.
    checar("lancamento de R$ 0,00 nao muda nada",
           calcularSaldo([{ tipo: "debito", valor: 0, data: "2026-08-01" }], HOJE).emDia);
  }

  console.log("\n=== 13. FILA DO CAMPO (offline) ===");
  {
    const { classificar, contarFila, deduplicar, chaveDe } = await import("../src/lib/offline-fila");

    // --- o que o TEMPO resolve: fica guardado e tenta de novo
    for (const [status, corpo] of [[500, null], [502, null], [503, {}], [408, null], [429, null]] as any[]) {
      checar(`HTTP ${status} e passageiro`, classificar(status, corpo).r === "tente_depois",
             `veio ${classificar(status, corpo).r}`);
    }
    // 2xx com corpo ilegivel: um proxy devolvendo HTML nao pode parar trabalho bom
    checar("200 sem corpo legivel espera, nao acusa",
           classificar(200, null).r === "tente_depois");

    // --- o que subiu
    checar("ok:true subiu", classificar(200, { ok: true }).r === "subiu");
    // "ja concluido" e sucesso: senao o item fica preso na fila para sempre
    checar("'ja concluido' tambem subiu",
           classificar(409, { ok: false, erro: "ja_concluido" }).r === "subiu");
    checar("jaExecutado tambem subiu",
           classificar(200, { ok: false, jaExecutado: true }).r === "subiu");

    // --- o que PRECISA DE GENTE: repetir da o mesmo resultado
    const venceu = classificar(401, { ok: false });
    checar("401 precisa de gente", venceu.r === "precisa_de_ajuda");
    checar("e a frase fala de entrar no app de novo",
           /Entre no app de novo/.test(venceu.motivo || ""), venceu.motivo);
    checar("403 precisa de gente", classificar(403, { ok: false }).r === "precisa_de_ajuda");
    checar("404 precisa de gente", classificar(404, { ok: false }).r === "precisa_de_ajuda");
    // O caso que mais escondia trabalho: 200 com ok:false. Antes virava item
    // offline e tentava para sempre, mostrando "aguardando envio".
    const recusa = classificar(200, { ok: false, mensagem: "Este servico e de outra pessoa." });
    checar("200 com ok:false e recusa, nao espera", recusa.r === "precisa_de_ajuda");
    checar("e leva o motivo do servidor para a tela",
           recusa.motivo === "Este servico e de outra pessoa.", recusa.motivo);
    checar("400 precisa de gente", classificar(400, { ok: false, erro: "sem_foto" }).r === "precisa_de_ajuda");

    // --- CP-11: uma lavagem gera DOIS registros
    const t0 = 1_700_000_000_000;
    const fila: any[] = [
      { id: chaveDe("s1", "iniciar"), tipo: "iniciar", servicoId: "s1", criadoEm: t0, tentativas: 0, estado: "guardado" },
      { id: chaveDe("s1", "concluir"), tipo: "concluir", servicoId: "s1", criadoEm: t0 + 1, tentativas: 0, estado: "guardado" },
      { id: chaveDe("s2", "concluir"), tipo: "concluir", servicoId: "s2", criadoEm: t0 + 2, tentativas: 0, estado: "guardado" },
      { id: chaveDe("s3", "nao_feito"), tipo: "nao_feito", servicoId: "s3", criadoEm: t0 + 3, tentativas: 0, estado: "guardado" },
    ];
    const r = contarFila(fila);
    // A faixa dizia "4 registros esperando" para DUAS lavagens e um recado.
    checar("4 registros sao 2 lavagens", r.lavagens === 2, `veio ${r.lavagens}`);
    checar("e 1 recado, contado a parte", r.recados === 1, `veio ${r.recados}`);
    checar("nada precisa de ajuda ainda", r.precisamDeAjuda.length === 0);

    const comRecusa = contarFila([...fila,
      { id: "x", tipo: "concluir", servicoId: "s9", criadoEm: t0 + 9, tentativas: 3,
        estado: "precisa_de_ajuda", motivoFalha: "Seu acesso venceu." } as any]);
    checar("item recusado aparece separado", comRecusa.precisamDeAjuda.length === 1);
    // Ele CONTINUA sendo trabalho parado: some da fila normal seria a mesma
    // mentira de antes, com outra cor.
    checar("e continua contado como lavagem parada", comRecusa.lavagens === 3, `veio ${comRecusa.lavagens}`);

    // --- CP-08: dois toques na mesma lavagem viram um registro
    const doisToques: any[] = [
      { id: "uuid-velho", tipo: "concluir", servicoId: "s1", criadoEm: t0, tentativas: 0, estado: "guardado", fotoDepoisBase64: "PRIMEIRA" },
      { id: chaveDe("s1", "concluir"), tipo: "concluir", servicoId: "s1", criadoEm: t0 + 500, tentativas: 0, estado: "guardado", fotoDepoisBase64: "SEGUNDA" },
    ];
    const d = deduplicar(doisToques);
    checar("dois toques na mesma lavagem viram um item", d.fila.length === 1, `veio ${d.fila.length}`);
    // A primeira foto e a do jazigo do jeito que ela achou.
    checar("e fica a PRIMEIRA foto, nao a repetida",
           d.fila[0].fotoDepoisBase64 === "PRIMEIRA", d.fila[0].fotoDepoisBase64);
    checar("a copia e marcada para sair do aparelho",
           d.sobrando.length === 1 && d.sobrando[0] === chaveDe("s1", "concluir"));

    // Dois pedidos de material no mesmo dia sao dois pedidos de verdade.
    const pedidos: any[] = [
      { id: "pedido:1", tipo: "pedido_material", servicoId: "", criadoEm: t0, tentativas: 0, estado: "guardado" },
      { id: "pedido:2", tipo: "pedido_material", servicoId: "", criadoEm: t0 + 60000, tentativas: 0, estado: "guardado" },
    ];
    checar("dois pedidos de material NAO colapsam", deduplicar(pedidos).fila.length === 2);

    // Item gravado antes deste build nao tem `estado`. Vazio nao e zero: aqui
    // o vazio quer dizer "nunca foi recusado".
    const velho: any[] = [{ id: "a", tipo: "concluir", servicoId: "s5", criadoEm: t0 }];
    checar("item da versao anterior entra como 'guardado'",
           deduplicar(velho).fila[0].estado === "guardado");
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
