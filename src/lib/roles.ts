import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Papel = "admin" | "campo";

interface AuthOk {
  db: SupabaseClient;
  userId: string;
  papel: Papel;
  nome: string;
  erro: null;
}
interface AuthErro {
  db: null;
  userId: null;
  papel: null;
  nome: null;
  erro: NextResponse;
}
export type Auth = AuthOk | AuthErro;

function negar(status: number, erro: string): AuthErro {
  return {
    db: null,
    userId: null,
    papel: null,
    nome: null,
    erro: NextResponse.json({ ok: false, erro }, { status }),
  };
}

async function autenticar(): Promise<Auth> {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return negar(401, "nao_autenticado");

  // SEMPRE filtrar por user_id: a policy de RLS deixa o membro enxergar TODA a
  // equipe da org, entao um limit(1) solto devolve a linha de outra pessoa
  // (foi assim que o dono virou "campo" quando a segunda conta entrou).
  const { data: membro } = await db
    .from("membros")
    .select("papel,nome,ativo")
    .eq("user_id", user.id)
    .maybeSingle();
  const papel = ((membro as any)?.papel as Papel) || null;
  if (!papel) return negar(403, "sem_org");

  // DESLIGAR PRECISA DESLIGAR.
  //
  // `membros.ativo` existe desde a migration 0011 e nao era consultado em
  // lugar nenhum da autenticacao. Marcar a pessoa como inativa mudava a
  // listagem da equipe na tela e mais nada: a sessao dela continuava valida,
  // as rotas continuavam respondendo e a RLS continuava liberando, porque
  // `current_org_id()` tambem nao olhava a coluna.
  //
  // A migration 0055 fecha o lado do banco; esta linha fecha o lado da API.
  // As duas juntas: desligar alguem tira o acesso na hora, sem esperar o
  // token expirar.
  if ((membro as any)?.ativo === false) return negar(403, "membro_inativo");

  return { db, userId: user.id, papel, nome: String((membro as any)?.nome || ""), erro: null };
}

// Qualquer membro logado (admin ou campo). Ex.: agenda do dia, concluir serviço.
export async function exigirLogado(): Promise<Auth> {
  return autenticar();
}

// Somente admin (dono). Ex.: financeiro, conversas, configurações.
export async function exigirAdmin(): Promise<Auth> {
  const a = await autenticar();
  if (a.erro) return a;
  if (a.papel !== "admin") return negar(403, "somente_admin");
  return a;
}
