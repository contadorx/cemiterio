// Substitui o SDK do Supabase durante os testes: devolve o banco falso.
export function createClient(): any { return (globalThis as any).__FAKE_SUPABASE__; }
export function createServerClient(): any { return (globalThis as any).__FAKE_SUPABASE__; }
export function createBrowserClient(): any { return (globalThis as any).__FAKE_SUPABASE__; }
export type SupabaseClient = any;
