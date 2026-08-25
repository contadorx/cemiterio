# A aba Conversas ganhou número, e o contato do site ganhou destino

Dois ajustes, e os dois são o **mesmo defeito**: coisa que espera por alguém e
não aparece em lugar nenhum. Foi assim que 164 mensagens ficaram paradas
dezenove dias.

---

## 1. A aba que não dizia nada

**Liberação** e **Contatos do site** mostravam quantos havia. **Conversas**
ficava muda — de fora não dava para saber se alguém esperava resposta.

Agora mostra. E o número **não é quantas conversas existem**:

```
161  conversas no total
  3  pedem alguma coisa de você
```

Um crachá com 161 não seria informação, seria ruído — e ruído se aprende a
ignorar, que é exatamente como o silêncio começa. O número é o mesmo
`sureya_contadores_conversas` que já desenha as sub-abas lá dentro; uma segunda
contagem começaria igual e terminaria discordando.

### E a visibilidade do que acessar

O crachá diz *quantos*; abrir a aba e procurar qual das 161 era continuaria
sendo trabalho. Então, ao abrir Conversas, uma linha divide o número:

> **3 conversas esperam por você** — 2 sem resposta · 2 escaladas

Cada pedaço é um link que **já entra com o recorte feito** (`?ver=aguardando`),
lido do outro lado — senão seriam decoração.

---

## 2. O contato do site não tinha para onde ir

O botão dizia **"Virou cliente"** e não criava cliente nenhum: escrevia
`status = 'convertido'` no lead e parava aí. Medido em 24/08:

```
112  contatos do site
108  com `cliente_id` nulo
```

A ponte nunca existiu. Por isso a pergunta que decide se vale gastar em mídia —
*"de cada dez contatos do site, quantos viraram cliente?"* — não tinha como ser
respondida.

### Como ficou

**Virar contato de uma família** abre um painel dentro do próprio cartão, com
nome e telefone já preenchidos do que a pessoa escreveu no site. Dali:

- **procurar uma família que já existe** — digite parte do nome e escolha; ou
- **criar uma nova**, com o nome sugerido a partir do sobrenome (é um campo
  editável, não uma decisão tomada por você).

Três escritas acontecem juntas: a **família**, o **contato** dentro dela, e a
**conversa** — nessa ordem, porque conversa nascida antes do contato ficaria
órfã na aba e ninguém saberia de quem é. E o lead recebe `cliente_id`: é a
ponte que faltava.

No fim, o caminho: **abrir a ficha** · **ir para a conversa**. Um "pronto" sem
para onde ir obriga a procurar a família no menu, e é aí que o assunto se
perde.

### Duas decisões que valem explicar

**A conversa nasce pela mesma porta do WhatsApp** (`garantirConversa`), não por
um insert próprio. Duas portas para abrir conversa começariam iguais e
terminariam discordando sobre o que é "conversa aberta".

**Telefone repetido é o caso comum, não a exceção** — quem escreve pelo site
pode já estar na casa. Em vez de um erro de banco, a resposta diz **onde**:
*"Esse telefone já é de Fulano, na família Tal. Abra a ficha de lá em vez de
criar outro."*

**O botão antigo continua**, com o nome que corresponde ao que ele faz: *"Já é
cliente — só tirar da fila"*. Serve para quem já está cadastrado. O que saiu
foi a promessa que ele não cumpria.

---

Sem migração: é tudo código. Onze guardas novas em `checar-ficha.mjs`.
`npm run ci` verde — 217 testes, 119 migrations, placar igual à produção.

**Uma guarda quase me enganou de novo:** a que proíbe o rótulo antigo achou a
própria citação dele no comentário que explica a troca. É o mesmo tropeço da
guarda do `semPlano`, de ontem. Agora ela está ancorada no JSX (`/> Virou
cliente`), não no texto solto.
