/**
 * O DINHEIRO QUE VEM DE PLANILHA.
 *
 * Mora em `lib` e nao na rota por dois motivos: rota do Next so pode exportar
 * handler (exportar daqui quebrava o `tsc`), e este parser vira COBRANCA REAL —
 * merece teste proprio, e agora tem.
 */
/**
 * Dinheiro de planilha em pt-BR. Devolve NaN quando NAO entende — nunca 0 e
 * nunca um valor de conveniencia. O codigo antigo fazia `Number(col) || 40`:
 * celula vazia, "R$ 60" e "60,00" viravam todos R$ 40 no banco, calados, e
 * viravam honorario real na primeira cobranca.
 */
export function numeroPlanilha(bruto: string): number {
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
