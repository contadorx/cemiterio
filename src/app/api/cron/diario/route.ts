import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { avisosSaldoBaixo, cobrancaGentil } from "@/lib/proativo";
import { rotinaDeMemoria } from "@/lib/memoria";
import { cobrarContratos, rodarRegua } from "@/lib/cobranca";
import { gerarEsteiraDeExtras } from "@/lib/extras";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";
import { registrarErro } from "@/lib/monitor";
import { carimbarRotina } from "@/lib/rotinas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rotina da manhã: monta a agenda do período e prepara os rascunhos proativos.
// Convites (ativação) e destilação de perfis rodam em crons próprios, para que
// uma falha em um não derrube os outros.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ ok: false, erro: "cron_nao_autorizado (defina CRON_SECRET)" }, { status: 401 });
  }

  const resultado: Record<string, any> = { ok: true };

  // cada etapa é independente: se uma falhar, as outras seguem
  try {
    const gerados = await gerarServicosDevidos(30);
    const aloc = await alocarAgenda();
    resultado.agenda = { gerados: gerados.criados, ...aloc };
  } catch (e) {
    await registrarErro("cron_diario_agenda", e);
    resultado.agenda = { erro: true };
  }

  try {
    resultado.rascunhos = {
      saldo: await avisosSaldoBaixo(),
      cobranca: await cobrancaGentil(),
    };
  } catch (e) {
    await registrarErro("cron_diario_proativos", e);
    resultado.rascunhos = { erro: true };
  }

  // A COBRANÇA DO CONTRATO (0104). Etapa própria: cobrar é a coisa mais
  // delicada que a rotina faz, e não pode cair junto com a agenda nem levá-la.
  //
  // Antes daqui não havia etapa nenhuma — quem gerava dívida era a limpeza, um
  // efeito colateral de um evento de campo. Agora é uma decisão de dinheiro
  // explícita, com hora marcada e resultado registrado.
  try {
    resultado.cobranca = await cobrarContratos();
  } catch (e) {
    await registrarErro("cron_diario_cobranca", e);
    resultado.cobranca = { erro: true };
  }

  // A RÉGUA DE COBRANÇA (0111). DEPOIS de cobrar: a régua persegue dívida, e a
  // dívida de hoje pode ter nascido na etapa acima desta mesma rotina.
  //
  // Ela ENFILEIRA, não envia — não há caminho dela para o WhatsApp.
  try {
    resultado.regua = await rodarRegua();
  } catch (e) {
    await registrarErro("cron_diario_regua", e);
    resultado.regua = { erro: true };
  }

  // A ESTEIRA DAS FLORES (0117). Enche as datas previstas até o horizonte.
  //
  // Etapa própria porque é operação, não dinheiro: ela não cobra nada — quem
  // cobra é a entrega, e entrega é o Leandro apertando o botão no sábado.
  //
  // A tela também gera ao abrir, e de propósito: chegar no sábado de manhã e
  // não ver o sábado porque o cron falhou na madrugada seria o pior momento
  // possível para descobrir isso. Gerar é convergente, então os dois caminhos
  // não brigam.
  try {
    resultado.flores = await gerarEsteiraDeExtras();
  } catch (e) {
    await registrarErro("cron_diario_flores", e);
    resultado.flores = { erro: true };
  }

  // AS DATAS DE MEMÓRIA. Etapa própria, com try próprio: uma falha aqui não
  // pode levar a agenda do dia junto — e o inverso também não.
  //
  // Saiu daqui `gatilhosDeData()`, o motor velho: MM-DD sem ano, por túmulo,
  // sem nenhuma supressão de luto ou frequência. Ver a nota em `proativo.ts`.
  // O de agora é o da 0096, que não tem caminho para furar os limites.
  try {
    resultado.memoria = await rotinaDeMemoria();
  } catch (e) {
    await registrarErro("cron_diario_memoria", e);
    resultado.memoria = { erro: true };
  }

  // "ok" so quando NENHUMA etapa falhou: meia rotina nao pode passar por
  // rotina inteira no painel.
  const tudoOk = !resultado.agenda?.erro && !resultado.rascunhos?.erro
                 && !resultado.memoria?.erro && !resultado.cobranca?.erro
                 && !resultado.regua?.erro && !resultado.flores?.erro;
  await carimbarRotina("diario", tudoOk, resultado,
    tudoOk ? undefined : "uma das etapas falhou — veja erros_log");

  return NextResponse.json(resultado);
}
