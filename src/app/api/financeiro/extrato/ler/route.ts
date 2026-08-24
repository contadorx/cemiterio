import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { lerArquivo, conferir } from "@/lib/extrato";
import { lerExtratoPorIa } from "@/lib/extrato-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * LER O EXTRATO — e não gravar nada.
 *
 * Esta rota devolve as linhas e o VEREDITO da conferência. A gravação é a rota
 * ao lado, e só acontece depois que uma pessoa olhou a prévia. Extrato entrando
 * sozinho no razão, sem ninguém ver, é o tipo de automação que a gente não faz
 * aqui.
 *
 * O SALDO É O JUIZ. Se o arquivo traz saldo por linha, a extração se prova:
 * `saldo[i] − saldo[i−1] == valor[i]` em todas as linhas ou a conferência
 * aponta exatamente onde quebrou. É essa prova que torna seguro deixar a IA
 * ler o PDF — sem ela, um modelo lendo dez páginas de extrato é um chute caro.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const base64 = String(b?.arquivoBase64 || "");
  const nome = String(b?.nome || "");
  const saldoInicial =
    b?.saldoInicial == null || b?.saldoInicial === ""
      ? null
      : Number(String(b.saldoInicial).replace(/\./g, "").replace(",", "."));

  if (!base64) {
    return NextResponse.json({ ok: false, erro: "arquivo_obrigatorio" }, { status: 400 });
  }

  const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  // 12 MB. Extrato de um mês tem dezenas de KB; um arquivo muito maior é outra
  // coisa, e vale recusar antes de gastar leitura de IA com ele.
  if (bytes.length > 12 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, erro: "arquivo_grande", mensagem: "O arquivo passa de 12 MB. Baixe só o período que você quer importar." },
      { status: 400 },
    );
  }

  let { formato, linhas, erro } = lerArquivo(bytes, nome);

  // O PDF NÃO TEM PARSER. Ele vai para a IA — e volta para a mesma conferência
  // de saldo que os outros formatos enfrentam, sem desconto.
  let porIa = false;
  let abertura = saldoInicial;
  if (formato === "pdf") {
    const r = await lerExtratoPorIa(bytes);
    if (r.erro) return NextResponse.json({ ok: false, erro: "leitura_ia", mensagem: r.erro });
    linhas = r.linhas;
    porIa = true;
    // O extrato costuma imprimir o saldo anterior no topo. Se o arquivo
    // declara e ninguém digitou, uso o do arquivo: a prova fica mais forte,
    // porque passa a valer também para a PRIMEIRA linha — que, sem abertura, é
    // a única que a conferência não consegue checar.
    if (abertura == null && r.saldoInicial != null) abertura = r.saldoInicial;
  }

  if (erro) return NextResponse.json({ ok: false, erro: "formato", mensagem: erro, formato });

  const conf = conferir(linhas, abertura);

  return NextResponse.json({
    ok: true,
    formato,
    porIa,
    linhas,
    conferencia: conf,
    saldoInicial: abertura,
    // RECOMENDAR NÃO É DECIDIR. A tela mostra isto e a pessoa escolhe; o único
    // caso em que eu travo de verdade é a conferência ter reprovado.
    podeImportar: conf.fecha !== false && linhas.length > 0,
    aviso:
      conf.fecha === false
        ? `A conta não fecha: ${conf.problema} Não importe assim — baixe o extrato em OFX, que é o formato do banco.`
        : conf.fecha === null
          ? "Este arquivo não traz o saldo linha a linha, então não deu para conferir se veio tudo. Confira o total antes de importar."
          : null,
  });
}
