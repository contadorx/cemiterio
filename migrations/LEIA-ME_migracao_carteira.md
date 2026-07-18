# Migração da carteira — o que falta para operar

O sistema já tem as 59 famílias, 62 jazigos, valores, periodicidades e réguas.
Falta o que a planilha antiga não guardava.

## Preencher na planilha `Zelo_Memoria_Migracao_Carteira.xlsx`
| Campo | Por que é necessário |
|---|---|
| **Próxima lavagem** | sem ela o alocador não sabe quando a Nina deve ir |
| **Próxima cobrança** | sem ela o sistema não sabe quando cobrar |
| **Antecipado ou postecipado** | define se cobra antes ou depois do serviço |
| **Saldo em aberto (R$)** | abre a conta-corrente de cada família |
| **Pago até (confirmar)** | diz quem está em dia; deduzi 19 de 62 das observações |

Sugestão já calculada: **52 jazigos estão atrasados** e receberam data de lavagem
distribuída em ~8 por dia útil, agrupados por rua (a rota que a Nina faz).

## Como o saldo de abertura entra
Pela RPC `sureya_saldo_abertura(cliente, valor, data, nota)`:
positivo = crédito (pagou adiantado) · negativo = em aberto.
Entra como um movimento no razão, com descrição "Saldo de abertura (migração)",
para o histórico ficar auditável — e não como uma coluna solta.

## Fora da planilha (na aba "O QUE MAIS FALTA")
1. **Chave Pix** — Config > A Casa. É o mais urgente: sem ela a IA não manda o Pix
   (e foi instruída a não inventar).
2. Telefone de 5 famílias sem número.
3. Acesso da Nina (Config > Equipe).
4. Conectar o WhatsApp e apontar o webhook.
5. Conferir a voz da IA no simulador antes de ligar de verdade.
6. Apagar os dados marcados com [TESTE].
