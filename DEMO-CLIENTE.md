# Demo no cliente — time de teste

Escrito em 15/08/2026, para segunda-feira. Plateia: **quem executa teste**, não quem compra e não
a segurança da informação. Isso muda tudo o que está aqui.

---

## A regra da sala

Quem executa UAT não quer ouvir sobre arquitetura. Quer ver a própria segunda-feira ficar menos
pior. Então:

- **Não fale de privacidade primeiro.** É o seu melhor argumento, mas é argumento de InfoSec e de
  gestor. Para quem testa, ele soa como "detalhe técnico". Ele entra no fim, em uma frase, e vira
  a munição que ELES levam para a chefia.
- **Não mostre a tela de preços.** Você está lá para descobrir se a dor é real. Preço nesta
  conversa transforma um aliado em avaliador.
- **Grave o sistema DELES, ao vivo.** Uma demo com o vídeo de exemplo é uma apresentação. Uma demo
  gravando o SAP deles é a coisa acontecendo.

---

## Antes de entrar (10 minutos, no seu computador)

1. Abra `walkstamp.com/app` e **grave 30 segundos de qualquer coisa**. Isso baixa o modelo de voz
   (~77 MB) e deixa a combinação que funciona guardada no navegador. Fazer isso na frente deles
   custa três minutos de silêncio.
2. Rode o **Diagnóstico** e confirme: `combinação lembrada -> OK` e, no ambiente,
   `· fora do fio principal`.
3. Deixe uma aba aberta com **`walkstamp.com/seguranca`** — você não vai abrir, mas vai citar.
4. Peça, ao chegar: *"alguém consegue compartilhar a tela de um caso de teste de verdade?"*
   Se não puderem, use o ambiente de QA. Se nem isso, o exemplo serve — mas perde metade.

---

## O roteiro (12 a 15 minutos)

### 1. A pergunta que abre (1 min)

Não comece apresentando. Comece perguntando:

> *"Como vocês entregam a evidência de um caso de teste hoje?"*

Deixe responderem. Vai aparecer alguma variação de: print, cola no Word, escreve embaixo, repete
trinta vezes. **Anote as palavras que eles usarem** — você vai devolvê-las no fim.

Segunda pergunta, e é a que dói:

> *"E quando o auditor pede a evidência de um caso que foi executado há três meses?"*

### 2. A gravação (3 min)

> *"Vou gravar o que vocês fizerem. Não precisa fazer nada diferente — executa o caso e narra em
> voz alta, como se estivesse explicando para um colega."*

Clique em **Gravar a tela**, deixe a pessoa executar o caso narrando. Enquanto roda, diga uma vez
só, sem insistir:

> *"Repara que eu não estou apertando nada. Ele guarda a tela quando ela muda, e escuta o que você
> está dizendo."*

Se der o momento, use o **marcar tela** na janelinha flutuante e diga: *"esse aqui é o passo que
importa"*. É o gesto que eles vão querer copiar.

Pare em uns 90 segundos. Menos que isso não convence, mais que isso cansa.

### 3. O documento (3 min)

Escolha o modelo de saída **Evidência de teste**, preencha caso, sistema e executado por com os
dados reais que eles falaram, e gere o PDF.

Abra o PDF na frente deles e mostre **três coisas, nesta ordem**:

1. **A hora de relógio em cada passo.** *"Isso é o que o auditor pergunta primeiro."*
2. **A fala pareada com a imagem.** *"O que você explicou está embaixo da tela em que você
   explicou. Ninguém digitou isso."*
3. **A impressão digital de cada imagem** (marque a caixa antes de gerar). *"Se alguém abrir o JPEG
   e apagar uma linha, o número muda — e tem uma página nossa que confere isso em trinta
   segundos."*

Depois, **volte e mostre o tarjamento**: cubra um CPF ou um valor na miniatura e gere de novo.

> *"E isso não é uma tarja por cima. A imagem que sai do PDF já sai com o preto dentro dela — não
> existe camada para alguém remover depois."*

### 4. O que eles não esperam (2 min)

Duas coisas que costumam mudar a cara da sala:

- **O Word.** *"Sai em .docx também, se o padrão de vocês é Word."*
- **O prompt para IA.** Copie o prompt e diga: *"se vocês usam alguma IA internamente, esse texto
  explica para ela como o documento está organizado — aí dá para perguntar 'em que passo o pedido
  foi criado' e ela responde com o instante."*

### 5. A frase da privacidade — uma só (30 s)

Agora, e não antes:

> *"Uma coisa que vale vocês saberem para quando a segurança perguntar: nada disso sai da máquina.
> Não tem upload, não tem servidor, não tem conta. Dá para conferir com o F12 na aba Rede — a
> coluna de enviado fica em zero. Tem uma página que explica isso e a versão offline num arquivo
> só, para a TI escanear."*

Pare aí. Não desenvolva. Se alguém puxar, ótimo — aí a conversa é deles.

---

## O fechamento (a parte que decide se houve demo ou visita)

Nunca termine com "o que acharam?". Termine com um pedido concreto e pequeno:

> **"Vocês topam usar num caso de teste de verdade esta semana e me dizer o que quebrou?"**

E, dependendo do que aparecer, um destes três:

| se apareceu | peça isto |
|---|---|
| entusiasmo do time | *"quem mais no time de teste deveria ver isso?"* — e marque a segunda |
| "a segurança nunca vai deixar" | *"quem é a pessoa da segurança? eu mando a página e a versão offline direto para ela"* |
| "quanto custa?" | *"a ferramenta é grátis e vai continuar. O que é pago é o pacote de time — logo de vocês no documento, padrão igual para todo mundo. Se isso interessar, eu te mando"* |

**Não deixe a sala sem um nome e um próximo passo com data.** Uma demo boa sem próximo passo é
uma demo perdida.

---

## O que NÃO fazer

- **Não prometa nada que não existe.** As seis features do plano Time estão listadas no site como
  o que vem, não como o que tem. Se prometer entrega, a primeira reunião vira a última.
- **Não diga "conformidade".** 21 CFR, SOX e CSV não são features. O produto **produz a
  evidência**; a conformidade é do processo deles. Dizer o contrário derruba a sua credibilidade
  com a única pessoa da sala que entende do assunto.
- **Não fuja de um defeito.** Se travar, diga: *"esse é o tipo de coisa que eu quero saber — me
  conta em que máquina foi"*. Ferramenta gratuita em construção com dono presente vale mais que
  ferramenta polida sem ninguém atrás.
- **Não abra o preço se ninguém perguntar.**

---

## Se der errado

| aconteceu | o que dizer, e o que fazer |
|---|---|
| o modelo não carrega | *"transcrição é opcional"* — desmarque, grave só os frames, e rode o Diagnóstico depois |
| a tela não gerou frames | aumente a sensibilidade no passo 2 e use o **marcar tela** à mão |
| o navegador reclama que a página não responde | *"é a transcrição usando o processador"* — clique em **Aguarde**; e me mande o Diagnóstico |
| bloqueio de proxy corporativo | use a **versão offline** — arquivo único, sem rede, funciona igual menos a transcrição automática |

Leve a **versão offline num pendrive**. Se a rede do cliente barrar o CDN, ela salva a demo.

---

## Depois da reunião

No mesmo dia, e-mail curto para quem estava na sala, com três coisas:

1. o **PDF que vocês geraram juntos**, na reunião — é a prova, não o argumento;
2. o link de `walkstamp.com/seguranca`, com a frase *"para quando a segurança perguntar"*;
3. o próximo passo com data, do jeito que ficou combinado.

E me conte o que aconteceu. As três maiores reclamações da sala valem mais que três semanas de
planejamento — é literalmente o portão de saída da Onda 1 no `ESTRATEGIA-ENTREGA.md`.
