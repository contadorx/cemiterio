/**
 * GERA COMPROVANTES EM PDF PARA O TESTE.
 *
 * Eles são PDFs DE VERDADE — fluxo comprimido com zlib, texto posicionado com
 * Td/Tj, igual ao que um banco produz. O leitor exercitado é o mesmo que roda
 * em produção, do deflate até a remontagem das linhas; nada aqui é um atalho
 * que entrega o texto pronto.
 *
 * OS NOMES SÃO INVENTADOS. Comprovante de verdade tem nome, CPF e valor de
 * família real, e isso não entra no repositório.
 *
 *   node testes/fixtures/fazer-comprovantes-pdf.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

function pdf(linhas) {
  // Uma linha por Td, descendo 16 pontos — o mesmo desenho de um comprovante.
  let corpo = "BT\n/F1 11 Tf\n";
  let y = 780;
  for (const l of linhas) {
    const esc = String(l).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    corpo += `1 0 0 1 56 ${y} Tm\n(${esc}) Tj\n`;
    y -= 16;
  }
  corpo += "ET\n";

  const fluxo = deflateSync(Buffer.from(corpo, "latin1"));
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    null, // o fluxo, montado abaixo
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const partes = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [];
  let pos = partes[0].length;

  objs.forEach((o, i) => {
    const n = i + 1;
    offsets.push(pos);
    let b;
    if (o === null) {
      const cab = Buffer.from(
        `${n} 0 obj\n<< /Length ${fluxo.length} /Filter /FlateDecode >>\nstream\n`, "latin1");
      b = Buffer.concat([cab, fluxo, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    } else {
      b = Buffer.from(`${n} 0 obj\n${o}\nendobj\n`, "latin1");
    }
    partes.push(b);
    pos += b.length;
  });

  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += String(o).padStart(10, "0") + " 00000 n \n";
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  partes.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(partes);
}

// ---------------------------------------------------------------------------
// OS QUATRO FORMATOS QUE CHEGAM DE VERDADE.
//
// Mudam o rótulo, a ordem dos blocos e onde o valor aparece — que é
// exatamente onde um leitor frouxo erra.
// ---------------------------------------------------------------------------
const modelos = {
  // 1. Pagador e recebedor em blocos, valor com rótulo. O formato mais comum.
  "comprovante-blocos.pdf": [
    "Comprovante de transferencia - Pix",
    "",
    "Valor: R$ 40,00",
    "Data da transacao: 07/11/2026",
    "Horario: 14:32",
    "",
    "Dados de quem pagou",
    "Nome: Katia Ferreira dos Santos",
    "CPF: ***.123.456-**",
    "Instituicao: BANCO EXEMPLO S.A.",
    "",
    "Dados de quem recebeu",
    "Nome: Sureya Servicos de Limpeza",
    "CPF/CNPJ: **.345.678/0001-**",
    "",
    "ID da transacao: E18236120202611071432abcdef012ab",
  ],
  // 2. Rótulo e nome na MESMA linha, sem bloco; E2E chamado de "autenticacao".
  "comprovante-em-linha.pdf": [
    "PIX REALIZADO COM SUCESSO",
    "Pagador: Josiane Aparecida Lima",
    "Recebedor: Sureya Servicos de Limpeza",
    "Valor total R$ 120,00",
    "Pago em 03/11/2026",
    "Autenticacao E00000000202611030915zzzz9988776",
  ],
  // 3. Tem tarifa e saldo no papel: o valor certo NÃO é o maior nem o primeiro.
  "comprovante-com-tarifa.pdf": [
    "Comprovante de Pix",
    "Saldo anterior: R$ 2.540,00",
    "Valor do Pix: R$ 80,00",
    "Tarifa: R$ 0,00",
    "Data: 05/11/2026",
    "Origem",
    "Sandra Regina Mendes de Lima",
    "Destino",
    "Sureya Servicos de Limpeza",
    "E18236120202611051020aaaabbbbccc",
  ],
  // 4. SEM identificador e SEM rótulo de pagador: o leitor tem de ficar
  //    modesto em vez de inventar — confianca media e nome nulo.
  "comprovante-magro.pdf": [
    "Comprovante de pagamento",
    "R$ 40,00",
    "10/11/2026",
    "Transferencia realizada",
  ],
  // 5. NÃO é comprovante: um orcamento com R$ dentro. Registrar isto seria
  //    creditar dinheiro que ninguem mandou.
  "nao-e-comprovante.pdf": [
    "Orcamento de servicos funerarios",
    "Lapide em granito: R$ 1.200,00",
    "Vencimento em 30/12/2026",
    "Assinatura do responsavel",
  ],
};

for (const [nome, linhas] of Object.entries(modelos)) {
  writeFileSync(join(AQUI, nome), pdf(linhas));
  console.log("  escrito", nome);
}
