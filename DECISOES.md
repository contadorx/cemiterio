# Decisões da responsável

Decisões de negócio que valem acima de auditoria, roadmap e da minha leitura do
código. Quando uma delas colidir com uma recomendação, **a decisão ganha** — e
eu paro e pergunto em vez de aplicar a recomendação.

Cada entrada registra: a decisão, quem decidiu, quando, e **onde ela vai bater**.

---

## D-01 · A dívida é da família, com um responsável financeiro

> *"É a família, mas sempre tem um responsável financeiro."*

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** implementada

`conta_corrente` é a fonte da verdade, no grão da família. `movimentos` vira
legado. O responsável não é quem *deve* — é para **quem se fala**: uma dívida,
uma cobrança.

Implementação e consequências em `BUILD_4.md` §8.

---

## D-02 · O botão de cadastrar jazigo NÃO sai do campo

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** anotada, nada a fazer agora

O botão **continua no campo**. Não remover.

Se um build precisar mexer nele — mover, recolher, esconder atrás de outra
tela — **eu pergunto antes**, e não aplico por conta própria.

### Onde isso vai aparecer

A auditoria de UX do campo pede, em dois lugares, que ferramentas ocasionais
saiam do caminho da rota:

| Onde | O que a auditoria pede |
|---|---|
| `AUDITORIA_UX_CAMPO.md` · CP-01 (linha ~113) | reprova a tela porque cadastro de jazigo é uma das cinco áreas antes do primeiro cartão |
| `AUDITORIA_UX_CAMPO.md` · §7, item 4 (linha ~250) | *"Uma área recolhida `Mais opções` contém apoio, materiais, **cadastrar jazigo** e puxar mais"* |

Ou seja: a auditoria **não pede para remover** — pede para **recolher** dentro
de `Mais opções`. São coisas diferentes, e é por isso que a pergunta importa.
Quando o build de UX do campo chegar, a pergunta a fazer é:

> Recolher para dentro de `Mais opções` já é tirar do campo, ou o botão tem de
> continuar visível na primeira tela?

Até você responder, **fica como está**.
---

## D-03 · As fotos ficam com link público

> *"Vamos deixar público para não complicar. A maioria dos usuários são pessoas
> idosas, e pedir mais segurança desequilibra o acesso."*

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** vale; entrega 3 do Build 6 sai do escopo

A foto da limpeza vai para a família por link direto no WhatsApp. A família
toca e abre — sem login, sem senha, sem app. **É assim que continua.**

O roadmap pedia buckets privados com URL assinada (Build 6, entrega 3). Essa
entrega está **encerrada por decisão**, não esquecida.

### O que exatamente está sendo aceito (medido em 22/08)

Não é "qualquer um vê as fotos de todo mundo". Conferi:

| | |
|---|---|
| RLS em `storage.objects` | **ligada**, com zero policies |
| Listar o conteúdo do balde | **não dá** — a listagem passa por RLS e volta vazia |
| Caminho do arquivo | `{org}/{servicoId}/depois-{timestamp}.jpg` — o `servicoId` é UUID |
| Arquivos hoje | 409 em `servicos`, 1 em `comprovantes` |

Ou seja: **não dá para descobrir os links, só para usar um link que você já
tem.** O que está sendo aceito é que quem receber o link — encaminhado num
grupo de família, por exemplo — abre a foto, e para sempre.

Para foto de túmulo limpo, é um risco proporcional. É essa a decisão.

### O ponto que continua aberto, e por quê

O balde `comprovantes` guarda **comprovante de Pix** — documento de banco, com
nome, valor e às vezes pedaço de CPF. É outra classe de coisa.

E ele não tem o problema de acesso que motivou a decisão: a família **envia** o
comprovante pelo WhatsApp e nunca precisa abrir de volta. Quem lê é só o painel.
Tornar **esse** balde privado não faz idoso nenhum digitar senha — não muda nada
para ninguém, exceto para quem achar o link.

Hoje é 1 arquivo. Se um dia você quiser, é uma migration pequena. Enquanto não
disser, fica público como o resto.

### O que isso obriga

A política de retenção e consentimento (Build 6, entrega 4) precisa **dizer isso
por escrito**: as fotos ficam acessíveis por link permanente a quem o tiver.
Sem esse parágrafo, a política afirma uma proteção que o sistema não faz.
