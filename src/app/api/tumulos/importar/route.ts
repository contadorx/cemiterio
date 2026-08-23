import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { diaOperacao } from "@/lib/vencimento";
import { resolverCemiterio, explicarErroJazigo } from "@/lib/jazigo";
import { numeroPlanilha } from "@/lib/planilha";

/**
 * `%` e `_` sao curingas do ilike: sem escapar, "L_128" casa com "L-128".
 * `*` NAO entra aqui: o PostgREST troca `*` por `%` sem olhar escape, entao
 * `\*` viraria um `%` literal e a busca deixaria de achar o proprio jazigo —
 * falso negativo cria copia. Como a igualdade final e decidida no JS, deixar o
 * `*` virar curinga so traz candidatos a mais, que o filtro descarta.
 */
function paraIlike(x: string): string {
  return x.replace(/([\\%_])/g, "\\$1");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { csv } — colunas (cabeçalho obrigatório, ; ou ,):
// quadra;identificacao;falecido;cliente_nome;telefone;cadencia;qtd;valor
// (falecido, cadencia, qtd e valor são opcionais; sem cadencia => sem plano)
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const csv = (body?.csv || "").trim();

  // A PRÉVIA — nada é escrito.
  //
  // Esta rota escrevia direto: você cola o CSV e ele grava. Para 250 cadastros
  // recolhidos à mão no cemitério, um cabeçalho trocado cria 250 registros
  // errados em produção — e desfazer isso é pior que refazer a coleta.
  //
  // Com `previa: true` ela percorre exatamente as mesmas linhas, faz as mesmas
  // consultas de reconhecimento, e devolve o que FARIA. Uma linha por linha do
  // arquivo, dizendo qual das quatro coisas acontece: cria, liga a um jazigo
  // que já existe, não faz nada porque já está tudo lá, ou recusa e diz por quê.
  const previa = body?.previa === true;
  if (!csv) return NextResponse.json({ ok: false, erro: "csv_vazio" }, { status: 400 });

  const linhas = csv.split(/\r?\n/).filter((l: string) => l.trim());
  if (linhas.length < 2) return NextResponse.json({ ok: false, erro: "sem_dados" }, { status: 400 });
  if (linhas.length > 501) return NextResponse.json({ ok: false, erro: "max_500_linhas" }, { status: 400 });

  const sep = linhas[0].includes(";") ? ";" : ",";
  const header = linhas[0].split(sep).map((h: string) => h.trim().toLowerCase());
  const idx = (nome: string) => header.indexOf(nome);
  const iQuadra = idx("quadra");
  const iIdent = idx("identificacao");
  const iFal = idx("falecido");
  const iNome = idx("cliente_nome");
  const iTel = idx("telefone");
  const iCad = idx("cadencia");
  const iQtd = idx("qtd");
  const iVal = idx("valor");

  if (iQuadra < 0 || iIdent < 0 || iNome < 0 || iTel < 0) {
    return NextResponse.json(
      { ok: false, erro: "cabecalho: quadra;identificacao;falecido;cliente_nome;telefone;cadencia;qtd;valor" },
      { status: 400 }
    );
  }

  // CEMITÉRIO (0044). Antes: pegava o primeiro em ordem alfabética e, se não
  // houvesse nenhum, criava um com o nome do Cemitério da Saudade CRAVADO no
  // código — o que dava errado na primeira importação de outro lugar.
  // Agora: o informado no corpo, ou o único cadastrado; com vários, recusa.
  const rc = await resolverCemiterio(db, org, (body as any)?.cemiterioId);
  if (!rc.ok) {
    return NextResponse.json({
      ok: false, erro: rc.erro,
      mensagem: explicarErroJazigo(rc.erro, (rc as any).detalhe),
    }, { status: 400 });
  }
  const cemId = rc.cemiterioId;

  const quadraCache = new Map<string, string>();
  const clienteCache = new Map<string, string>();
  const res = { clientes: 0, tumulos: 0, planos: 0 };
  const erros: { linha: number; motivo: string }[] = [];
  /** Uma linha por linha do CSV, só no modo prévia. */
  const plano: {
    linha: number; quadra: string; jazigo: string; familia: string;
    acao: string; detalhe: string;
  }[] = [];
  const cadenciasOk = ["mensal", "bimestral", "trimestral", "semestral", "anual", "avulso"];

  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(sep).map((c: string) => c.trim());
    const quadra = cols[iQuadra] || "S/Q";
    const ident = cols[iIdent];
    const falecido = iFal >= 0 ? cols[iFal] || null : null;
    const nome = cols[iNome];
    const tel = normalizarTelefone(cols[iTel] || "");
    const cad = iCad >= 0 ? (cols[iCad] || "").toLowerCase() : "";
    const qtd = iQtd >= 0 ? Number(cols[iQtd]) || 1 : 1;
    const val = iVal >= 0 ? numeroPlanilha(cols[iVal]) : NaN;

    if (!ident || !nome || !tel) {
      erros.push({ linha: i + 1, motivo: "faltou identificacao, cliente_nome ou telefone" });
      continue;
    }

    try {
      // quadra
      let quadraId = quadraCache.get(quadra);
      if (!quadraId) {
        const { data: q } = await db
          .from("quadras")
          .select("id")
          .eq("cemiterio_id", cemId)
          .eq("codigo", quadra)
          .maybeSingle();
        if (q) quadraId = (q as any).id;
        else if (previa) {
          // Quadra que não existe: nada abaixo dela pode existir também. O
          // sentinela evita consultar o banco por um id que não há.
          quadraId = "NOVA";
        } else {
          const { data: nq, error } = await db
            .from("quadras")
            .insert({ org_id: org, cemiterio_id: cemId, codigo: quadra })
            .select("id")
            .single();
          if (error) throw new Error(`quadra: ${error.message}`);
          quadraId = (nq as any).id;
        }
        quadraCache.set(quadra, quadraId!);
      }

      // cliente por telefone
      let clienteId = clienteCache.get(tel);
      if (!clienteId) {
        const { data: c } = await db
          .from("clientes")
          .select("id")
          .eq("telefone", tel)
          .maybeSingle();
        if (c) clienteId = (c as any).id;
        else {
          if (!previa) {
            const { data: nc, error } = await db
              .from("clientes")
              .insert({ org_id: org, nome, telefone: tel, modo: "copiloto", ativo_ia: true })
              .select("id")
              .single();
            if (error) throw new Error(`cliente: ${error.message}`);
            clienteId = (nc as any).id;
          } else {
            clienteId = "NOVO";
          }
          res.clientes++;
        }
        clienteCache.set(tel, clienteId!);
      }

      // Tumulo: mesma identificacao na mesma quadra = o MESMO jazigo do mundo
      // real. maybeSingle() aqui estourava quando ja havia duplicata no banco,
      // o erro era descartado e a importacao INSERIA uma terceira copia.
      // Quadra nova (só na prévia) => o jazigo é necessariamente novo, e não
      // há id real para consultar.
      const cands = quadraId === "NOVA" ? [] : await (async () => {
        const { data, error } = await db
          .from("tumulos")
          .select("id,cliente_id,identificacao")
          .eq("quadra_id", quadraId)
          .ilike("identificacao", paraIlike(ident))
          .order("identificacao")
          .limit(50);
        if (error) throw new Error(`tumulo: ${error.message}`);
        return data || [];
      })();
      const alvoIdent = ident.trim().toLowerCase();
      const iguais = (cands || []).filter(
        (t: any) => String(t.identificacao || "").trim().toLowerCase() === alvoIdent
      );
      if (iguais.length > 1) {
        throw new Error(`ja existe mais de um jazigo "${ident}" na quadra ${quadra} — resolva a duplicata antes`);
      }
      const tExiste = iguais[0] as any | undefined;
      let tumuloId = tExiste?.id as string | undefined;
      let acao = "", detalhe = "";

      if (tumuloId) {
        const dono = tExiste.cliente_id as string | null;
        if (dono && dono !== clienteId) {
          // nao rouba jazigo de outra familia por causa de uma planilha
          throw new Error(`o jazigo "${ident}" da quadra ${quadra} ja e de outra familia`);
        }
        if (!dono) {
          acao = "ligar";
          detalhe = "o jazigo já existe sem dono — passa a ser desta família";
          if (!previa) {
            const { error } = await db.from("tumulos").update({ cliente_id: clienteId }).eq("id", tumuloId);
            if (error) throw new Error(`tumulo: ${error.message}`);
          }
        } else {
          acao = "nada a fazer";
          detalhe = "o jazigo já é desta família";
        }
      }
      if (!tumuloId) {
        acao = "criar";
        detalhe = clienteId === "NOVO"
          ? "jazigo e família novos"
          : "jazigo novo para família que já existe";
        if (!previa) {
          const { data: nt, error } = await db
            .from("tumulos")
            .insert({
              org_id: org,
              quadra_id: quadraId,
              cliente_id: clienteId,
              identificacao: ident,
              falecido_nome: falecido,
            })
            .select("id")
            .single();
          if (error) throw new Error(`tumulo: ${error.message}`);
          tumuloId = (nt as any).id;
        } else {
          tumuloId = "NOVO";
        }
        res.tumulos++;
      }

      // plano opcional
      if (cad && cadenciasOk.includes(cad)) {
        // Sem preco legivel nao cria plano e nao inventa numero: a familia e o
        // jazigo ja entraram; so esta linha do plano fica pendente, e dita.
        if (iVal < 0) {
          throw new Error("a planilha tem 'cadencia' mas nao tem a coluna 'valor' — jazigo importado, plano NAO criado");
        }
        if (!isFinite(val) || val <= 0) {
          throw new Error(`valor "${cols[iVal] ?? ""}" nao entendido — jazigo importado, plano NAO criado (use 60 ou 60,00)`);
        }
        const pExiste = tumuloId === "NOVO" ? null : await (async () => {
          const { data } = await db
            .from("planos").select("id")
            .eq("tumulo_id", tumuloId).eq("ativo", true).maybeSingle();
          return data;
        })();
        if (!pExiste) {
          detalhe += ` · plano ${cad} de R$ ${val.toFixed(2).replace(".", ",")}`;
          if (previa) { res.planos++; }
          else {
          const { error } = await db.from("planos").insert({
            org_id: org,
            cliente_id: clienteId,
            tumulo_id: tumuloId,
            cadencia: cad,
            qtd_por_passagem: qtd,
            // centavos como no resto do sistema; e diaOperacao() (America/Sao_Paulo)
            // para a importacao das 21h nao datar tudo com o dia de amanha (UTC).
            valor_vigente: Math.round(val * 100) / 100,
            data_valor_vigente: diaOperacao(),
            proximo_servico: cad === "avulso" ? null : diaOperacao(),
          });
          if (error) throw new Error(`plano: ${error.message}`);
          res.planos++;
          }
        }
      }

      if (previa) plano.push({ linha: i + 1, quadra, jazigo: ident, familia: nome, acao, detalhe });
    } catch (e: any) {
      const motivo = String(e?.message || e).slice(0, 200);
      erros.push({ linha: i + 1, motivo });
      if (previa) {
        plano.push({ linha: i + 1, quadra, jazigo: ident || "—", familia: nome || "—",
                     acao: "RECUSA", detalhe: motivo });
      }
    }
  }

  if (previa) {
    // O RESUMO É O QUE SE OLHA; A LISTA É PARA CONFERIR A LINHA SUSPEITA.
    const conta = (a: string) => plano.filter((p) => p.acao === a).length;
    return NextResponse.json({
      ok: true,
      previa: true,
      resumo: {
        linhas: linhas.length - 1,
        criar: conta("criar"),
        ligar: conta("ligar"),
        nadaAFazer: conta("nada a fazer"),
        recusadas: conta("RECUSA"),
        familiasNovas: res.clientes,
        planosNovos: res.planos,
      },
      plano,
      erros,
    });
  }

  return NextResponse.json({ ok: true, criados: res, erros });
}
