# Onde fica o recebimento sem comprovante

## Onde registrar
**Clientes → abrir a família → 💰 Registrar pagamento de [Nome]**

Para quando a pessoa diz que pagou e não manda nada. Marque
*"Sem comprovante — a família informou, ainda vou conferir no banco"*.
O valor entra na conta dela e **a cobrança automática para na hora**.

## Onde conferir (era o que faltava)
**Financeiro → Bater com o banco** — aba nova.

Lista tudo que entrou sem comprovante, com:
- quanto ainda **falta conferir** e o **valor em jogo**
- **há quantos dias** cada um está esperando (vermelho depois de 30)
- **Achei no extrato** dá o visto · **Não achei** deixa uma anotação do que fazer

Abra o extrato do banco ao lado e vá batendo. O que já foi conferido some da
lista (ou aparece com ✓ se você desmarcar "só o que falta").

## Um bug sério encontrado no caminho
Ao testar o fluxo ponta a ponta, descobri que a função gravava
`origem = 'manual'` — valor que **não existe** no enum do banco. Ou seja,
**o botão "Registrar pagamento" nunca funcionou**: dava erro genérico na tela.

Eu havia reportado como pronto. O build passa porque é uma string comum, e o
erro só aparece quando alguém clica.

Corrigido para `conciliacao_manual` e testado o fluxo inteiro no banco:
registrar → aparecer na lista → zerar a cobrança → dar o visto → desfazer.

**Novo verificador:** `npm run checar` agora também confere se todo valor de
enum usado no código existe de verdade — olhando a tabela que está sendo
gravada, para não confundir o `tipo` de uma ocorrência com o `tipo` de um
movimento.
