# O link mágico não entra

## O que estava errado (já corrigido no código)

O link de volta chega de **uma de duas formas**, e a diferença depende de como o
modelo de e-mail do Supabase está escrito:

| o modelo usa | o link volta com |
|---|---|
| `{{ .TokenHash }}` | `?token_hash=…&type=magiclink` |
| `{{ .ConfirmationURL }}` — **o padrão do Supabase** | `?code=…` |

A rota `/conta/confirmar` só entendia a **primeira**. Com o modelo padrão ela
recebia um `code` que não sabia ler, não achava `token_hash`, e mandava a pessoa
de volta para `/conta` — que é a tela de pedir o e-mail. Daí a sensação de que o
link não faz nada: ele faz, volta, e a volta parece o começo.

Agora ela entende as duas. É a correção que resolve sem você mexer em nada.

## Confira mesmo assim, no painel do Supabase

**Authentication → URL Configuration**

- **Site URL:** `https://walkstamp.com`
- **Redirect URLs** (uma por linha):
  ```
  https://walkstamp.com/conta/confirmar
  https://walkstamp.com/conta/confirmar?*
  ```
  Sem isso o Supabase recusa o `emailRedirectTo` e devolve para a Site URL — o
  que também termina na tela de pedir o e-mail.

**Authentication → Email Templates → Magic Link**

Se quiser o caminho mais curto (um pulo a menos, e o token nunca passa pelo
servidor do Supabase), troque o corpo por:

```html
<p><a href="{{ .SiteURL }}/conta/confirmar?token_hash={{ .TokenHash }}&type=magiclink">Entrar na sua conta</a></p>
```

Com a correção de agora, **os dois modelos funcionam**. Este só é um pouco
melhor.

## Se ainda não entrar

1. Peça o link e **abra num navegador anônimo**. Alguns clientes de e-mail
   pré-visualizam links e **gastam o token** antes de você clicar — o sintoma é
   "já foi usado ou expirou".
2. Olhe o endereço para onde o e-mail te levou. Se ele **não** tiver
   `token_hash=` nem `code=`, o problema é a Redirect URL acima.
3. Confira as duas variáveis na Vercel: `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY`. Sem elas a conta não abre sessão nenhuma.

## Sobre a conta "parecer antiga"

Ela não está. Comparei a publicada com a daqui: **rodapé igual, cabeçalho
igual**. O que muda é em relação ao *site*:

- o rodapé da conta é uma linha (razão social e CNPJ), não as três colunas de
  links do site — ela é tela de trabalho, não página de venda;
- ela tem **PT EN ES**, e não os cinco. Alemão e francês caem no inglês, de
  propósito: mandar quem lê alemão para uma tela em português seria pior, e um
  `/de/konto` que não existe seria um 404.

Se quiser a conta nos cinco idiomas, ou com o rodapé do site, é trabalho — mas é
decisão, não defeito.
