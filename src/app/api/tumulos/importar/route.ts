import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { diaOperacao } from "@/lib/vencimento";

/**
 * Dinheiro de planilha em pt-BR. Devolve NaN quando NAO entende — nunca 0 e
 * nunca um valor de conveniencia. O codigo antigo fazia `Number(col) || 40`:
 * celula vazia, "R$ 60" e "60,00" viravam todos R$ 40 no banco, calados, e
 * viravam honorario real na primeira cobranca.
 */
function numeroPlanilha(bruto: string): number {
  let t = String(bruto ?? "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!t) return NaN;
  const temPonto = t.includes("."), temVirgula = t.includes(",");
  if (temPonto && temVirgula) {
    // quem manda e o separador MAIS A DIREITA: "1.500,00" e pt-BR, "1,500.00" e
    // planilha exportada em ingles. Assumir pt-BR sempre lia R$ 1.500 como 1,50.
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  }
  else if (temVirgula) t = t.replace(",", ".");
  else if (temPonto) {
    // "60.00" e centavo de export; "1.500" e ambiguo (mil e quinhentos ou 1,5?)
    const dep = t.slice(t.lastIndexOf(".") + 1);
    if (dep.length !== 2) return NaN;
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}

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

  // cemitério padrão
  let { data: cem } = await db.from("cemiterios").select("id").order("nome").limit(1).maybeSingle();
  if (!cem) {
    const { data: novo } = await db
      .from("cemiterios")
      .insert({ org_id: org, nome: "Cemitério da Saudade — Vila Vitória, Mauá" })
      .select("id")
      .single();
    cem = novo as any;
  }
  const cemId = (cem as any).id;

  const quadraCache = new Map<string, string>();
  const clienteCache = new Map<string, string>();
  const res = { clientes: 0, tumulos: 0, planos: 0 };
  const erros: { linha: number; motivo: string }[] = [];
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
        else {
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
          const { data: nc, error } = await db
            .from("clientes")
            .insert({ org_id: org, nome, telefone: tel, modo: "copiloto", ativo_ia: true })
            .select("id")
            .single();
          if (error) throw new Error(`cliente: ${error.message}`);
          clienteId = (nc as any).id;
          res.clientes++;
        }
        clienteCache.set(tel, clienteId!);
      }

      // Tumulo: mesma identificacao na mesma quadra = o MESMO jazigo do mundo
      // real. maybeSingle() aqui estourava quando ja havia duplicata no banco,
      // o erro era descartado e a importacao INSERIA uma terceira copia.
      const { data: cands, error: eBusca } = await db
        .from("tumulos")
        .select("id,cliente_id,identificacao")
        .eq("quadra_id", quadraId)
        .ilike("identificacao", paraIlike(ident))
        .order("identificacao")
        .limit(50);
      if (eBusca) throw new Error(`tumulo: ${eBusca.message}`);
      const alvoIdent = ident.trim().toLowerCase();
      const iguais = (cands || []).filter(
        (t: any) => String(t.identificacao || "").trim().toLowerCase() === alvoIdent
      );
      if (iguais.length > 1) {
        throw new Error(`ja existe mais de um jazigo "${ident}" na quadra ${quadra} — resolva a duplicata antes`);
      }
      const tExiste = iguais[0] as any | undefined;
      let tumuloId = tExiste?.id as string | undefined;
      if (tumuloId) {
        const dono = tExiste.cliente_id as string | null;
        if (dono && dono !== clienteId) {
          // nao rouba jazigo de outra familia por causa de uma planilha
          throw new Error(`o jazigo "${ident}" da quadra ${quadra} ja e de outra familia`);
        }
        if (!dono) {
          const { error } = await db.from("tumulos").update({ cliente_id: clienteId }).eq("id", tumuloId);
          if (error) throw new Error(`tumulo: ${error.message}`);
        }
      }
      if (!tumuloId) {
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
        const { data: pExiste } = await db
          .from("planos")
          .select("id")
          .eq("tumulo_id", tumuloId)
          .eq("ativo", true)
          .maybeSingle();
        if (!pExiste) {
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
    } catch (e: any) {
      erros.push({ linha: i + 1, motivo: String(e?.message || e).slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, criados: res, erros });
}
