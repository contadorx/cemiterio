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
