/* A conferência da assinatura do webhook da Stripe, isolada num módulo.

   Ela mora aqui, e não só dentro do `index.ts` da Edge Function, por um motivo
   prático: esta é a única função do projeto com `verify_jwt` desligado — quem
   chama é a Stripe, que não tem sessão do Supabase — e por isso a assinatura é
   a fechadura INTEIRA. Uma fechadura sem teste é uma porta.

   O `index.ts` importa daqui. O teste também. Assim o que se prova é o código
   que roda, e não uma cópia dele que envelhece em silêncio. */
const enc = new TextEncoder();

export async function assinaturaConfere(corpo, cabec, segredo, agoraMs) {
  if (!segredo) return false;
  /* Formato do cabeçalho: t=1690000000,v1=abc...  */
  const partes = Object.fromEntries(
    String(cabec || '').split(',').map((p) => p.split('=', 2)),
  );
  const t = partes['t'], v1 = partes['v1'];
  if (!t || !v1) return false;

  /* Janela de cinco minutos. Sem ela, um pedido gravado uma vez pode ser
     reenviado para sempre — a assinatura continua válida, e "fatura paga"
     também. */
  const idade = Math.abs((agoraMs ?? Date.now()) / 1000 - Number(t));
  if (!isFinite(idade) || idade > 300) return false;

  const chave = await crypto.subtle.importKey(
    'raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', chave, enc.encode(`${t}.${corpo}`));
  const meu = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  /* Comparação de tempo constante. `meu === v1` vaza, pelo tempo de resposta,
     quantos caracteres do início batem — e com um webhook público isso é um
     oráculo que qualquer um pode consultar à vontade. */
  if (meu.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < meu.length; i++) dif |= meu.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}
