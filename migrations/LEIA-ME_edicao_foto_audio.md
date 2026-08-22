# Editar cliente · foto · transcrição de áudio

## 1. Transcrição de áudio — estava pronta e desligada
O `src/lib/transcricao.ts` existia desde o começo (Groq whisper-large-v3, com
OpenAI whisper-1 de reserva), mas **nunca foi ligado no webhook**. O áudio da
família virava literalmente `[áudio]` na conversa.

Agora: chega áudio → baixa do Evolution → transcreve → **a conversa já nasce com
o texto**. A IA responde ao conteúdo, não a um marcador.

A mensagem fica marcada com **🎤 áudio transcrito** na tela, para você saber que
aquilo não foi digitado — se a transcrição soar estranha, é sinal de ouvir o
original.

**Para funcionar precisa de uma chave** (`.env`):
- `GROQ_API_KEY` — recomendado, é bem mais barato para áudio
- ou `OPENAI_API_KEY`

Sem nenhuma das duas, o áudio cai como `[áudio que não consegui transcrever]` e
vai para revisão manual — nunca some silenciosamente.

## 2. Editar nome, apelido e telefone
Faltava mesmo. No topo da ficha agora tem **Editar dados**:
- **Nome** — o oficial
- **Como é chamada** — o apelido do dia a dia ("Dona Cida"), que às vezes é o
  único nome que a família reconhece
- **WhatsApp**

Mudanças em nome e telefone ficam registradas em `historico_cliente` (de → para,
quem mudou, quando). Telefone é a chave de identificação no WhatsApp: perder o
rastro de uma troca daria confusão difícil de desfazer.

## 3. Foto da família
Círculo no topo da ficha. Sem foto, mostra as iniciais sobre o azul da marca.
Clique para enviar, e o link embaixo remove.

São 59 famílias, várias com nome parecido (três Solanges, duas Katias, duas
Sonias, dois Edsons). O rosto resolve em um segundo o que o nome não resolve.
