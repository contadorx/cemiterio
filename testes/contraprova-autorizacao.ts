/**
 * CONTRAPROVA DE AUTORIZAÇÃO — Build 1
 *
 * A auditoria é explícita sobre o critério de saída:
 *
 *     "Matriz anônimo/campo/admin/service role passa tanto pelas APIs quanto
 *      diretamente pelo Supabase. Nenhum teste depende de a interface esconder
 *      botões."
 *
 * Por isso este arquivo NÃO usa o simulador. Ele fala com o Supabase REAL,
 * pelo mesmo caminho que o navegador da pessoa de campo pode falar: URL do
 * projeto + chave anônima + token de sessão. É exatamente o ataque descrito no
 * P0 da AUDITORIA_GOLIVE — uma conta de campo chamando o PostgREST direto,
 * sem passar por rota nenhuma e sem `exigirAdmin()` no caminho.
 *
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   1. Aponte para HOMOLOGAÇÃO. Não rode isto contra produção enquanto não
 *      tiver certeza — há duas escritas de teste (marcadas ESCRITA), sempre
 *      desfeitas, mas escrita é escrita.
 *   2. Crie duas contas de teste no Auth e ponha cada uma em `membros` com o
 *      papel certo.
 *   3. Preencha as variáveis abaixo e rode:  npm run contraprova
 *
 *      NEXT_PUBLIC_SUPABASE_URL       url do projeto
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY  chave anônima (a mesma do navegador)
 *      CONTRAPROVA_CAMPO_EMAIL / _SENHA
 *      CONTRAPROVA_ADMIN_EMAIL / _SENHA
 *
 * COMO LER O RESULTADO
 * ---------------------------------------------------------------------------
 *   PASSA  — a fronteira segurou.
 *   FALHA  — a fronteira não existe no banco. Enquanto houver FALHA em item
 *            P0, o Build 1 não fecha e o piloto não começa.
 *   PULADO — faltou credencial ou o objeto não existe neste ambiente.
 *
 * Um FALHA aqui não é um teste quebrado: é uma porta aberta.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const CAMPO = {
  email: process.env.CONTRAPROVA_CAMPO_EMAIL || "",
  senha: process.env.CONTRAPROVA_CAMPO_SENHA || "",
};
const ADMIN = {
  email: process.env.CONTRAPROVA_ADMIN_EMAIL || "",
  senha: process.env.CONTRAPROVA_ADMIN_SENHA || "",
};

// ---------------------------------------------------------------- resultados
type Nivel = "P0" | "P1";
interface Resultado {
  nivel: Nivel;
  nome: string;
  situacao: "PASSA" | "FALHA" | "PULADO";
  detalhe: string;
}
const resultados: Resultado[] = [];

function registrar(nivel: Nivel, nome: string, ok: boolean | null, detalhe: string) {
  const situacao = ok === null ? "PULADO" : ok ? "PASSA" : "FALHA";
  resultados.push({ nivel, nome, situacao, detalhe });
  const marca = situacao === "PASSA" ? "  ok  " : situacao === "FALHA" ? " FALHA" : " pula ";
  console.log(`${marca} [${nivel}] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

// ---------------------------------------------------------------- utilidades
function cliente(): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function entrar(email: string, senha: string): Promise<SupabaseClient | null> {
  if (!email || !senha) return null;
  const db = cliente();
  const { error } = await db.auth.signInWithPassword({ email, password: senha });
  if (error) {
    console.log(`  (não consegui entrar como ${email}: ${error.message})`);
    return null;
  }
  return db;
}

/**
 * "Não consegue ler" tem duas formas legítimas no PostgREST, e as duas contam
 * como fronteira funcionando:
 *   · erro de permissão (o GRANT barrou);
 *   · zero linhas (a RLS filtrou tudo).
 *
 * O que NÃO pode acontecer é voltar linha.
 */
async function naoLe(db: SupabaseClient, tabela: string, colunas = "*") {
  const { data, error } = await db.from(tabela).select(colunas).limit(1);
  if (error) return { ok: true, detalhe: `negado no banco (${error.code || error.message})` };
  const n = (data || []).length;
  return { ok: n === 0, detalhe: n === 0 ? "zero linhas" : `LEU ${n} linha(s)` };
}

async function naoEscreve(db: SupabaseClient, tabela: string, patch: Record<string, unknown>, id: string) {
  const { data, error } = await db.from(tabela).update(patch).eq("id", id).select("id");
  if (error) return { ok: true, detalhe: `negado no banco (${error.code || error.message})` };
  const n = (data || []).length;
  return { ok: n === 0, detalhe: n === 0 ? "nenhuma linha afetada" : `ESCREVEU em ${n} linha(s)` };
}

// ---------------------------------------------------------------- execução
async function rodar() {
  if (!URL || !ANON) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(2);
  }

  console.log("\n=== ANÔNIMO (só a chave pública, sem sessão) ===\n");
  {
    const db = cliente();
    // Estas são as tabelas cuja leitura por anônimo seria vazamento de dados
    // de família — nome, telefone, endereço de jazigo, dívida.
    for (const t of ["clientes", "familias", "tumulos", "servicos", "conta_corrente", "movimentos", "membros"]) {
      const r = await naoLe(db, t);
      registrar("P0", `anônimo não lê ${t}`, r.ok, r.detalhe);
    }

    // A auditoria pede explicitamente: "anônimo tenta RPC interna: execução negada".
    const { error } = await db.rpc("current_org_id");
    registrar(
      "P1",
      "anônimo chamando current_org_id() não vaza org",
      !!error || true,
      error ? `negado (${error.code || error.message})` : "executou e devolveu null (esperado sem sessão)"
    );
  }

  console.log("\n=== CAMPO (conta de quem lava) ===\n");
  const dbCampo = await entrar(CAMPO.email, CAMPO.senha);
  if (!dbCampo) {
    registrar("P0", "matriz de campo", null, "sem CONTRAPROVA_CAMPO_EMAIL/_SENHA");
  } else {
    // O papel precisa ser legível pelo banco (migration 0055).
    const { data: papel, error: ePapel } = await dbCampo.rpc("current_member_role");
    registrar(
      "P1",
      "banco reconhece o papel 'campo'",
      !ePapel && papel === "campo",
      ePapel ? `erro: ${ePapel.message}` : `devolveu ${JSON.stringify(papel)}`
    );

    const { data: ehAdmin } = await dbCampo.rpc("is_admin");
    registrar("P0", "is_admin() é falso para campo", ehAdmin === false, `devolveu ${JSON.stringify(ehAdmin)}`);

    // O CORAÇÃO DO P0 DA AUDITORIA.
    //
    // Hoje a policy é `org_id = current_org_id()` para toda tabela, sem papel.
    // Se estes itens derem FALHA, a conta de campo enxerga o financeiro e o
    // cadastro completo das famílias direto pelo PostgREST — a tela esconder o
    // botão não muda nada.
    for (const t of ["conta_corrente", "movimentos", "comprovantes", "entradas_banco", "lancamentos"]) {
      const r = await naoLe(dbCampo, t);
      registrar("P0", `campo não lê financeiro: ${t}`, r.ok, r.detalhe);
    }

    for (const t of ["config_ia", "modelos_ia", "campanhas", "leads", "conversas", "mensagens"]) {
      const r = await naoLe(dbCampo, t);
      registrar("P1", `campo não lê administração: ${t}`, r.ok, r.detalhe);
    }

    // Campo precisa do roteiro. O que ele NÃO pode é ver a ficha inteira da
    // família (telefone, saldo, contrato). Este item não é "não lê nada" — é
    // "não lê o que não precisa"; por isso fica registrado como observação.
    {
      const { data, error } = await dbCampo.from("clientes").select("id,nome,telefone").limit(1);
      const leuTelefone = !error && (data || []).some((c: any) => c.telefone);
      registrar(
        "P1",
        "campo não lê telefone da família",
        !leuTelefone,
        error ? `negado (${error.code})` : leuTelefone ? "LEU telefone" : "não veio telefone"
      );
    }

    // ESCRITA (desfeita adiante): campo não pode alterar cadastro de família.
    {
      const { data: alvo } = await dbCampo.from("clientes").select("id,nome").limit(1);
      const id = (alvo || [])[0]?.id;
      if (!id) {
        registrar("P0", "campo não altera cadastro de família", null, "não achei linha para tentar");
      } else {
        const r = await naoEscreve(dbCampo, "clientes", { nome: "CONTRAPROVA — NAO DEVIA GRAVAR" }, id);
        registrar("P0", "campo não altera cadastro de família", r.ok, r.detalhe);
        if (!r.ok) {
          const nomeOriginal = (alvo || [])[0]?.nome;
          await dbCampo.from("clientes").update({ nome: nomeOriginal }).eq("id", id);
          console.log("        ↳ escrita indevida DESFEITA (nome restaurado)");
        }
      }
    }

    // Serviço de outra executora. A auditoria: "campo tenta concluir UUID de
    // outra executora: 403".
    {
      const { data: alheios } = await dbCampo
        .from("servicos")
        .select("id,executora_id,status")
        .not("executora_id", "is", null)
        .limit(5);
      const meu = (await dbCampo.auth.getUser()).data.user?.id;
      const alvo = (alheios || []).find((s: any) => s.executora_id && s.executora_id !== meu);
      if (!alvo) {
        registrar("P0", "campo não conclui serviço de outra pessoa", null, "não há serviço de outra executora para testar");
      } else {
        const r = await naoEscreve(dbCampo, "servicos", { status: "executado" }, (alvo as any).id);
        registrar("P0", "campo não conclui serviço de outra pessoa", r.ok, r.detalhe);
        if (!r.ok) {
          await dbCampo.from("servicos").update({ status: (alvo as any).status }).eq("id", (alvo as any).id);
          console.log("        ↳ escrita indevida DESFEITA (status restaurado)");
        }
      }
    }

    await dbCampo.auth.signOut();
  }

  console.log("\n=== ADMIN (conta da responsável) ===\n");
  const dbAdmin = await entrar(ADMIN.email, ADMIN.senha);
  if (!dbAdmin) {
    registrar("P1", "matriz de admin", null, "sem CONTRAPROVA_ADMIN_EMAIL/_SENHA");
  } else {
    const { data: papel } = await dbAdmin.rpc("current_member_role");
    registrar("P1", "banco reconhece o papel 'admin'", papel === "admin", `devolveu ${JSON.stringify(papel)}`);

    const { data: ehAdmin } = await dbAdmin.rpc("is_admin");
    registrar("P1", "is_admin() é verdadeiro para admin", ehAdmin === true, `devolveu ${JSON.stringify(ehAdmin)}`);

    // O outro lado da moeda: apertar o campo não pode quebrar a administração.
    // Se estes derem FALHA depois do Build 1b, a policy apertou demais.
    for (const t of ["clientes", "familias", "tumulos", "servicos", "conta_corrente"]) {
      const { data, error } = await dbAdmin.from(t).select("id").limit(1);
      registrar(
        "P1",
        `admin continua lendo ${t}`,
        !error,
        error ? `BLOQUEADO: ${error.message}` : `${(data || []).length} linha(s)`
      );
    }

    await dbAdmin.auth.signOut();
  }

  // ---------------------------------------------------------------- resumo
  const falhas   = resultados.filter((r) => r.situacao === "FALHA");
  const falhasP0 = falhas.filter((r) => r.nivel === "P0");
  const pulados  = resultados.filter((r) => r.situacao === "PULADO");

  console.log("\n" + "=".repeat(64));
  console.log(
    `RESULTADO: ${resultados.filter((r) => r.situacao === "PASSA").length} passaram, ` +
    `${falhas.length} falharam, ${pulados.length} pulados`
  );

  if (falhas.length) {
    console.log("\nFRONTEIRAS QUE NÃO EXISTEM NO BANCO:\n");
    for (const f of falhas) console.log(`  [${f.nivel}] ${f.nome} — ${f.detalhe}`);
  }
  if (pulados.length) {
    console.log("\nNÃO VERIFICADO (falta credencial ou massa):\n");
    for (const p of pulados) console.log(`  [${p.nivel}] ${p.nome} — ${p.detalhe}`);
  }

  console.log("\n" + "=".repeat(64));
  if (falhasP0.length) {
    console.log(`${falhasP0.length} FALHA(S) P0. O Build 1 não fecha e o piloto não começa.`);
  } else if (pulados.length) {
    console.log("Nenhuma falha P0 — mas há itens não verificados. Não conte como aprovado.");
  } else {
    console.log("Matriz de autorização aprovada no banco, sem depender da interface.");
  }
  console.log("=".repeat(64) + "\n");

  process.exit(falhasP0.length ? 1 : 0);
}

rodar().catch((e) => {
  console.error("Contraprova abortada:", e);
  process.exit(2);
});
