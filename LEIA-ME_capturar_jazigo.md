# Sureya — Cadastrar jazigo no campo (GPS + fotos)

O que faltava: registrar um jazigo **novo, completo, do celular no campo**, com
geolocalização e fotos, na hora da lavagem. Agora dá.

## Não precisa de migration
Usa tabelas e colunas que já existem (tumulos, quadras, cemiterios, GPS e fotos).
**Publique e use** — nada de SQL desta vez.

## Como usar (no /campo)
Botão novo **"➕ Cadastrar jazigo (GPS e fotos)"**, logo abaixo do "Pedir material".
O fluxo é um passo de cada vez, pensado para quem está de pé no cemitério:

1. **Quadra** — escolha uma já existente na lista ou **digite uma nova** (ex.: Q-12);
   se for nova, ela é criada na hora.
2. **Identificação** do jazigo (lote/número) — obrigatório.
3. **Falecido** e **observações** — opcionais.
4. Toque em **"Criar jazigo e capturar"**.
5. Aí aparecem, no mesmo lugar:
   - **📍 Marcar localização (GPS)** — pega a melhor leitura (avisa "chegue mais
     perto" se o sinal estiver fraco, > 30 m); cada marcação melhora a média do ponto.
   - **📷 Foto de longe** (mostra o jazigo entre os vizinhos — ajuda a achar depois).
   - **📷 Foto da lápide** (close que confirma).
6. **Concluir**. Pode concluir sem todas as fotos — dá para completar depois na ficha.

Se você cadastrar uma quadra+identificação que **já existe**, o app reaproveita o
jazigo (não duplica) e só atualiza GPS/fotos.

## Escopo desta entrega
- O jazigo entra **avulso** (quadra + jazigo), sem exigir cliente — é o que a fase de
  **captura das quadras** pede. O vínculo com um cliente/plano continua sendo feito
  depois, na ficha do cliente.
- A ajudante de campo também pode cadastrar (usa o mesmo login de campo).

## Onde foi mexido
- Novo `GET/POST /api/tumulos` — GET lista cemitérios+quadras para o seletor; POST
  cria o jazigo garantindo cemitério e quadra (por código), com detecção de duplicado
  por quadra+identificação.
- Novo `src/app/campo/CapturarJazigo.tsx` — a tela (modal) do fluxo.
- `src/app/campo/page.tsx` — botão de entrada + montagem do modal.
- Reaproveita os endpoints que já existiam: `/api/tumulos/[id]/gps` e
  `/api/tumulos/[id]/foto-referencia`.

## Publicar
1. Substitua os arquivos por `sureya-app/` (GitHub Desktop → Vercel).
2. Abra `/campo` no celular → "➕ Cadastrar jazigo" → siga o fluxo.

Build validado aqui com env fake (`next build` ok, tipos e lint sem erro).

> Obs.: este pacote parte do zip que você enviou agora (tem a entrega de disparos/
> massa/botões, mas NÃO a de leads-conversa). Se quiser as duas juntas depois, me diz
> que eu concilio num pacote só.
