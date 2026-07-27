/**
 * DATAS DE MEMÓRIA — falecimento e nascimento são guardados como MM-DD.
 *
 * O que importa é o DIA DO ANO (a mensagem de carinho sai todo ano, 7 dias
 * antes), então o ano não é guardado. Antes a rota fazia `slice(-5)` cego:
 * quem digitasse "23-07-1998" gravava "-1998" no banco e a ficha ficava
 * eternamente "com alteração não salva". Aqui a conversão é explícita e
 * recusa o que não entende, para o erro aparecer na tela e não no dado.
 *
 * Aceita: MM-DD · AAAA-MM-DD · DD/MM/AAAA · DD/MM · DD.MM.AAAA
 * Devolve MM-DD, ou null se não der para entender.
 */
export function normalizarMMDD(valor: any): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return "";

  const valida = (mes: string, dia: string) => {
    const m = Number(mes), d = Number(dia);
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  let g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);          // AAAA-MM-DD
  if (g) return valida(g[2], g[3]);

  g = s.match(/^(\d{1,2})-(\d{1,2})$/);                       // MM-DD
  if (g) return valida(g[1], g[2]);

  g = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);         // DD/MM/AAAA
  if (g) return valida(g[2], g[1]);

  g = s.match(/^(\d{1,2})[/.](\d{1,2})$/);                    // DD/MM
  if (g) return valida(g[2], g[1]);

  return null;
}
