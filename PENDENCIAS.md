# O que falta — inventário conferido em 22/08/2026

As listas dentro de cada `BUILD_*.md` foram escritas no dia daquele build e
várias envelheceram: itens marcados ❌ lá foram fechados por migrations
posteriores e ninguém voltou para riscar. **Este arquivo é o que vale.**

Conferido no banco de produção e no código, não de memória.

---

## 1. O que estava marcado como pendente e JÁ ESTÁ FEITO

Medido em produção agora:

| Item | Onde dizia ❌ | Estado real |
|---|---|---|
| Policies por operação | BUILD_1 | ✅ **48 restritivas** |
| Guarda `is_admin()` nas funções de dinheiro | BUILD_1 | ✅ **30 funções** |
| Campo escreve só no serviço dele | BUILD_1 | ✅ `0067` + `0068` |
| Grants e RPCs `security definer` revisados | BUILD_1 | ✅ **0 funções `sureya_` executáveis pelo anônimo** |
| Matriz anônimo/campo/admin | BUILD_1 | ✅ **9 de 9 em produção** (`BUILD_7.md` §2.1) |
| RLS em todas as tabelas | — | ✅ nenhuma tabela pública sem RLS |
| Rodar o Build 2 no ambiente real | BUILD_2 | ✅ as funções estão em produção desde a 0066/0068 |

Risquei esses nos arquivos de origem no mesmo commit.

---

## 2. O que falta de verdade, na ordem em que eu faria

### 2.1 Bloqueiam o piloto

**a) A amostra não existe.** 1 família pronta e contratada; o roteiro pede 5.
Depende de você: preencher as datas do plano de **Andre** e **Anninha**, e
fechar 2 contratos entre as 47 famílias que já têm jazigo. Ver
`/painel/conferencia`.

**b) Restaurar um backup e conferir os números.** Você disse para deixar com o
Supabase — combinado, mas *ensaiar a restauração* é diferente de *ter backup*. É
30 minutos: restaure num projeto novo e confira quantas famílias e qual o saldo.
Sem isso, "temos backup" é uma crença.

### 2.2 Fecham antes da primeira família REAL entrar

**c)** ~~Segredos aceitam query string~~ — **feito em 22/08, com uma ressalva.**

O cron está fechado: só `Authorization: Bearer`, e a comparação virou tempo
constante. Nada dependia do `?secret=` — disparar à mão continua possível, com o
segredo no header.

O webhook era diferente do que a pendência dizia. **Era o próprio sistema que
punha o segredo na URL:** `api/whatsapp` registrava
`.../webhook/evolution?secret=<segredo>` na Evolution, e essa URL fica gravada
na configuração da instância. Agora o registro manda `x-webhook-secret` em
header e a URL vai limpa.

A ressalva: **Evolution v1 não tem campo de header.** Numa instância v1 não há
para onde mover o segredo, e recusar seria trocar "segredo no log" por "webhook
sem autenticação" — qualquer um postando mensagem em nome da família. Então a
rota ainda aceita `?secret=`, **e avisa em `erros_log` toda vez que isso
acontece.**

> **Uma ação sua:** Configurações → WhatsApp → configurar o webhook. A tela vai
> dizer se a instância é v2 (segredo no header, URL limpa) ou v1 (segredo na
> URL, com aviso). Se der v2 e o aviso parar de aparecer, eu apago as duas
> linhas do caminho legado.

**d)** ~~O direito de acesso não inclui as fotos~~ — **feito.** `GET /lgpd` leva
os arquivos com a origem de cada um, usando a **mesma** lista que a remoção usa.
Se as duas divergirem, passa a existir arquivo que se exporta e não se apaga.

**e) Cópia do Storage.** As fotos não entram no backup do banco. Hoje são 409
arquivos sem segunda via. O Supabase não faz isso sozinho.

**f) Versão do termo aceito.** `consentimento_em` registra *quando*, não *o
quê*. Se a política mudar, não há como saber quem aceitou qual.

### 2.3 Fecham antes de AMPLIAR além do primeiro bloco

**g) Convite, senha e MFA.** Hoje `POST /api/membros` cria o usuário com
`createUser` e **a senha é digitada pela admin** — ela sabe a senha da Nina. Não
há convite por e-mail, recuperação de senha, nem segundo fator.

**h) Correlação nos logs.** `registrarErro` aceita `detalhe`, e **8 das 15
chamadas** já mandam o serviço. Falta padronizar as outras 7 — sem isso,
investigar "a lavagem da Nina falhou terça" é ler log por horário.

**i) A função que apaga do expurgo.** A prévia existe e conta; a que apaga não.
Deliberado: hoje devolve zero em tudo, e escrever no escuro o único código que
destrói dado de família é como se descobre errado depois. Entra quando houver o
que apagar — daqui a anos, para o financeiro.

**j) Ensaiar rollback de migration** e a queda da Evolution no meio de um envio
com várias fotos.

### 2.4 Dívida conhecida, sem prazo

**k) O seed de teste está quebrado.** `SEED_dados_teste.sql` é anterior à 0049 e
não conhece `familias` — zero menções. Quem quiser montar um ambiente de ensaio
não consegue popular.

**l) Não há ESLint.** Não existe `.eslintrc`, o `next build` não roda lint, e os
`eslint-disable-next-line` pelo código são decorativos. O portão hoje é tipagem
+ 152 testes + 75 provas SQL + build.

**n) `ordem_na_rua` é contada por metade, não pela rua inteira.** Desde a 0084
doze ruas viraram uma parada só, costurando as duas quadras. Mas a posição
dentro da rua é atribuída por `rua_id` (`src/app/api/tumulos/route.ts`), ou
seja, por metade: quando a Quadra 2 e a Quadra 4 forem cadastradas, as duas
metades vão numerar cada uma do começo e o roteiro vai intercalá-las.

Já acontece hoje na `transversal-3`: as metades ocupam 400..700 (Quadra 1) e
50..700 (Quadra 3). Não corrigi porque a correção depende de um fato do
cemitério: numa rua cortada pela Principal as metades vêm uma **depois** da
outra (ordenar por quadra, depois por posição), enquanto na Rua 7 e nas
Transversais as metades são os dois **lados** da mesma via, percorridos juntos
(ordenar só por posição, intercalando de propósito). Uma regra por tipo de
chave resolve; falta decidir qual vale para qual.

**o) `chave_fisica` é global à org, não ao cemitério.** O índice é
`(org_id, chave_fisica)` e o roteiro agrupa pela string. Com dois cemitérios na
mesma org, uma "Rua 3" em cada um cairia na mesma chave e as duas seriam
costuradas numa parada só. Vale para as chaves da 0051 também. Com um cemitério
só, não morde.

**p) A bússola do Android continua sendo o elo fraco da seta.** O código só
aceita orientação **absoluta** (`e.absolute`), e boa parte dos aparelhos entrega
orientação relativa enquanto o magnetômetro não é calibrado — nesses casos a
seta cai no rumo do GPS, que só existe andando. O mapa (D-05) contorna isso
inteiro, e por enquanto é a resposta. Se a seta continuar sendo o caminho
preferido no campo, o passo seguinte é uma tela de calibração ("faça um oito com
o celular") em vez de mais filtro.

**q) O mapa precisa de rede para a imagem aérea.** Sem sinal, os quadrados de
satélite não carregam e a tela mostra os dois pontos, a linha e a escala sobre
fundo claro — funciona, mas perde as referências de terreno, que são o motivo do
mapa existir. Guardar os quadrados do cemitério no cache do service worker
resolveria: são poucos, o terreno não muda, e a Nina anda sempre nos mesmos
400 metros.

**r) A causa do texto ruim de 22/08 não foi provada.** A frase de reserva chegou
à fila mesmo com a família tendo destinatário e o jazigo tendo `familia_id`, e
não há nada em `erros_log`. As hipóteses que sobram são a versão publicada estar
atrás do repositório, ou a linha já existir de uma tentativa anterior e o
`on conflict do nothing` ter preservado o texto velho. A 0085 conserta o que
aparece — o texto de reserva agora é um modelo de verdade — mas **não** fecha a
pergunta. Se acontecer de novo, é sinal de que o caminho da aplicação está
falhando calado, e aí o conserto é outro.

**s) O lead não é ligado ao cliente.** `leads.cliente_id` existe e ninguém
preenche. Sem essa amarração não dá para responder "de cada dez contatos do site,
quantos viraram segunda limpeza?" — a única pergunta que decide se vale gastar em
mídia. Falta decidir o momento: na conversão, ou no cadastro da família. Ver
`HOME_EXECUCAO.md`.

**t) A home ainda não tem prova real.** `prova.mostrarFotos` continua `false` e o
mecanismo está pronto — faltam os arquivos em `public/site/`. E o preço de R$ 40
anunciado no site saiu do padrão do banco, nunca foi confirmado como o menor
preço praticado. Os dois dependem de você, não de código.

**u) O segundo cemitério é um placeholder no ar.** `marca.ts` tem
`nome: "NOME DO CEMITÉRIO"` com `ativo: false` — invisível para o visitante, mas
qualquer descuido que ligue `ativo` publica isso. Precisa do nome oficial, do
bairro e da confirmação da cidade antes de virar página.

<<<<<<< Updated upstream
=======
**v) O gatilho que cria família a partir do contato continua ligado.**
`sureya_familia_para_cliente` (0062) ainda batiza uma família nova a cada contato
que nasce sem `familia_id` — é o que mantinha o um-para-um. Depois da 0091 ele
não atrapalha (contato criado dentro de uma família já traz `familia_id`), mas
uma porta que ainda crie contato solto continua gerando família automática com
nome deduzido. Vale revisar quando as portas de cadastro estiverem todas
família-primeiro.

**w) `tumulos.cliente_id` é campo derivado e ninguém sabe disso lendo o código.**
Desde a 0091 quem manda é `familia_id`, e `cliente_id` é preenchido por gatilho a
partir do contato financeiro. As leituras existentes continuam certas, mas uma
escrita direta em `cliente_id` seria sobrescrita na próxima troca de responsável
sem aviso. Um `comment on column` já ajudaria; o certo é ir tirando as escritas.

>>>>>>> Stashed changes
**m) A remoção a pedido nunca foi exercitada.** É a etapa 4 do roteiro
(`BUILD_7.md` §6) e vale fazer com uma família de teste **antes** da primeira
real pedir.

---

## 3. O que NÃO vamos fazer, e por quê

| | |
|---|---|
| Buckets privados com URL assinada | **D-03** — a família é idosa, link direto é o acesso |
| Tirar o botão de cadastrar jazigo do campo | **D-02** — se um build mexer nisso, eu pergunto antes |
| Apagar `tumulos.falecido_nome` na remoção | inutiliza o cadastro do jazigo, que é o objeto do contrato |
| Apagar dados de quem foi indicado | são de um **terceiro**; sai só o vínculo |

---

## 4. Resumo em uma linha

**O sistema não está bloqueando o piloto — o cadastro está.** Os dois itens que
dependiam de código meu (c, d) foram fechados em 22/08. O que segura a data é
você ter 5 famílias prontas.
