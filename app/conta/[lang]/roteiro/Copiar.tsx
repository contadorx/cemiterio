'use client';
/* O link do caso, com um botão que copia.
 *
 * Quem coordena não abre o link: manda para alguém. Sem o botão, copiar um
 * endereço de duzentos caracteres é selecionar texto com o mouse dentro de uma
 * tabela — que é onde as pessoas erram e mandam o link pela metade.
 *
 * Sem JavaScript o `<a>` continua ali e continua clicável; o que se perde é o
 * atalho, não a função.
 */
import { useState } from 'react';

export default function Copiar(
  { href, abrir, copiar, copiado }:
  { href: string; abrir: string; copiar: string; copiado: string },
) {
  const [feito, setFeito] = useState(false);
  const cheio = typeof window === 'undefined' ? href : new URL(href, window.location.origin).toString();
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                   justifyContent: 'flex-end' }}>
      <a className="btn ghost" href={href} target="_blank" rel="noopener"
         style={{ padding: '3px 9px', fontSize: 12.5 }}>{abrir}</a>
      <button type="button" className="btn ghost" style={{ padding: '3px 9px', fontSize: 12.5 }}
              onClick={() => {
                navigator.clipboard?.writeText(cheio).then(
                  () => { setFeito(true); setTimeout(() => setFeito(false), 2500); },
                  () => {},
                );
              }}>
        {feito ? copiado : copiar}
      </button>
    </span>
  );
}
