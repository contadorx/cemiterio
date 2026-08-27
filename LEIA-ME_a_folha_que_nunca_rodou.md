# Build G — CA-11, e uma coisa que eu não esperava achar

Fui unificar os dois vocabulários visuais, como a auditoria pediu. Achei duas
coisas, e a segunda não é sobre aparência.

## 1. O sistema novo tinha perdido uma regra do antigo

`ui.tsx` — o sistema **antigo** — escreve a regra e a cumpre:

```
// ── Botões tamanho padrão (altura de toque confortável no celular, >= 48px) ──
botao: { … minHeight: 48 }
```

`pecas.tsx` — o sistema **novo**, usado na Liberação e no cadastro em quatro
passos — não tinha `min-height` nenhum. `py-2.5` com texto de 15px dá cerca de
**44px**, e nada segurava esse número: mudar o tamanho da fonte encolheria o
botão junto.

O vocabulário novo perdeu, sem ninguém notar, uma regra que o antigo tinha
escrita **com o motivo ao lado**.

As medidas passaram a viver em `src/app/painel/medidas.ts`, e os dois sistemas
importam de lá. Enquanto forem dois números em dois arquivos, a diferença volta
na próxima peça que alguém escrever — a guarda nova reprova quem cravar altura
na mão.

## 2. A folha do celular nunca esteve no ar

Este é o achado de verdade, e não é estilo.

`EstiloMobile.tsx` é a folha que conserta o painel no celular: campo em largura
cheia, fonte 16px para o iOS não dar zoom, botão de 52px, rótulo em linha
própria. A auditoria a menciona como coisa existente — *"uma folha global e
`!important` para corrigir mobile"*.

**Ela nunca rodou.**

`ui.tsx` a **importava**. Nenhum arquivo do repositório escrevia
`<EstiloMobile />`. Import sem uso não quebra build, não acende lint e não
aparece em teste nenhum — o arquivo existia, a intenção estava escrita no
comentário dele, e o painel passou desde **23/08** sem uma linha daquilo no DOM.

É a mesma família de falha que já mordeu o WhatsApp (dezenove dias calado) e o
motor de memória (entregando zero): a coisa está pronta, ninguém desligou, e
mesmo assim ela nunca rodou.

### E ela foi para o layout, não de volta para o menu

Mesmo se estivesse montada onde nasceu — dentro de `PainelNav` — teria alcançado
**15 telas de 32**. As outras 17 não montam `PainelNav`, e entre elas estão as
duas que mais importam:

- a **tela inicial**;
- a **ficha da família**, que é a maior do sistema.

Agora vive no `layout.tsx`, por onde o painel inteiro passa.

### O que isso muda, e o que você precisa olhar

Tudo o que a folha faz está dentro de `@media (max-width: 640px)`. **No desktop,
nada muda** — o risco é limitado ao celular.

Mas é honesto dizer: essa folha **nunca foi vista rodando**. Ela foi escrita
para telas que naquele momento eram outras, e desde então o painel ganhou o
funil, o "Precisa de você", o cadastro em quatro passos e as peças novas. Pode
ficar ótima, pode apertar alguma coisa.

**Abra o painel no seu celular e olhe.** Principalmente a ficha da família e a
tela inicial. Se algo ficou estranho, é um ajuste pequeno — e agora dá para
ajustar num arquivo só, com efeito em todas as telas, que é exatamente o que
essa folha existe para fazer.

Isto também é metade da CA-12, que a auditoria disse não dar para provar lendo
código. A outra metade continua sendo sentar com a Sureya num aparelho.

## Provas

6 guardas novas. As três que importam:

- **a folha do celular está REALMENTE montada** — procura `<EstiloMobile />` no
  layout, não o import;
- **e no layout, não no menu** — reprova se voltar para `ui.tsx`;
- **nenhum dos dois sistemas crava a altura na mão**.

A primeira existe porque o defeito não era o código estar errado: era ele não
estar sendo chamado. Nenhum teste que eu tinha olhava para isso.

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.

## O placar

| | quantas |
|---|---|
| Aplicado | **25** |
| Parcial | 1 (CA-12 — metade é código, metade é aparelho) |

CP-03 sai da lista: a câmera do celular pede confirmação e isso não está na
nossa mão. É métrica, não conserto.

**O que sobra, de verdade:**

- **olhar o painel no celular** — agora que a folha está no ar;
- **a régua de prioridade** — sua decisão: hoje só levanta prioridade o que a
  Nina adiou duas vezes;
- e, fora do roteiro de UX, o que está em `PENDENCIAS.md` — as **409 fotos sem
  segunda cópia** são o item mais velho e o mais caro se der errado.
