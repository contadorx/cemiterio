# Para quem vai esta leva

Em **Conversas → Liberação**, acima da lista, uma linha nova: **Para quem**.

| filtro | opções |
|---|---|
| contrato | contrato e avulso · só com contrato · só avulso |
| cemitério | todos · cada um que aparece na fila |
| quadra | todas · cada uma que aparece na fila |
| rua | todas · cada uma que aparece na fila |

Os filtros **combinam entre si e com o grupo** de cima. "As fotos da quadra Q1",
"os avulsos do cemitério do Cantão", "a cobrança de quem tem contrato na rua
das Palmeiras" — tudo é a mesma pergunta feita sobre listas diferentes, e por
isso o recorte vale para **todos os tipos**, não só cobrança.

## O lote obedece ao recorte

É o ponto do pedido: *filtros de disparo*. **Marcar todas** marca só o que está
no recorte, e **Enviar** manda só essas. Recortar e disparar é uma operação só.

## Quatro decisões que valem explicar

**A localização é da família, não da mensagem.** A cobrança de rotina não
carrega túmulo — ela é da casa, não de uma pedra. Filtrar por
`fila_liberacao.tumulo_id` deixaria metade da fila de fora **sem dizer**. Então
a pergunta virou *"esta família tem jazigo nesta quadra?"*, que é a pergunta que
você faz de verdade. Família com jazigo em duas quadras aparece nas duas — é o
que ela é.

**"Com contrato" usa o mesmo corte do cobrador:** `contratado` **e**
`valor_mensal > 0`. Um jazigo marcado como contratado por R$ 0,00 não gera
competência nenhuma; chamá-lo de "com contrato" aqui faria o filtro discordar da
conta que manda no dinheiro.

**As opções saem do que está na fila**, não do cadastro inteiro. Oferecer as 40
quadras do cemitério quando a fila só toca 3 é obrigar a procurar — e escolher
uma das 37 devolveria lista vazia sem explicar por quê. Escolher um cemitério
estreita as quadras oferecidas; trocar de cemitério zera quadra e rua.

**Um seletor só aparece quando há escolha a fazer.** Fila inteira na mesma
quadra não ganha um seletor de quadra com uma opção só.

## O recorte não pode esconder em silêncio

Duas proteções, porque um filtro esquecido é indistinguível de uma fila vazia:

- ao lado dos seletores, **"12 de 47 · 35 fora do recorte"**
- se o recorte zerar a lista, uma caixa dizendo exatamente o que foi filtrado —
  *"Há 47 mensagens esperando, mas nenhuma delas é de família sem contrato, da
  quadra Q3"* — com um **limpar o recorte** do lado

## Provas

Cinco guardas novas em `testes/checar-ficha.mjs`:

- o filtro de contrato usa o mesmo corte do cobrador
- a quadra vem dos jazigos da família, não do túmulo da mensagem
- o recorte é aplicado **antes** do grupo, valendo para todo tipo
- o lote sai do que está recortado
- lista vazia por causa do filtro diz que foi o filtro

`npm run ci` verde, 217 testes.
