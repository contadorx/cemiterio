# Leads que somem de vez · serviços extras

## 1. O descartar não funcionava — dois bugs
**Bug A:** a tela chamava `PATCH /api/leads/[id]`, mas o endpoint só tinha `POST`.
A requisição batia num método que não existia e nada acontecia.

**Bug B:** mesmo funcionando, a lista mostrava **todos os status**, inclusive os
descartados. Descartar não tirava da tela.

Corrigidos. Agora a lista abre mostrando só quem ainda pode virar cliente.

## 2. "Não é lead" — o bloqueio definitivo
Descartar tira da lista, mas a pessoa volta assim que escrever de novo. No
WhatsApp pessoal da Sureya isso acontece toda hora: amiga, parente, entregador,
engano.

O botão **🚫 Não é lead** resolve: o número entra numa lista de bloqueio e
**nem chega a virar lead outra vez**. Dá para anotar o motivo, e há
"Voltar a mostrar" se você mudar de ideia. A caixa `mostrar ignorados` revela
os bloqueados quando precisar conferir.

## 3. Serviços extras — 14 opções prontas
Coisas que a família pede e que eram combinadas por fora, sem entrar no
financeiro. Agora viram pedido registrado.

| Categoria | Serviços | Faixa |
|---|---|---|
| 🌷 Flores | frescas, especiais, preparo para Finados / Dia das Mães / Dia dos Pais | R$ 35–90 |
| 🧽 Limpeza | limpeza pesada, lavagem com hidrojato | R$ 120–180 |
| 🔧 Reparos | pintura de letras, impermeabilização, troca de vaso, placa nova | R$ 60–220 |
| 🕯 Memória | vela de sete dias, foto extra, visita com a família | R$ 15–60 |

Cada um tem **preço e custo**, então dá para ver a margem real. Os preços são um
ponto de partida — ajuste para o que faz sentido em Mauá.

**Como funciona:** na ficha da família, "+ Oferecer algo" → escolhe → vira pedido
em aberto. Quando entregar, **"Entreguei"** lança o valor na conta dela
automaticamente.

**Os sazonais se anunciam sozinhos:** em outubro e novembro, a ficha mostra
*"É época de: Preparo para Finados"*. Em maio, o Dia das Mães. É o lembrete de
mencionar na próxima conversa — que é onde a venda acontece.

## Uma observação sobre preços
Coloquei valores de partida olhando a proporção com a limpeza (R$ 20–100/mês na
sua base). Um buquê a R$ 35 com custo de R$ 18 dá margem de quase 50%, o que é
razoável para algo que a Nina já leva na ida. Mas quem sabe o preço certo é
você — todos são editáveis.
