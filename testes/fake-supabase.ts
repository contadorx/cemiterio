/**
 * Banco falso em memória com a mesma interface do cliente Supabase.
 * Serve para EXECUTAR o código real do sistema sem tocar em produção.
 * Suporta o subconjunto de operações que o código usa de fato.
 */

type Linha = Record<string, any>;
export type Tabelas = Record<string, Linha[]>;

interface Filtro {
  tipo: "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt" | "is" | "not" | "or";
  col?: string;
  val?: any;
  bruto?: string;
}

// ---------- utilidades ----------
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function comparavel(v: any): any {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
  return v;
}

// Resolve joins aninhados: "clientes(nome)" ou "tumulos(identificacao,quadras(codigo))"
function aplicarSelect(db: Tabelas, tabela: string, linha: Linha, select: string): Linha {
  if (!select || select === "*") return { ...linha };
  const out: Linha = {};
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of select) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());

  for (const p of partes) {
    const m = p.match(/^([a-z_0-9!]+)\(([\s\S]*)\)$/);
    if (m) {
      const nomeRel = m[1].split("!")[0];
      const subSelect = m[2];
      // relação: acha a tabela alvo e a FK
      const alvo = db[nomeRel] || [];
      const fkNaLinha = `${nomeRel.replace(/s$/, "")}_id`; // tumulos -> tumulo_id
      let rel: Linha | null = null;
      if (linha[fkNaLinha] != null) {
        rel = alvo.find((x) => x.id === linha[fkNaLinha]) || null;
      } else {
        // relação inversa (ex.: tumulos dentro de quadras)
        const fkNoAlvo = `${tabela.replace(/s$/, "")}_id`;
        rel = alvo.find((x) => x[fkNoAlvo] === linha.id) || null;
      }
      out[nomeRel] = rel ? aplicarSelect(db, nomeRel, rel, subSelect) : null;
    } else {
      const nome = p.includes(":") ? p.split(":")[1].trim() : p;
      out[nome] = linha[nome] ?? null;
    }
  }
  return out;
}

// ---------- construtor de consulta ----------
class Query implements PromiseLike<any> {
  private filtros: Filtro[] = [];
  private ordens: { col: string; asc: boolean }[] = [];
  private limite: number | null = null;
  private modo: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private select_ = "*";
  private payload: any = null;
  private opcoesUpsert: any = null;
  private singular: "single" | "maybeSingle" | null = null;
  private contar = false;

  constructor(private db: Tabelas, private tabela: string, public log: string[]) {
    if (!this.db[this.tabela]) this.db[this.tabela] = [];
  }

  select(s = "*", opts?: any) {
    this.select_ = s;
    if (opts?.count) this.contar = true;
    return this;
  }
  insert(p: any) { this.modo = "insert"; this.payload = p; return this; }
  update(p: any) { this.modo = "update"; this.payload = p; return this; }
  upsert(p: any, o?: any) { this.modo = "upsert"; this.payload = p; this.opcoesUpsert = o; return this; }
  delete() { this.modo = "delete"; return this; }

  eq(col: string, val: any) { this.filtros.push({ tipo: "eq", col, val }); return this; }
  neq(col: string, val: any) { this.filtros.push({ tipo: "neq", col, val }); return this; }
  in(col: string, val: any[]) { this.filtros.push({ tipo: "in", col, val }); return this; }
  gte(col: string, val: any) { this.filtros.push({ tipo: "gte", col, val }); return this; }
  lte(col: string, val: any) { this.filtros.push({ tipo: "lte", col, val }); return this; }
  gt(col: string, val: any) { this.filtros.push({ tipo: "gt", col, val }); return this; }
  lt(col: string, val: any) { this.filtros.push({ tipo: "lt", col, val }); return this; }
  is(col: string, val: any) { this.filtros.push({ tipo: "is", col, val }); return this; }
  not(col: string, _op: string, val: any) { this.filtros.push({ tipo: "not", col, val }); return this; }
  or(bruto: string) { this.filtros.push({ tipo: "or", bruto }); return this; }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.ordens.push({ col, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limite = n; return this; }
  single() { this.singular = "single"; return this; }
  maybeSingle() { this.singular = "maybeSingle"; return this; }

  private casa(l: Linha): boolean {
    for (const f of this.filtros) {
      if (f.tipo === "or") {
        // formato: "col.eq.valor,col2.is.null"
        const ok = (f.bruto || "").split(",").some((cond) => {
          const [c, op, v] = cond.split(".");
          if (op === "eq") return String(l[c]) === v;
          if (op === "is") return v === "null" ? l[c] == null : l[c] === v;
          return false;
        });
        if (!ok) return false;
        continue;
      }
      const v = l[f.col!];
      switch (f.tipo) {
        case "eq": if (v !== f.val) return false; break;
        case "neq": if (v === f.val) return false; break;
        case "in": if (!(f.val as any[]).includes(v)) return false; break;
        case "gte": if (!(comparavel(v) >= comparavel(f.val))) return false; break;
        case "lte": if (!(comparavel(v) <= comparavel(f.val))) return false; break;
        case "gt": if (!(comparavel(v) > comparavel(f.val))) return false; break;
        case "lt": if (!(comparavel(v) < comparavel(f.val))) return false; break;
        case "is": if (f.val === null ? l[f.col!] != null : v !== f.val) return false; break;
        case "not": if (f.val === null ? l[f.col!] == null : v === f.val) return false; break;
      }
    }
    return true;
  }

  private executar(): { data: any; error: any; count?: number } {
    const tab = this.db[this.tabela];
    this.log.push(`${this.modo.toUpperCase()} ${this.tabela}`);

    if (this.modo === "insert" || this.modo === "upsert") {
      const itens = Array.isArray(this.payload) ? this.payload : [this.payload];
      const criados: Linha[] = [];
      for (const it of itens) {
        if (this.modo === "upsert" && this.opcoesUpsert?.onConflict) {
          const chaves = this.opcoesUpsert.onConflict.split(",").map((s: string) => s.trim());
          const existente = tab.find((l) => chaves.every((k: string) => l[k] === it[k]));
          if (existente) {
            if (this.opcoesUpsert?.ignoreDuplicates) continue;
            Object.assign(existente, it);
            criados.push(existente);
            continue;
          }
        }
        const novo = { id: it.id || uuid(), created_at: new Date().toISOString(), ...it };
        tab.push(novo);
        criados.push(novo);
      }
      const data = criados.map((l) => aplicarSelect(this.db, this.tabela, l, this.select_));
      if (this.singular) return { data: data[0] ?? null, error: data.length ? null : { message: "sem linhas" } };
      return { data, error: null };
    }

    let linhas = tab.filter((l) => this.casa(l));

    if (this.modo === "update") {
      linhas.forEach((l) => Object.assign(l, this.payload));
      const data = linhas.map((l) => aplicarSelect(this.db, this.tabela, l, this.select_));
      if (this.singular) return { data: data[0] ?? null, error: null };
      return { data, error: null };
    }
    if (this.modo === "delete") {
      this.db[this.tabela] = tab.filter((l) => !this.casa(l));
      return { data: null, error: null };
    }

    for (const o of [...this.ordens].reverse()) {
      linhas = [...linhas].sort((a, b) => {
        const av = comparavel(a[o.col]), bv = comparavel(b[o.col]);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    const total = linhas.length;
    if (this.limite != null) linhas = linhas.slice(0, this.limite);
    const data = linhas.map((l) => aplicarSelect(this.db, this.tabela, l, this.select_));

    if (this.contar) return { data: null, error: null, count: total };
    if (this.singular === "single")
      return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: { message: "single(): " + data.length + " linhas" } };
    if (this.singular === "maybeSingle") return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }

  then<R1 = any, R2 = never>(
    ok?: ((v: any) => R1 | PromiseLike<R1>) | null,
    err?: ((r: any) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.executar()).then(ok, err);
  }
}

export function criarFakeSupabase(db: Tabelas, rpcs: Record<string, (args: any) => any> = {}) {
  const log: string[] = [];
  return {
    _log: log,
    _db: db,
    from(tabela: string) {
      return new Query(db, tabela, log);
    },
    async rpc(nome: string, args: any) {
      log.push(`RPC ${nome}`);
      if (!rpcs[nome]) return { data: null, error: { message: `RPC ${nome} não simulada` } };
      try {
        return { data: rpcs[nome](args), error: null };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },
    auth: {
      async getUser() {
        return { data: { user: { id: "user-teste" } } };
      },
    },
    storage: {
      from() {
        return {
          async upload() { return { error: null }; },
          getPublicUrl(p: string) { return { data: { publicUrl: "https://fake/" + p } }; },
        };
      },
    },
  } as any;
}
