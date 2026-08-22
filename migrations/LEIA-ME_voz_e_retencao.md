# A IA é a Sureya · trava de assuntos críticos · número do jazigo

## 1. Número do jazigo
Campo novo em **ficha → jazigo → Editar → Localização**. É opcional, porque nem
todos estão marcados. Onde existe, aparece junto do local: `QD 1 · RUA 3 · nº 47`
— no cadastro e no app da Nina.

## 2. A IA nunca diz "vou passar para a Sureya"
Isso quebrava a conversa: a família acha que está falando COM a Sureya — e está.
Dizer que vai passar para ela era confuso e soava automático.

**Removido do prompt e do conhecimento.** No lugar, a IA fala como qualquer
pessoa falaria quando não pode resolver na hora:
- "Deixa eu conferir isso direitinho aqui e já te falo."
- "Vou dar uma olhada com calma e te retorno ainda hoje."
- "Preciso ver uma coisa aqui antes de te responder certo."

E há uma regra dura: **nunca inventar** para não parecer que não sabe. Melhor
dizer que vai conferir do que dar um valor ou uma data errada.

## 3. O que nunca vai sozinho, nem com score 100
O score alto diz que a IA acerta o tom naquela família **em assunto de rotina**.
Não diz que ela deve responder sobre a morte de alguém. Três travas, qualquer
uma segura a resposta:

| Trava | Exemplo |
|---|---|
| **Assunto** na lista de sempre-manual | luto, reclamação, cancelamento |
| **Palavra crítica** no que a família escreveu | faleceu, advogado, processo, roubaram, cancelar, reembolso… (43 palavras) |
| **A própria IA** marcou sensível ou ficou em dúvida | — |

Ambas as listas são editáveis em `orgs.assuntos_sempre_manual` e
`orgs.palavras_criticas`. A comparação ignora maiúsculas e acentos.

**A família não percebe.** Para ela, foi a Sureya que respondeu — só demorou um
pouco. E a conversa mostra o motivo da retenção
(`interacoes_ia.motivo_retencao`), para você saber por que aquilo parou ali.

## 4. "Me ajuda a escrever"
Botão ✍️ na tela da conversa. Você escreve **o contexto** — o que sabe, o que
quer dizer — escolhe o tom (acolhedor, objetivo, firme) e recebe **três caminhos
diferentes**, não três versões da mesma frase. Cada um com um título dizendo o
que ele faz. Escolhe um, ele cai na caixa de envio, você ajusta e manda.

Os pedidos ficam salvos em `pedidos_ajuda` — dá para usar depois para entender
que tipo de resposta você costuma precisar de ajuda.
