# A agenda virou cockpit — e o "Reorganizar" passou a funcionar

Auditei a página inteira contra a produção antes de mexer em qualquer coisa. Os
defeitos não eram de gosto; três deles eram aritmética.

---

## 1. Por que "Reorganizar a agenda" não funcionava

**Não era intermitente.** A tela contava com uma regra e o banco movia com outra:

| | o que considerava "fora do lugar" |
|---|---|
| o contador (a tela) | dia não trabalhado **ou** data já passada |
| `sureya_reorganizar_agenda` | só dia não trabalhado |

As duas lavagens paradas em **17/08/2026** estavam numa **segunda-feira** — dia
de trabalho. O contador as via (estavam no passado); a função não via nenhuma.
O aviso "2 lavagens fora do lugar" não tinha como zerar, e o botão não tinha o
que mover.

E havia um terceiro furo, embaixo dos dois: mesmo que a função movesse algo,
`alocarAgenda()` **só enxerga `status = 'pendente'`**, e tudo em produção estava
`agendado`. Mover zero linhas para `pendente` deixava o alocador sem nada para
redistribuir.

**Agora a regra existe uma vez, no banco** (`sureya_agenda_fora_do_lugar`,
migration 0092), e as duas pontas leem dela.

---

## 2. O jazigo Perrela aparecia quatro vezes no mesmo dia

Medido em produção:

| jazigo | marcada para | o plano pedia |
|---|---|---|
| Perrela | 24/08 | 01/08 |
| Perrela | 24/08 | 09/08 |
| Perrela | 24/08 | 17/08 |
| Perrela | 24/08 | 25/08 |

Três estavam atrasadas. O alocador respondeu "devida hoje" para as três — o que
está **certo**, atraso não se recupera andando para trás. O que faltava era a
regra de que **o mesmo túmulo não se lava duas vezes na mesma manhã**: a segunda
passada não entrega nada e a família é cobrada pelas duas.

No chão: a mesma lápide aparecia quatro vezes seguidas na lista.

**Também consertado:** o alocador contava a capacidade do dia como se ele
estivesse vazio. O que já estava `agendado`, e o que você fixou à mão (📌), não
ocupavam lugar nenhum na conta — um dia com 20 vagas e 12 lavagens marcadas
recebia mais 20.

---

## 3. O que a tela mostra agora

**Cada linha:**

```
3º  Família Perrela            [Ana]  [📌 data sua]  [23 dia(s) de atraso]
    Perrela · Quadra 1 · Principal
    João Perrela · sem contato · R$ 40,00 · agendado
```

- **família primeiro**, porque desde a D-10 é ela a entidade: o contato pode não
  existir, ou ser outro no ano que vem;
- **quadra e rua**, que é de onde sai a ordem do dia — sem a rua, 1º, 2º e 3º
  parecem arbitrários;
- **o atraso em dias**, que é o único número que denuncia a lavagem empurrada
  antes de a família reclamar;
- e acabou o **"QQuadra 1"**: o código já vinha `"Quadra 1"` e a tela escrevia
  um `Q` na frente.

**No topo:** o que está fora do lugar, **discriminado** — atrasadas, repetidas,
em dia que não se trabalha —, porque são três conversas diferentes.

**Resumo do período:** quantas, em quantos dias, quanto vale, e **quantas ainda
estão sem pessoa definida**.

**Cabeçalho de cada dia:** `13 de 20` em vez de `13`. Treze é tranquilo ou é o
limite? Sem o denominador não dá para saber.

**Filtros:** busca por família/jazigo/rua e os recortes *atrasadas*, *sem
pessoa*, *com pessoa*.

---

## 4. Gerar períodos curtos, para testar

Existiam só **30, 60 e 90 dias**. Para conferir se a régua de um jazigo estava
certa era preciso despejar um trimestre na agenda e limpar na mão depois.

Agora há **3, 7 e 14 dias** numa linha separada ("para conferir"), e ao gerar um
período curto **a janela da tela acompanha** — senão o resultado aparece diluído
em trinta dias e parece que nada aconteceu.

---

## 5. Quem limpa, em tela

Marque as linhas (ou **"marcar o dia"** inteiro), escolha no topo e aplique.
"Deixar em aberto" é a primeira opção porque é o estado normal: a limpeza
aparece para toda a equipe e **quem começa assume**. Serviço já executado não
entra na seleção — ali `executora_id` é o registro de quem lavou, e trocar
pagaria uma pessoa pelo trabalho de outra.

---

## 6. Controles mais leves

Eram quatro botões e uma caixa em toda linha, com **Excluir em vermelho sempre à
vista**. Ficou `Remarcar` à mostra e o resto atrás de **"mais"**.

**E o estorno foi ligado.** A rota `/api/servico/[id]/estornar` existia e
**nenhuma tela a chamava** — a função estava escrita na página, completa, e nunca
foi ligada a um botão. Uma lavagem registrada por engano só se desfazia no banco.

---

## 7. O que subir

**No Supabase (já aplicado):**
`migrations/0092_a_agenda_fora_do_lugar_tem_uma_definicao.sql`

**No código:**

| arquivo | o quê |
|---|---|
| `src/lib/agenda.ts` | uma lavagem por jazigo por dia; ocupação já agendada entra na conta |
| `src/app/api/agenda/semana/route.ts` | família, rua, quadra limpa, `atrasoDias`, capacidade |
| `src/app/api/agenda/reorganizar/route.ts` | pergunta ao banco em vez de decidir sozinha |
| `src/app/painel/agenda/page.tsx` | a tela inteira |
| `src/app/painel/contatos/page.tsx` | **sem os marcadores de conflito** que quebraram o build |
| `testes/agenda.sql` | 16 provas novas |
| `testes/simular.ts` | 5 provas novas |

---

## 8. O portão

```
RESULTADO: 183 passaram, 0 falharam
PLACAR — repositorio reconstruido x producao
  tabelas      58  = producao (58)
  funcoes      85  = producao (85)
  gatilhos     18  = producao (18)
  policies    119  = producao (119)
✓ Compiled successfully
```

As provas novas **mordem**: desligando a regra de uma-por-jazigo-por-dia, o teste
falha com exatamente o retrato da produção —
`["2026-08-24","2026-08-24","2026-08-24","2026-08-24"]`.
