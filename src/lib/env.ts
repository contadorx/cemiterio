// Variáveis de ambiente da fatia 2. Falha cedo se faltar algo crítico no servidor.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Faltou a variável de ambiente ${name}`);
  return v;
}

export const env = {
  // Supabase
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  // service role só existe no servidor (webhook) — nunca expor no client
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),

  // Anthropic
  anthropicKey: () => req("ANTHROPIC_API_KEY"),
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",

  // Evolution API (WhatsApp, no Contabo)
  evolutionUrl: () => req("EVOLUTION_API_URL"),
  evolutionKey: () => req("EVOLUTION_API_KEY"),
  evolutionInstance: () => req("EVOLUTION_INSTANCE"),

  // Sureya é 1 negócio por enquanto: a org fixa do webhook
  orgId: () => req("SUREYA_ORG_ID"),

  // segurança do webhook (Evolution manda esse segredo)
  webhookSecret: () => req("SUREYA_WEBHOOK_SECRET"),

  // segurança dos crons (Vercel manda Authorization: Bearer <CRON_SECRET>)
  cronSecret: () => process.env.CRON_SECRET || "",

  // transcrição de áudio (opcionais — usa o primeiro disponível)
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  // janela de agrupamento de rajadas (segundos)
  DEBOUNCE_SEGUNDOS: Number(process.env.SUREYA_DEBOUNCE_SEGUNDOS || "20"),

  // score mínimo p/ soltar resposta automática em assunto rotineiro (0-100)
  SCORE_LIMITE_AUTO: Number(process.env.SUREYA_SCORE_LIMITE_AUTO || "80"),
};
