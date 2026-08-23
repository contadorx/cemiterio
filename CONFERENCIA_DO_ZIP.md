# O zip está completo — e por que as duas coisas não apareceram

Conferência do arquivo `sureya-app-DEPLOY-nova-familia-do-jazigo.zip` contra a
cópia de trabalho, em 23/08.

---

## 1. O zip: **idêntico**, arquivo por arquivo

```
diff -rq (sem node_modules, .next, tsconfig.tsbuildinfo)
→ 0 diferenças
```

As 8 migrations desta leva estão lá (0084 a 0091), e todas estão **aplicadas em
produção**: 58 tabelas, 84 funções, 18 gatilhos, 119 policies — o placar do
repositório reconstruído bate com o banco.

Então nada se perdeu no caminho. O que aconteceu é outra coisa, e são duas
coisas diferentes.

---

## 2. O aviso de cadastro incompleto: **está lá, e não tinha o que avisar**

O aviso vive em `src/app/campo/page.tsx`, no cartão verde que aparece depois de
salvar um jazigo. Ele só diz a frase quando **falta GPS ou falta foto**:

> Ficou sem localização nem foto. Dá para completar depois na ficha do jazigo.

Medido no banco, nos três dias de cadastro:

| dia | cadastrados | com foto | com GPS |
|---|---|---|---|
| 23/08 | 66 | **66** | 65 |
| 22/08 | 136 | **136** | 136 |
| 16/08 | 68 | **68** | 66 |

**270 jazigos, todos com foto; três sem GPS.** O aviso não apareceu porque não
havia nada faltando — ele estava certo em ficar calado.

O que o cartão mostra sempre é o "✓ Jazigo cadastrado", a quadra e a
identificação, e o contador "N cadastrados nesta ida". Se nem isso apareceu, aí
o que está no ar é uma versão anterior — e a conferência disso não dá para fazer
daqui (o acesso externo a `zeloememoria.com.br` está bloqueado neste ambiente).

**A lacuna de verdade é outra, e o aviso não cobre:** hoje são **109 jazigos sem
família**. Esse é o "cadastro por terminar" que importa, e o campo não avisa —
nem deveria, porque a pessoa no cemitério não sabe de quem é o jazigo. O lugar
disso é o painel, e a lista existe (`sureya_jazigos_sem_familia`).

---

## 3. A roteirização: **estava certa, e não tinha o que ordenar**

Este é um defeito de verdade, e ele explica exatamente o que você viu.

Os 8 serviços pendentes no dia eram:

| jazigo | quantos | datas do plano | data marcada |
|---|---|---|---|
| Souza | 3 | 17/08, 01/09, 16/09 | **todas 18/08** |
| Nagae | 5 | 17/08, 24/08, 31/08, 07/09, 14/09 | **todas 18/08** |

Oito serviços, **dois jazigos**. A lavagem devida em setembro estava marcada
para agosto. O app de campo mostrava o mesmo jazigo cinco vezes seguidas — e a
ordenação por endereço estava funcionando, só não tinha o que ordenar.

**A causa**, em `src/lib/agenda.ts`, na segunda passada do alocador: ela
empacotava tudo a partir do primeiro dia com vaga. Com capacidade de 20 por dia e
poucos serviços, o horizonte de 30 dias inteiro caía no mesmo dia.

Era inofensivo enquanto todo serviço nascia devido para agora. Virou defeito no
momento em que a geração passou a criar as visitas futuras do plano — e ninguém
percebeu, porque o sintoma não parece um erro de data: parece que a roteirização
não funciona.

**O conserto:** a data do plano passa a ser o dia **mais cedo** possível. Atrasar
quando o dia está cheio continua valendo; adiantar por semanas, não — antecipar
uma lavagem em um mês não é otimizar, é lavar e cobrar fora do combinado.

Usa `data_plano` (a data teórica, congelada no nascimento do serviço) e não
`data_prevista`, porque o alocador reescreve essa última a cada passada: numa
segunda rodada ele leria a data que ele mesmo escreveu.

**Três conferências novas** em `testes/simular.ts`, e elas pegam o defeito: com o
código antigo, duas falham (as duas lavagens caem em 24/08 em vez de 27/09).

**A agenda em produção foi corrigida**: os 8 serviços voltaram para a data do
plano deles.

| jazigo | antes | agora |
|---|---|---|
| Souza | 3× em 18/08 | 17/08 · 01/09 · 16/09 |
| Nagae | 5× em 18/08 | 17/08 · 24/08 · 31/08 · 07/09 · 14/09 |

---

## 4. O que isso deixa à mostra

Com as datas certas, **a agenda fica quase vazia** — e ela está certa assim:
são **3 jazigos contratados** e **1 plano ativo**, para 270 jazigos cadastrados.
A roteirização não tem como brilhar com dois endereços.

Ela passa a valer quando as famílias forem contratadas. Aí valem também os dois
itens que continuam abertos do `GESTAO_ROTEIRO.md`:

- **163 dos 270 jazigos ainda não têm `ordem_na_rua`** — é o que faz a rota dar
  voltas dentro da mesma rua;
- ordenar uma rua inteira de uma vez, que é a tela que resolve os 163.
