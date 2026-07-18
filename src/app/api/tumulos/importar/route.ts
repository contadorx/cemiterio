import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";

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
  let { data: cem } = await db.from("cemiterios").select("id").limit(1).maybeSingle();
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
    const val = iVal >= 0 ? Number(cols[iVal]) || 40 : 40;

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

      // túmulo (evita duplicar mesma identificacao na quadra)
      const { data: tExiste } = await db
        .from("tumulos")
        .select("id")
        .eq("quadra_id", quadraId)
        .eq("identificacao", ident)
        .maybeSingle();
      let tumuloId = (tExiste as any)?.id as string | undefined;
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
            valor_vigente: val,
            data_valor_vigente: new Date().toISOString().slice(0, 10),
            proximo_servico: cad === "avulso" ? null : new Date().toISOString().slice(0, 10),
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
