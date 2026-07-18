/**
 * Confere valores de enum gravados no banco.
 *
 * Foi assim que o botão "Registrar pagamento" ficou quebrado: a função gravava
 * origem = 'manual', valor que não existe no enum. O build passa (é string) e o
 * erro só aparece quando alguém clica.
 *
 * Para não dar falso positivo, só olha campos DENTRO de um insert/update numa
 * tabela conhecida — `tipo` numa ocorrência é outra coisa que `tipo` num movimento.
 */
const fs = require("fs");
const path = require("path");

// coluna enum → valores válidos, por tabela (conferidos no banco)
const POR_TABELA = {
  movimentos: {
    origem: ["pix_comprovante", "conciliacao_manual", "psp_auto", "servico", "ajuste"],
    tipo: ["credito", "debito"],
    status_conc: ["a_conferir", "confirmado", "rejeitado"],
  },
  servicos: { status: ["pendente", "agendado", "executado", "pulado", "cancelado"] },
  mensagens: {
    direcao: ["entrada", "saida"],
    autor: ["cliente", "ia", "humano", "sistema", "campo"],
  },
  membros: { papel: ["admin", "campo"] },
  clientes: {
    modo: ["automatico", "copiloto"],
    regua_cobranca: ["suave", "padrao", "firme", "nao_cobrar"],
  },
  planos: {
    cadencia: ["mensal", "bimestral", "trimestral", "semestral", "anual", "avulso", "por_data"],
    momento_cobranca: ["antes", "depois", "contra_foto"],
  },
  interacoes_ia: {
    acao_humana: ["aprovou", "editou", "descartou", "enviou_direto"],
    assunto: ["cobranca", "agendamento", "duvida", "luto", "reclamacao", "outro"],
  },
  conversas: {
    estado: ["sem_movimento", "sem_resposta", "lida_sem_resposta", "respondida"],
    ultimo_assunto: ["cobranca", "agendamento", "duvida", "luto", "reclamacao", "outro"],
  },
};

function arquivos(dir, saida = []) {
  if (!fs.existsSync(dir)) return saida;
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) arquivos(p, saida);
    else if (/\.tsx?$/.test(it.name)) saida.push(p);
  }
  return saida;
}

const erros = [];
for (const p of [...arquivos("src/lib"), ...arquivos("src/app")]) {
  const linhas = fs.readFileSync(p, "utf8").split("\n");

  linhas.forEach((l, i) => {
    // qual tabela estava sendo tocada nas ~20 linhas anteriores?
    let tabela = null;
    for (let j = i; j >= Math.max(0, i - 20); j--) {
      const m = linhas[j].match(/\.from\(["']([a-z_]+)["']\)/);
      if (m) { tabela = m[1]; break; }
    }
    if (!tabela || !POR_TABELA[tabela]) return;

    for (const [campo, validos] of Object.entries(POR_TABELA[tabela])) {
      const re = new RegExp(`\\b${campo}\\s*:\\s*["']([a-z_]+)["']`, "g");
      let m;
      while ((m = re.exec(l))) {
        if (!validos.includes(m[1])) {
          erros.push(`${p}:${i + 1}  ${tabela}.${campo} = "${m[1]}"  →  ${validos.join(" | ")}`);
        }
      }
    }
  });
}

if (erros.length) {
  console.log(`\n${erros.length} valor(es) de enum inválido(s):\n`);
  erros.forEach((e) => console.log("  " + e));
  console.log("");
  process.exit(1);
}
console.log("Valores de enum: todos válidos.");
