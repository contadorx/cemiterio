# "Precisam de você (1)" com a lista vazia

## Dois bugs na mesma tela

### 1. Contador e lista usavam regras diferentes
- **Contador:** toda conversa com `resolvida = false`
- **Lista:** equipe OU rascunho pendente OU escalada OU sem resposta

Uma conversa **já respondida, mas não marcada como resolvida** entrava na conta
e não aparecia na lista. Era o caso da sua tela.

**Corrigido:** agora existe uma função só no banco
(`sureya_contadores_conversas`) com a mesma regra da lista. Sete testes travam
cada situação — inclusive a que causou o problema.

### 2. "Carregando…" que não saía
O `setCarregando(false)` ficava depois de vários passos. Se qualquer um falhasse
no meio, a tela ficava presa para sempre.

**Corrigido:** o `finally` garante que sempre sai do carregando. E se a busca
falhar, aparece **"Não consegui carregar as conversas"** com botão de tentar de
novo — em vez de girar sem fim.

### 3. (achado no caminho) Notificação quebrada no Android
`new Notification()` lança "Illegal constructor" no Chrome do Android. O aviso
simplesmente não aparecia lá.

Agora tenta primeiro pelo **service worker** (o caminho certo no Android) e só
usa o construtor direto no computador.

## Sobre a conversa da KATIA COSTA
Era resíduo dos meus testes no banco — criei conversas de teste para verificar o
gatilho de estado e não apaguei todas. Limpei, junto com os movimentos e
entradas de teste que sobraram.
