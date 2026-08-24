import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { LIMITE_MINUTOS, NOME_ROTINA, IMPACTO_ROTINA, type ChaveRotina } from "@/lib/rotinas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "AS ROTINAS ESTÃO RODANDO?"
 *
 * Responde o que o painel não sabia responder: quando cada automação funcionou
 * pela última vez, e se isso já passou do aceitável.
 *
 * A DIFERENÇA QUE IMPORTA: uma rotina que NUNCA rodou (sem linha na tabela) é
 * tratada como parada, não como "sem novidade". Era exatamente esse caso que a
 * tela antiga pintava de verde com "Nenhum erro registrado ✓".
 */
const CHAVES: ChaveRotina[] = ["minuto", "diario", "convites", "perfis", "webhook"];

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.db
    .from("rotinas")
    .select("chave,ultima_tentativa,ultimo_sucesso,ok,resumo,ultimo_erro");

  // tabela ainda não criada (migration 0039 não rodada): diz isso em vez de
  // fingir que está tudo bem
  if (error) {
    return NextResponse.json({
      ok: false,
      erro: "tabela_ausente",
      dica: "rode migrations/0039_rotinas_heartbeat.sql no SQL Editor",
    });
  }

  const porChave = new Map<string, any>();
  for (const r of (data || []) as any[]) porChave.set(r.chave, r);

  const agora = Date.now();
  const rotinas = CHAVES.map((chave) => {
    const r = porChave.get(chave);
    const ultimo = r?.ultimo_sucesso ? new Date(r.ultimo_sucesso).getTime() : null;
    const minutos = ultimo == null ? null : Math.round((agora - ultimo) / 60000);
    const limite = LIMITE_MINUTOS[chave];
    // nunca rodou OU passou do limite OU a última rodada falhou
    const atrasada = ultimo == null || (minutos != null && minutos > limite) || r?.ok === false;

    return {
      chave,
      nome: NOME_ROTINA[chave],
      impacto: IMPACTO_ROTINA[chave],
      ultimoSucesso: r?.ultimo_sucesso || null,
      ultimaTentativa: r?.ultima_tentativa || null,
      minutosDesde: minutos,
      limiteMinutos: limite,
      nuncaRodou: ultimo == null,
      ultimoErro: r?.ultimo_erro || null,
      resumo: r?.resumo || null,
      atrasada,
    };
  });

  // O WHATSAPP TEM UMA PERGUNTA A MAIS QUE AS OUTRAS ROTINAS.
  //
  // O carimbo diz "chegou alguma coisa". Não diz se essa coisa VIROU mensagem.
  // No dia 23/08 chegaram 70 eventos e o carimbo ficou verde — mas nenhum dos
  // 70 virou mensagem de família. Verde e mudo ao mesmo tempo.
  //
  // `sureya_saude_whatsapp` (0121) responde as duas metades: há quanto tempo
  // está calado, e o que entrou por desfecho. Se a função ainda não existe no
  // banco, a tela mostra as rotinas sem ela em vez de quebrar.
  let whatsapp: any = null;
  try {
    const { data: saude } = await auth.db.rpc("sureya_saude_whatsapp", {});
    if (saude) whatsapp = saude;
  } catch { /* banco sem a 0121: segue sem este bloco */ }

  return NextResponse.json({
    ok: true,
    rotinas,
    whatsapp,
    // o Início só precisa disto para decidir se mostra a faixa vermelha
    problemas: rotinas.filter((r) => r.atrasada).length,
  });
}
