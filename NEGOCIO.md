# O back-office — a aba `Negócio` da conta

O Walkstamp visto por dentro: receita, contas, cobranças, chamados e a lista de
quem pediu aviso. Ele mora **dentro da área da conta**, como mais um item da
barra lateral — não num painel separado, com login separado e desenho separado,
que é o jeito mais rápido de ter duas telas que discordam sobre a mesma coisa.

Endereço: `/conta/negocio` (e `/en/account/business`, `/es/cuenta/negocio`,
`/de/konto/geschaeft`, `/fr/compte/activite`).

## Quem entra

Uma pessoa: você. A checagem é o e-mail da sessão contra a variável de
ambiente `WALKSTAMP_DONO`, no servidor, antes de qualquer leitura.

```
WALKSTAMP_DONO=voce@walkstamp.com
```

Sem ela configurada, **a aba não existe para ninguém** — inclusive para você.
Esse é o padrão certo: uma aba de administração que aparece por engano é muito
pior do que uma que falta.

Quem não é dono não vê o item no menu **e** não entra pelo endereço: quem digita
`/conta/negocio` sem ser dono volta para a raiz da conta. A volta é silenciosa
de propósito — responder "área restrita" confirma que a tela existe.

## O que ele mostra

| Aba | O que responde |
|---|---|
| **Radar** | Quanto entrou, quanto está em aberto, quanto venceu, quantos assentos estão pagos e parados, quanta gente existe, o que está sendo gerado — e uma lista **calculada** do que precisa de você |
| **Contas** | Um cliente por linha (assentos usados / vendidos, recebido, em aberto) e uma conta por linha, com o último uso |
| **Cobranças** | Toda fatura, **com as vencidas no topo** — a razão de abrir esta tela é achar o que não foi pago |
| **Chamados** | Tudo que chegou pela ferramenta e pelo site, **sem resposta primeiro, do mais antigo para o mais novo** |
| **Interesse** | Quem pediu aviso e ainda não virou conta, com um `mailto` em cópia oculta para escrever para todos |

A caixa **"Precisa de você"** é montada a partir dos números, não escrita: um
aviso que depende de alguém lembrar de escrevê-lo é um aviso que não vai existir
no dia em que importar.

## A trava do banco

Tudo isso sai de **uma** função — `public.walkstamp_negocio_painel()`. Uma
leitura, um instante: cinco telas fazendo cinco consultas seriam o mesmo dado
contado de cinco jeitos, com o radar dizendo "1 cliente ativo" enquanto a lista
ao lado mostra 2.

Essa função **não pergunta quem está chamando**. Ela devolve a receita, a lista
de e-mails e os chamados de todo mundo. Por isso ela está revogada de `anon` e
de `authenticated` e concedida só ao `service_role`:

```sql
revoke all on function public.walkstamp_negocio_painel() from public, anon, authenticated;
grant execute on function public.walkstamp_negocio_painel() to service_role;
```

Sem essas duas linhas, ela seria uma porta aberta para a base inteira com a
chave publicável — que vai dentro do HTML, por construção. Quem decide se é o
dono é o servidor do site, pelo `WALKSTAMP_DONO`, antes de a chamada acontecer.

A migração está aplicada no projeto `walkstamp` da Supabase com o nome
`walkstamp_negocio_painel`. Para conferir a trava a qualquer momento:

```sql
select grantee, privilege_type
  from information_schema.role_routine_grants
 where routine_name = 'walkstamp_negocio_painel';
-- deve listar apenas service_role (e o dono do banco, postgres)
```

## Por que ele é só em português

O `/negocio` tem um leitor. Traduzir "cobranças" para cinco idiomas que ninguém
vai abrir é manutenção paga em cinco lugares para uma tela com uma pessoa
dentro. O que **é** traduzido é o item do menu (`navNegocio`), porque ele divide
a barra lateral com itens que clientes leem.

## O que ele ainda não faz

- **Responder chamado pela tela.** A função `walkstamp_chamado_resposta` existe
  no banco; a tela ainda só mostra. Enquanto isso o e-mail de quem escreveu é um
  link — responder por e-mail funciona e não precisa de código.
- **Régua de e-mail.** O enquadria tem; aqui não há volume que justifique um
  disparador. O `mailto` em cópia oculta da aba Interesse resolve os primeiros
  cem contatos sem construir nada que possa apodrecer.
- **Gráfico por dia.** O dado já vem (`uso.dia`, 30 dias); a tela mostra os
  totais. Uma linha do tempo pede uma decisão sobre o que ela responde antes de
  virar pixel.
