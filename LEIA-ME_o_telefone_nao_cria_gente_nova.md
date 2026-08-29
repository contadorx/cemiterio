# O telefone não cria gente nova — e apagar as famílias vazias não era o primeiro passo

**Migrations 0145 e 0146, aplicadas. Nenhum dado tocado.**

---

## Antes de tudo: a ordem que você propôs está invertida, e eu preciso mostrar por quê

Você disse: *"já vinculei todas as famílias com jazigos, então podemos apagar famílias sem jazigos vinculados"* — e depois ver se sobra fusão.

Eu fui medir o que o apagar levaria junto. **Não funciona, e piora.**

### `clientes.familia_id` é `ON DELETE SET NULL`, não CASCADE

Apagar a família **não apaga a cópia da pessoa**. Ela sobrevive **órfã** — com o telefone **com o 55**, que é exatamente o que o WhatsApp procura. A cópia continua vencendo a busca, e agora sem família.

E `sureya_lancar` **recusa** cliente sem família (`cliente_sem_familia`). **Todo pagamento dessa pessoa passaria a falhar.**

### `conta_corrente.familia_id` é `ON DELETE CASCADE`

Apagar a família **apaga o razão dela inteiro**, em silêncio.

### O que eu medi das 122 famílias sem jazigo

| Situação | Famílias |
|---|---:|
| **Só a pessoa** (viraria órfã) | **110** |
| Só conversa vazia | 5 |
| **Tem dinheiro ou mensagem** | **4** |
| Totalmente vazias (apagar é inócuo) | **3** |

**119 clientes ficariam órfãos.** E o único lançamento que sumiria — R$ 40,00 — é justamente **o comprovante da Kátia**, o caso que abriu esta conversa.

### E não elimina nenhuma fusão

Dos 11 pares, **6** têm a cópia numa família sem jazigo. Mas apagar a família não apaga a cópia — ela fica órfã e continua sendo quem o WhatsApp encontra. **Os 11 pares continuam existindo.** Os outros 5 têm jazigo dos dois lados.

**A ordem certa é a inversa: normalizar → fundir → e só então apagar o que sobrar vazio de verdade.**

---

## 1. O telefone deixa de criar gente nova (0145)

`acharCliente` comparava com igualdade exata: `.eq("telefone", telefone)`.

O WhatsApp **sempre** manda com o DDI. Medido em 29/08: **46 clientes cadastrados sem o 55**. Nenhum deles era reconhecido — viravam lead, recebiam a saudação de desconhecido, e a IA respondia sem saber que havia jazigo, saldo ou combinado. Depois alguém cadastrava a pessoa de novo, e nascia a cópia.

A busca agora passa por `sureya_telefone_normalizado`, com uma **regra brasileira explícita**: 12 ou 13 dígitos começando em 55 ficam como estão; 10 ou 11 dígitos ganham o DDI; qualquer outra forma **não se adivinha** — fica visivelmente torta em vez de virar um número plausível.

**E ela não mexe no nono dígito.** `551188758966` e `5511988758966` podem ser a mesma linha ou não: a operadora sabe, o banco não. Inventar o 9 juntaria duas famílias em silêncio — e num sistema onde o telefone diz **quem paga**, um falso positivo funde dois razões, e o erro só aparece quando alguém for cobrado pelo que já pagou. Deixar como está mantém um duplicado **visível**, que a tela resolve com uma pessoa olhando.

Não escrevi uma segunda normalização em TypeScript: seria a sétima vez que este projeto paga por duas implementações da mesma regra.

## 2. A tela de fusão — Configurações › Cadastros repetidos

Os 11 pares, com **o que cada lado carrega**: jazigos, razão, comprovantes, conversas, mensagens. O par não se decide pelo nome — um é "Katia" e o outro "Kátia", um é "Marli" e o outro "Neusa Marly".

Vem um palpite marcado (quem tem jazigo), e dá para trocar.

**"O que vai mudar"** roda a mesma função em modo ensaio e mostra o que passaria, **sem mover nada**.

**Não existe "juntar todos".** Fundir apaga um cadastro, e **doze das vinte e nove** referências a `clientes` são `ON DELETE CASCADE` — entre elas conversas, mensagens e comprovantes. Um botão que resolvesse os onze de uma vez apagaria histórico de família com base num palpite meu.

A fusão move tudo **antes** de apagar, leva o razão para a família certa, e guarda o número da cópia como telefone extra quando ele é genuinamente outro — porque é por onde a família escreve hoje.

### Duas travas que os testes do próprio projeto me obrigaram a criar

**A família com gente dentro não se apaga.** Gatilho novo: recusa `delete` em família que ainda tem pessoa, lançamento ou jazigo, e diz quantos de cada. Não proíbe limpar — proíbe limpar sem ver.

**A fusão não toca no razão congelado.** `movimentos` está congelado desde a 0074, e é CASCADE. Eu tinha escrito um `update movimentos` — o teste do congelamento pegou. Agora a função **para e diz** se a cópia tiver lançamento lá. Medido: `movimentos` tem 2 linhas no total, nenhuma em cliente duplicado, então não bloqueia nada hoje.

## 3. O comprovante alcança vários jazigos — e só os da família (0146)

A Katia é responsável dos Tonellotti e a família tem **dois** jazigos. Um Pix dela pode cobrir os dois: agora dá para marcar vários, e o valor de cada mês se divide entre eles, com o centavo indo para o último.

**E jazigo de outra família passou a ser recusado.** `sureya_lancar` deduz a família do **pagador** e aceitava o jazigo sem conferir de quem era: dava para gravar `família = A` com `jazigo = B`, e **nenhuma das duas telas mostrava a verdade**. Medido: 81 lançamentos com jazigo, **zero divergentes** — nada estava errado, mas nada impedia, e o comprovante da Kátia seria o primeiro. O erro diz o conserto certo: juntar os cadastros repetidos antes.

---

## O que está provado

**31 asserções** (`testes/telefone_e_fusao.sql`) e **6 novas** em `comprovante_varios_meses.sql`, entre elas:

- o número sem o 55 e o número com o 55 acham **a mesma pessoa**; número de ninguém continua sendo de ninguém;
- **o nono dígito não é inventado**;
- **família com gente dentro não se apaga**, e o lançamento continua lá;
- o ensaio da fusão **não move nada**;
- a conversa **não foi apagada junto** (era o CASCADE); o comprovante e o razão foram, com a família certa;
- depois de fundir, **o WhatsApp continua achando a pessoa certa**;
- não se funde para dentro de um órfão, nem alguém consigo mesmo, nem cópia com razão antigo;
- **R$ 100 em três jazigos somam R$ 100**;
- **jazigo de outra família é recusado**, e nada é lançado na recusa.

**5 asserções** no simulador (12g), com o número real do caso, e **8 guardas estáticas**.

**CI verde: 300 testes, 0 falhas.** Placar igual a produção: tabelas 70, funções 149, gatilhos 28, policies 171.

---

## O que fazer agora, na ordem

1. **Configurações › Cadastros repetidos.** Junte os 11 pares, um a um, usando "O que vai mudar" antes. Comece pela **Kátia** — o cadastro que fica é o dos **Tonellotti** (2 jazigos); o R$ 40 vai junto e cai na família certa.
2. **Depois** confira os comprovantes. O da Kátia vai estar na família com os jazigos, e você poderá marcar os dois.
3. **Aí sim** apague as famílias sem jazigo. Depois da fusão, as 6 cópias ficam de fato vazias e o banco deixa. As que ainda tiverem gente, o banco vai recusar e dizer quantos — e aí é cadastro para revisar, não lixo para varrer.
