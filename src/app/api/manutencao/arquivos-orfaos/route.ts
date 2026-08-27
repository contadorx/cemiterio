import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * O QUE FICOU PARA TRÁS NO DEPÓSITO.
 *
 * Medido em 27/08 na produção: 282 arquivos que nenhum registro do banco
 * aponta, 105 MB — 36% do balde. 281 deles são de túmulos apagados pela rota
 * de exclusão, que até hoje nunca tocou no Storage.
 *
 * A partir da 0135 a exclusão apaga as fotos junto, então isto para de crescer.
 * Esta rota é para o que JÁ ficou.
 *
 * GET  lista. Não apaga nada.
 * POST apaga — e exige `confirmar: "APAGAR"` no corpo.
 *
 * A PALAVRA NO CORPO NÃO É CERIMÔNIA. Apagar foto é irreversível e não há
 * desfazer: o botão que confirma isso na tela já pergunta, mas um POST desta
 * rota também sai de um `curl`, de um teste, de um script de outra pessoa. A
 * palavra é o que separa "eu quis" de "eu chamei sem ler".
 */

interface Orfao {
  balde: string;
  caminho: string;
  bytes: number;
  criado_em: string;
  dono_sumido: boolean;
}

async function listar(): Promise<Orfao[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("sureya_arquivos_orfaos");
  if (error) throw new Error(error.message);
  return (data || []) as Orfao[];
}

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  try {
    const orfaos = await listar();
    const bytes = orfaos.reduce((s, o) => s + (Number(o.bytes) || 0), 0);
    return NextResponse.json({
      ok: true,
      total: orfaos.length,
      bytes,
      mb: Math.round((bytes / 1048576) * 10) / 10,
      // A separação importa para decidir: "o dono sumiu" é sobra de exclusão,
      // e é seguro. O resto pode ser upload que nunca foi ligado a nada —
      // olhe antes.
      deTumuloApagado: orfaos.filter((o) => o.dono_sumido).length,
      outros: orfaos.filter((o) => !o.dono_sumido),
      amostra: orfaos.slice(0, 20),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falhou" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (b?.confirmar !== "APAGAR") {
    return NextResponse.json({
      ok: false, erro: "sem_confirmacao",
      mensagem: 'Para apagar, mande { "confirmar": "APAGAR" }. Não há desfazer.',
    }, { status: 400 });
  }

  // POR PADRÃO, SÓ O QUE TEM DONO SUMIDO.
  // É a sobra de exclusão, e sobre ela não há dúvida: o túmulo não existe mais,
  // ninguém aponta para o arquivo, e ele nunca mais vai aparecer em tela. O
  // resto exige pedir explicitamente, porque "não referenciado" pode ser um
  // upload em andamento no minuto em que a lista foi lida.
  const soDonoSumido = b?.incluirOutros !== true;

  try {
    const todos = await listar();
    const alvos = soDonoSumido ? todos.filter((o) => o.dono_sumido) : todos;
    if (!alvos.length) return NextResponse.json({ ok: true, removidos: 0, falharam: [] });

    const db = supabaseAdmin();
    const porBalde = new Map<string, string[]>();
    for (const o of alvos) porBalde.set(o.balde, [...(porBalde.get(o.balde) || []), o.caminho]);

    let removidos = 0;
    const falharam: string[] = [];
    for (const [balde, caminhos] of porBalde) {
      // Em lotes de 50, como `apagarArquivos`: uma lista enorme numa chamada só
      // falha inteira quando um caminho dá problema.
      for (let i = 0; i < caminhos.length; i += 50) {
        const lote = caminhos.slice(i, i + 50);
        const { data, error } = await db.storage.from(balde).remove(lote);
        if (error) { falharam.push(...lote.map((c) => `${balde}/${c}`)); continue; }
        removidos += data?.length ?? lote.length;
      }
    }

    // FICA REGISTRADO. Apagar 105 MB de foto sem deixar rastro de quem e quando
    // seria trocar um problema por outro.
    //
    // DUAS COISAS QUE EU QUASE ERREI AQUI, e as duas seriam MUDAS:
    //   `detalhe` é o SEXTO parâmetro de `auditar`, não uma chave de `alvo` —
    //   dentro de `alvo` ele seria simplesmente descartado;
    //   e `auditoria.alvo_id` é UUID, então "orfaos" faria o insert estourar.
    //   `auditar` engole a exceção de propósito (auditoria não derruba
    //   operação), então o registro nunca existiria e este comentário estaria
    //   mentindo.
    // Sem `id`: a faxina não tem um alvo único, e o que importa está no detalhe.
    const org = await orgAtual(auth.db);
    if (org) {
      await auditar(
        auth.db, org, auth.userId, "faxina_arquivos_orfaos",
        { tipo: "storage" },
        { pedidos: alvos.length, removidos, falharam: falharam.length, soDonoSumido },
      );
    }

    return NextResponse.json({ ok: true, removidos, falharam: falharam.slice(0, 50) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falhou" }, { status: 500 });
  }
}
