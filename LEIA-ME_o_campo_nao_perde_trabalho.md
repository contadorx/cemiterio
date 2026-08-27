# Build B — o campo não perde trabalho

CP-04, CP-05, CP-06, CP-08 e CP-11. Tudo o que está aqui é sobre a Nina perder
trabalho sem ter como saber, no meio do cemitério, onde ela não tem a quem
reclamar no momento em que acontece.

## O que estava acontecendo

### "Guardado" não queria dizer "vai subir" (CP-06)

A fila tinha um `boolean`: subiu ou não subiu. **"Sem sinal no corredor"** e
**"o servidor recusou porque seu acesso venceu"** davam no mesmo desfecho.

O item recusado voltava para a fila, aparecia como "aguardando envio", e ia
tentar para sempre. O cartão já tinha sumido da lista dela. Ela terminava o dia
achando que fechou quinze jazigos, e um deles podia nunca ser aceito.

Agora a fila separa **o que o tempo resolve** do **que precisa de gente**:

| resposta do servidor | o que a fila faz |
|---|---|
| sem rede, 500, 502, 503, 408, 429 | guardado — tenta de novo sozinho |
| `ok: true`, "já concluído" | subiu |
| 401, 403 | **precisa de ajuda**: "Seu acesso venceu. Entre no app de novo." |
| 404 | **precisa de ajuda**: "Esta limpeza não existe mais no sistema." |
| 400 e outros 4xx, ou `200 {ok:false}` | **precisa de ajuda**, com a frase do servidor |

O caso que mais escondia trabalho era o último: `200` com `{ok:false}`. O
servidor respondia "não" educadamente e a fila lia como "não deu, tento
depois".

Os quatro estados que a auditoria pediu existem, com uma honestidade sobre
dois deles: `guardado` e `precisa de ajuda` ficam gravados; **`enviando` é
transitório e não se grava** — item que ficasse gravado como "enviando" depois
de o app fechar no meio viraria uma quarta mentira; e **`confirmado` é ter
saído da fila**, agora com recibo: uma faixa verde diz "3 lavagens enviadas
agora. Chegou tudo" e some sozinha em seis segundos.

Antes, a única prova de que o trabalho chegou era a faixa amarela sumir — e
sumir é também o que acontece quando algo dá errado.

### O jazigo já feito voltava como pendente (CP-05)

Concluir sem sinal marcava o jazigo como feito **no estado da tela**, mas o
cache do dia continuava com ele pendente, e a conclusão estava no IndexedDB.
Fechar e reabrir o app ainda sem sinal trazia o mesmo jazigo de volta como
"falta lavar". Ela tiraria a foto de novo, e a fila ganharia trabalho duplicado
do mesmo túmulo.

Duas coisas mudaram:

- o que a tela mostra é sempre **a lista mais a fila local** — no cemitério o
  aparelho sabe mais que o servidor na maior parte do dia;
- **quem escreve na lista escreve no cache, no mesmo gesto**. Separar os dois é
  como eles discordavam.

### "4 registros esperando" para duas lavagens (CP-11)

Uma lavagem gera **dois** registros: `iniciar` e `concluir`. A faixa contava
registros — unidade de programador; ninguém no cemitério sabe quantos registros
uma lavagem tem — e o trabalho parado parecia o dobro do que era.

Agora: *"**2 lavagens** aguardando envio (Maria Aparecida, José Carlos)."* Os
recados — "não deu para fazer" e pedido de material — são contados à parte,
porque não são lavagem.

Os nomes importam: com o número sozinho, ela não sabia se o que faltava era o
jazigo da manhã ou o de agora.

### Dois toques viravam dois registros (CP-08)

Cada tentativa criava um `uuid` novo. Num aparelho lento a câmera demora a
abrir; dois toques abriam duas vezes e gravavam duas linhas da mesma lavagem.

- A chave da fila passou a ser **`servicoId:tipo`**. A mesma lavagem escrita
  duas vezes ocupa uma linha só, porque o IndexedDB sobrescreve pela chave.
  Onde já houver duplicata de aparelho antigo, fica **a mais antiga** — é a foto
  que ela tirou primeiro, com o jazigo do jeito que achou.
- O botão trava **no primeiro toque** e diz "Abrindo a câmera…".

A trava tinha um risco óbvio, e ele está tratado: em alguns Android, cancelar a
câmera não dispara `change`, e o botão ficaria morto para sempre. Então a trava
também se solta quando a janela volta a ter foco — que é o que acontece ao sair
da câmera de qualquer jeito.

### "Não deu para fazer" e material eram `fetch` cru (CP-04)

A faixa amarela promete "pode continuar — eu guardo e mando quando o sinal
voltar", e essas duas ações não estavam na fila. São justamente as mais
prováveis onde o sinal é pior: chuva, água acabada, jazigo não encontrado,
acesso fechado. Ela recebia "Não consegui registrar agora. Tente de novo." de
pé, no corredor.

As duas entraram na fila, e a tela agora diz **guardado**, não *enviado*, quando
foi guardado.

## Um defeito que eu achei no caminho

O comentário do `sincronizar` dizia:

> *"para de tentar os próximos DESTE serviço, para não subir uma conclusão cujo
> início ainda não chegou"*

O laço seguia direto. Um `iniciar` preso mandava o `concluir` assim mesmo, e o
serviço subia **sem a foto do antes e sem duração**. Consertado: o serviço
travado é anotado e pulado até a próxima rodada.

## Provas

**28 testes novos** no simulador. As regras que decidem se um trabalho fica
esperando para sempre foram **tiradas de dentro do `fetch`** justamente para
poderem ser provadas — `classificar()`, `contarFila()` e `deduplicar()` são
puras e não tocam em rede nem em banco.

Entre elas: `200 {ok:false}` é recusa e não espera; "já concluído" é sucesso;
4 registros são 2 lavagens; dois toques viram um item e fica a primeira foto;
dois pedidos de material **não** colapsam; item da versão anterior entra como
`guardado` (vazio não é zero, também aqui).

**17 guardas estáticas** novas, entre elas que a faixa não volta a dizer
"registro", que item recusado para de ser tentado, e que a trava se solta no
foco.

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.

## Um aviso que ficou no código

Ao ajustar a fila eu quase consertei `campo/Concluir.tsx` — a tela antiga de
concluir, que **não está no ar** e que ninguém importa. É exatamente o CP-10 da
auditoria: com três implementações do cartão no diretório, dá para corrigir a
errada e achar que mudou a produção.

Não apaguei (a remoção é do Build E), mas escrevi o aviso no topo do arquivo.
O arquivo de campo que vale é `campo/page.tsx`.
