# A bancada das lápides

*28 de agosto · sem migration, sem nenhum dado tocado*

## O que se mediu, e que muda o que esta tela é

| | |
|---|---|
| jazigos | 266 |
| com alguém cadastrado | 62 |
| **com mais de uma pessoa** | **0** |
| com alguma data | **0** |
| **com foto da lápide** | **266 de 266** |

E os 62 nomes vieram do campo de texto antigo `tumulos.falecido_nome`, que era
**um** campo. Olhando o conteúdo — *Nakandakari*, *Ogasawara*, *Mantovanelli*,
*"Família grave"*, *"Filha do Sr joão"* — não é o nome de quem está enterrado:
é **o que está escrito na lápide**, quase sempre o sobrenome da família, às
vezes uma anotação para reconhecer o jazigo.

**Então o sistema não tem 62 falecidos cadastrados.** Tem 62 etiquetas e 204
jazigos vazios. Era por isso que "vários mortos por jazigo" não cabia em lugar
nenhum: nunca houve um lugar onde a segunda pessoa pudesse entrar.

## A fonte já está no sistema

266 de 266 jazigos têm foto da lápide — o próprio código já a chama de
`fotoLapide`. Os nomes e as datas estão gravados na pedra, e a pedra está no
Storage. A Nina não precisa voltar lá.

## Duas telas, um cadastro

**No cadastro do túmulo** — que é onde o registro mora, como você disse. Agora
com a **foto da lápide junto**, que é o documento de onde se copia. Transcrever
com o documento noutra aba é como se troca *Nakandakari* por *Nakandakura* e
ninguém descobre nunca.

**Na bancada** (`Jazigos → Bancada das lápides`) — o mesmo trabalho numa fila:
foto grande, formulário do lado, **Próximo** troca o jazigo sem sair da tela.
Pela ficha, cada jazigo seria achar na lista, abrir, rolar, digitar, voltar —
266 vezes. É a mesma forma do *"abra a ficha e escolha"* que travava 290
famílias na conferência.

**É o mesmo componente montado duas vezes, não copiado.** Copiar o formulário
criaria duas implementações da mesma regra, e é assim que, três meses depois,
um lugar aceita "só o ano" e o outro não.

## Detalhes que decidem se funciona

**A ordem da fila é a ordem do trabalho**, não a do banco: primeiro os 204 sem
ninguém (dá para transcrever agora e é a maior pilha), depois os 62 que têm
nome e não têm data. Jazigo sem foto iria para o **fim**, nunca para fora —
sumir com ele esconderia trabalho. (Medido: nenhum está nessa situação.)

**Trocar de jazigo recomeça o formulário do zero.** Sem isso, o formulário meio
preenchido do anterior apareceria por cima da lápide do seguinte — num trabalho
de copiar nomes, é o erro mais caro que existe.

**O contador anda a cada pessoa digitada**, não só ao trocar de jazigo. Quem
acabou de cadastrar três pessoas precisa ver o número cair.

**O ano continua sendo exigido com a precisão ao lado** — dia certo / só mês e
ano / só o ano / não se sabe. Quem sabe só o ano marca assim, e **nenhum
lembrete sai numa data inventada**. Isso já existia no formulário; a bancada só
o leva para onde o trabalho acontece.

## O que isto destrava

Três coisas prontas que hoje não fazem nada: o motor de datas da 0096, a
biblioteca de mensagens de memória, e o critério "data chegando" da régua de
prioridade — que alcança zero porque não há uma única data no sistema.

## O que fica na sua mão

**Uma pergunta que eu não consigo responder daqui:** as fotos de referência
mostram a lápide com os nomes **legíveis**? Não consegui abri-las (o ambiente
bloqueia o endereço do Supabase). Abra a bancada e olhe a primeira: se der para
ler, o trabalho é de algumas tardes. Se não der, me diga — o caminho passa a
ser a Nina fotografar a lápide de perto na próxima lavagem, que é uma ida que
ela já faz.

**E o que fazer com os 62 rótulos.** Eles não são pessoas, mas servem para
achar o jazigo. Eu não mexeria: quando a lápide for transcrita, as pessoas
nascem ao lado e o rótulo continua sendo o apelido do jazigo. Mas é decisão de
dados — sua e da Sureya.
