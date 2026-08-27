# Build C — uma porta só para o que não tem volta

CA-07, CA-08 e CP-12.

## O que estava acontecendo

**193 diálogos do navegador** entre painel e campo. Contados: 57 `confirm`,
9 `prompt` e 109 `alert` no painel, mais 18 no campo.

Todos com a aparência que o navegador do dia resolve dar. Nenhum dizendo o que
acontece **depois** de confirmar. Nenhum com desfazer. Todos travando a tela.

E o pior: eles se pareciam. *"Excluir a limpeza?"* e *"Gerar o mês?"* chegavam
na mesma caixinha cinza, com os mesmos dois botões. Confirmar vira reflexo — e
reflexo é como se apaga a coisa errada.

## Duas peças, porque são duas coisas

Os 109 `alert` quase todos não eram pergunta nenhuma: eram *"Não consegui
salvar"*, *"3 movidas"*, *"Falhou: erro"*. Desfecho usando a ferramenta de
pergunta.

| | quando | trava? |
|---|---|---|
| `perguntar()` | **antes** de um ato que custa desfazer | sim, de propósito |
| `recado()` | **depois**, para dizer como foi | não |

Obrigar alguém a clicar "OK" para voltar ao trabalho depois de já ter agido é
cobrança sem motivo.

### Por que `perguntar` devolve uma promessa

`confirm()` é síncrono, e era isso que o tornava fácil:

```ts
if (!confirm("...")) return;
await excluir();
```

Uma peça de React normal obrigaria a partir cada função em duas, com estado no
meio — **66 lugares reescritos, 66 chances de errar**. Com promessa, a linha
muda de `confirm(` para `await perguntar(`, e o resto fica igual.

### O que a peça exige

`oQue` e `efeito` são **obrigatórios**. O efeito é a parte que o `confirm()`
nunca teve:

> **Apagar esta entrada?**
> Ela some do caixa e não dá para voltar. Use quando tiver lançado errado — não
> para corrigir valor.
> [Deixar como está] [Apagar]

O botão diz o verbo, não "OK". Tocar fora **desiste** — toque acidental cai
para o lado seguro. Motivo obrigatório **trava** o botão: confirmar sem
escrever nada não é decisão informada, é o Enter da pressa.

`prompt` virou campo dentro da mesma folha: motivo, data ou valor. Onde havia
dois `prompt` em fila — o adiamento da mensagem pedia a data e depois o
combinado — agora é um pedido só. Desistir no segundo deixava o primeiro no ar
sem que ela soubesse se tinha adiado.

O recado de **erro não some sozinho**: um "não consegui salvar" que desaparece
em três segundos é o mesmo que não avisar, porque ela estava olhando o
formulário. O bom e o aviso somem.

## O placar

| | antes | agora |
|---|---|---|
| `confirm` + `prompt` no painel | 66 | **0** |
| `confirm` + `prompt` + `alert` no campo | 18 | **0** |
| `alert` no painel | 109 | 99 |

Os **99 `alert` que sobraram** são todos desfecho — "não consegui salvar",
"3 movidas". Eu **não** os converti em massa de propósito: distinguir sucesso
de falha mecanicamente, sem ler cada um, arrisca marcar um erro como recibo
verde. Isso é pior que uma caixa cinza feia. Vão numa passada lida, arquivo por
arquivo.

## CP-12 — encerrar o dia era três diálogos em fila

`confirm` → `prompt` → `alert`. Três telas travadas, uma atrás da outra, e
nenhuma delas dizendo **o que ia ser encerrado**.

Agora é uma folha com o resumo:

> **Encerrar o dia?**
> 12 lavagens feitas hoje. 3 ficam para os próximos dias, na frente da fila.
> ⚠ 2 ainda não subiram — está tudo guardado e vai sozinho quando o sinal voltar.

**O "ainda não subiu" é a parte que faltava.** Encerrar o dia com duas lavagens
paradas no aparelho é diferente de encerrar com tudo entregue, e ela não tinha
como saber a diferença na hora de decidir. O número vem da mesma fila do
Build B.

## CA-08 — Liberação

Faltava a confirmação no descarte, e ela é a que mais importa desta tela:
descartar por engano a foto da limpeza do túmulo do pai de alguém é erro que
não dá para consertar — a mensagem some e a família nunca recebe, sem ninguém
perceber.

Data e hora da lavagem (*"limpo em 14/08 às 09:30"*) e os rótulos antes/depois
já existiam. Com o descarte confirmado e o desfazer que já havia, **CA-08 está
fechado**.

## Provas

19 guardas novas. A principal **varre os 78 arquivos** de `painel/` e `campo/`
e reprova se aparecer um `confirm` ou `prompt` do navegador em qualquer um —
uma única volta num arquivo novo desfaria o trabalho todo sem quebrar nenhum
outro teste.

As outras cobrem: que todo pedido exige dizer o efeito; que tocar fora desiste
e nunca confirma; que motivo obrigatório trava o botão; que o erro não some
sozinho; que fora do provedor cai no diálogo do navegador e não no silêncio
(sumir faria o botão parecer quebrado, e devolver `true` executaria o ato sem
ninguém confirmar).

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.
