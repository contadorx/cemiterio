# Saber o que falta responder · notificações · PWA

## 1. O estado de cada conversa
Não dava para saber se uma conversa era nova ou se já tinha sido respondida.
Agora cada uma tem um estado, calculado comparando **quando a família falou**
com **quando respondemos**:

| Marca | Significa |
|---|---|
| 🔴 **não respondida · 2h** | a família falou e ninguém respondeu — com o tempo de espera |
| 🟡 **você viu, falta responder** | alguém abriu, mas não respondeu |
| ✓ **respondida** | respondemos depois da última fala dela |

Um gatilho no banco mantém isso sozinho: toda mensagem que entra zera o estado,
toda que sai marca como respondida. Abrir a conversa marca como lida.

A aba **Precisam de você** passou a incluir as não respondidas — antes só pegava
rascunho pendente e escalada.

## 2. A IA continua sugerindo
Como o gatilho reabre o estado a cada mensagem da família, a conversa volta para
"precisa de você" e o ciclo de sugestão recomeça — mesmo depois de você ter
respondido à mão.

## 3. Notificação no navegador
Botão **🔕 Ativar avisos no celular** no topo de Conversas. Ao ativar, chega um
aviso de teste na hora.

Só notifica o que não pode esperar: **família que escreveu**. Avisos da mesma
conversa se substituem em vez de empilhar.

**Precisa configurar as chaves VAPID** (veja `.env.local.example`):
```
npx web-push generate-vapid-keys
```
A chave pública vai em `VAPID_PUBLIC_KEY` **e** em `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
Sem elas, o botão simplesmente não aparece — nada quebra.

## 4. PWA no Android — por que não aparecia
O service worker estava registrado **só no `/campo`**. Ao abrir o painel, não
havia service worker, e sem ele o Android nunca oferece "instalar".

Corrigido: o SW agora é registrado na raiz e vale para o app inteiro. E há
**dois manifests**:
- `/manifest.json` → instala o **painel** (abre em /painel)
- `/manifest-campo.json` → instala o **campo** (abre em /campo)

Assim a Nina instala o app dela e você instala o seu, cada um abrindo no lugar
certo. No Chrome do Android: menu ⋮ → "Instalar aplicativo".

## 5. Salvar tudo
A ficha do cliente tinha um salvar por bloco. Agora, quando há alteração
pendente, aparece uma **barra fixa embaixo**: "2 alterações não salvas ·
[Salvar tudo] [Descartar]". Os botões de cada bloco continuam funcionando para
quem preferir salvar um de cada vez.
