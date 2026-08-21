# Auditoria completa para go-live — operação de lavagens em cemitério

**Data da revisão estática:** 21/08/2026
**Escopo:** aplicação Next.js, rotas HTTP, regras de negócio, aplicativo de campo/PWA,
integrações, migrations SQL, segurança, qualidade e prontidão operacional.
**Limite importante:** esta auditoria foi feita sobre o repositório. O banco Supabase,
o projeto Vercel, a Evolution API, os buckets e os dados reais não foram acessados;
portanto, itens que dependem do ambiente estão explicitamente marcados para validação.

## 1. Parecer executivo

O produto já representa boa parte do fluxo pretendido: cadastro individual de usuários,
separação entre administração e campo, agenda, execução com fotos, famílias/jazigos,
conta corrente, recebimentos, conciliação, fila de liberação de mensagens e rotinas.
O build de produção também fecha sem erro.

**Parecer: NO-GO para abertura irrestrita neste estado; GO controlado somente após os
bloqueadores P0 abaixo.** O principal risco não é falta de telas, mas autorização no
banco: as policies atuais isolam organizações, porém não separam o papel `campo` do
papel `admin`. Como a chave anônima e a sessão do usuário são necessariamente públicas
no navegador, uma conta de campo pode tentar acessar o Supabase diretamente e contornar
as restrições das APIs. Há também risco de inconsistência financeira porque concluir
uma lavagem executa vários passos sem transação única.

### Bloqueadores antes do go-live (P0)

1. Restringir no banco as operações por papel e por executora; não depender apenas das APIs.
2. Tornar a conclusão da lavagem transacional/idempotente em uma RPC de banco.
3. Autorizar `iniciar` e `concluir` somente para serviço atribuído à pessoa de campo
   (admin continua com permissão explícita).
4. Validar o estado **real** do schema, policies, grants, funções e migrations no Supabase.
5. Fazer ensaio completo com dados anonimizados, incluindo falha de rede, repetição de
   clique, upload interrompido, pagamento duplicado e restauração de backup.

## 2. O que existe e como atende ao objetivo

| Capacidade necessária | Evidência no código | Avaliação |
|---|---|---|
| Cadastro individualizado | Supabase Auth + tabela `membros`, papéis `admin` e `campo`; criação de usuário por administrador | Implementado, com ressalvas de senha e ciclo de vida |
| Cadastro de famílias e jazigos | Famílias, múltiplas pessoas, responsável financeiro, receptor de fotos, túmulos e contratos | Bem alinhado ao atendimento familiar |
| Planejamento de lavagens | Agenda diária/semanal/mensal, geração, reorganização, capacidade e puxada de backlog | Implementado; precisa prova com base real |
| Aplicativo de campo | Rota `/campo`, PWA, briefing, iniciar, foto antes/depois, materiais, não-feito e fechar dia | Implementado; falta teste real offline/móvel |
| Evidência do serviço | Fotos antes/depois e fila de aprovação humana | Boa decisão operacional e de relacionamento |
| Recebimentos | Movimentos, conta corrente, competência, pagamento manual, comprovante e conciliação | Amplo, mas o fechamento precisa atomicidade e reconciliação |
| Automação | Crons, WhatsApp/Evolution, push, agenda e rotinas | Implementada com chaves de segurança; precisa observabilidade e ensaio |
| Privacidade/LGPD | Consentimento, anonimização, portal por token e logs | Parcial; bucket público e retenção precisam decisão formal |

### Fluxo operacional reconstruído

1. O administrador cadastra a família, as pessoas, o responsável financeiro, quem
   recebe fotos, os jazigos, contrato, periodicidade e valor.
2. A agenda gera e organiza serviços de acordo com capacidade/endereço.
3. A pessoa de campo entra com conta própria, consulta o dia, inicia a lavagem e registra
   a foto anterior.
4. Na conclusão, a foto posterior é salva, o serviço muda para executado, materiais e
   remuneração podem ser registrados, e uma mensagem entra na fila para revisão.
5. O financeiro gera débitos/competências, registra ou concilia recebimentos e acompanha
   saldo e fechamento.
6. A administradora libera individualmente a comunicação à família.

Esse desenho é coerente com o objetivo declarado: automatiza o trabalho repetitivo sem
retirar da administradora o cuidado na comunicação com famílias.

## 3. Achados priorizados

### P0 — autorização de banco não separa campo de administração

As policies-base usam apenas `org_id = current_org_id()` (ou associação equivalente).
Isso evita vazamento entre organizações, mas dá a qualquer membro autenticado da mesma
organização acesso de linha equivalente. A aplicação faz uma boa separação nas rotas com
`exigirAdmin()` e `exigirLogado()`, mas ela não é uma fronteira suficiente: o cliente web
possui URL/chave anônima e token de sessão e pode chamar REST/RPC diretamente.

**Impacto:** uma credencial de campo comprometida, ou uma requisição manual no navegador,
pode potencialmente ler ou alterar clientes, financeiro, configurações e equipe, conforme
os grants efetivamente ativos no banco.

**Correção exigida:**

- criar helpers SQL como `current_member_role()` e policies explícitas por operação;
- `campo`: leitura apenas do necessário e escrita limitada a serviços atribuídos, fotos,
  ocorrências e consumo próprio;
- `admin`: CRUD administrativo da organização;
- revogar privilégios de tabela/função não necessários, especialmente RPCs
  `security definer`, e conceder apenas as funções públicas indispensáveis;
- testar com duas contas reais e chamadas diretas ao PostgREST, não apenas pela interface.

### P0 — início/conclusão não validam atribuição do serviço

As duas portas aceitam um `servicoId` enviado pelo cliente. `iniciar` consulta o serviço
com service role e grava a pessoa logada como executora, sem confirmar que aquele serviço
estava atribuído a ela. `concluir` usa o cliente da sessão, porém filtra a atualização
somente pelo ID/status; também não compara `executora_id` com o usuário de campo.

**Impacto:** uma pessoa de campo pode assumir ou concluir serviço de outra pessoa se
obtiver/adivinhar o UUID, com reflexos em fotos, remuneração, cobrança e auditoria.

**Correção exigida:** admin pode operar qualquer serviço da organização; campo somente
`executora_id = auth.uid()` (ou serviço ainda não atribuído que seja atomicamente
reservado para ela). A mesma regra deve existir em RLS/RPC, não só em TypeScript.

### P0 — conclusão não é uma transação de negócio

A conclusão faz upload, atualiza `servicos`, insere histórico/fila, calcula e insere
movimento, consome material, registra remuneração e dispara efeitos posteriores em etapas
separadas. Alguns erros são deliberadamente engolidos. Depois que o serviço vira
`executado`, uma nova tentativa retorna `jaExecutado` e não necessariamente repara tudo
que falhou após essa transição.

**Impacto:** lavagem executada sem débito, sem fila, sem material ou sem remuneração;
fotografia órfã se o banco falhar depois do upload; reconciliação manual e possível perda
financeira.

**Correção exigida:** uma RPC transacional deve validar/autorizar e executar a transição,
movimento, remuneração, consumo e outbox com chaves idempotentes. Upload fica antes da
RPC; comunicação externa sai de uma outbox reprocessável. Criar rotina de reconciliação
que compare diariamente serviços executados com todos os efeitos esperados.

### P0 — migrations não comprovam o banco de produção

O diretório contém 46 arquivos SQL, numeração com lacunas, arquivos declaradamente de
diagnóstico/extração/decisão e evolução histórica. Não há ferramenta de migration nem
pipeline configurado no `package.json`; logo, a árvore não prova quais scripts rodaram,
em qual ordem, nem se o banco atual coincide com o código.

**Correção exigida:** extrair schema/grants/policies/funções do ambiente, comparar com uma
base limpa, criar baseline versionada e adotar `supabase db diff`/migration tracking no
CI. Fazer backup validado antes de qualquer correção de policy.

### P1 — fotos e comprovantes em buckets públicos

O helper cria buckets públicos sob demanda. A URL não expira e o caminho inclui IDs;
isso facilita o portal da família, mas fotos de túmulos e comprovantes podem conter dados
pessoais e contexto sensível. A criação automática também mascara erro de provisionamento.

**Recomendação:** buckets privados, URLs assinadas curtas e autorização no portal; separar
`servicos` de `comprovantes`; definir retenção, exclusão e resposta a vazamento. Buckets
devem ser provisionados por migration/infra, não criados pela aplicação em produção.

### P1 — segredo em query string

Crons e webhook aceitam segredo por query string. URLs podem parar em histórico,
telemetria, proxies e logs.

**Recomendação:** aceitar somente `Authorization: Bearer` (cron) e header assinado com
timestamp/HMAC (webhook), comparar em tempo constante e implementar proteção contra replay.

### P1 — falhas silenciosas e observabilidade insuficiente

Há blocos que ignoram erros após a lavagem, além de `console.error`. Isso prioriza não
travar o campo, decisão correta, mas sem alerta e reprocessamento a falha vira perda oculta.

**Recomendação:** erro funcional persistido com `org_id`, `servico_id`, etapa e correlação;
painel/alerta para pendências; métricas de serviços sem fotos, débito, fila e remuneração;
heartbeat dos crons e alarme por atraso.

### P1 — suíte automatizada não está executável do zero

`npm run checar` encontrou acesso inseguro a `item.fotos.map`; `npm run testar` falhou
porque o script usa `tsx`, mas o pacote não está declarado nas dependências. O TypeScript
e o build passam, porém faltam testes de autorização, concorrência/idempotência, regras
financeiras e fluxos ponta a ponta.

**Recomendação:** declarar/fixar o runner, corrigir o acesso, tornar `checar`, `testar`,
`tsc` e `build` obrigatórios no CI. Adicionar matriz admin/campo/anônimo e testes com
duplo clique e duas requisições concorrentes.

### P1 — proteção de senha/cadastro e desligamento de pessoas

O administrador define senha inicial com mínimo de seis caracteres e a conta já nasce
confirmada. O campo `ativo` do membro não é consultado por `autenticar()`, então desativar
a linha pode não bloquear o acesso enquanto a sessão/Auth permanecer válida.

**Recomendação:** convite individual ou senha temporária forte com troca obrigatória;
MFA para admin; verificar `ativo = true` em middleware, helper de roles, policies e RPCs;
ao desligar alguém, revogar sessões e/ou banir/remover o usuário no Auth. Nunca compartilhar
contas — cada pessoa precisa manter seu próprio login para a auditoria valer.

### P2 — qualidade, manutenção e superfície

- Há uso extensivo de `any`, reduzindo a garantia dada pelo TypeScript sobre contratos do banco.
- O middleware devolve 404 para telas desligadas, mas as APIs correspondentes continuam
  compiladas e disponíveis; hoje muitas exigem admin, porém continuam sendo superfície.
- Não há lint, formatter, teste unitário convencional ou geração de tipos do Supabase.
- `node_modules` não era ignorado; esta auditoria adiciona a proteção no `.gitignore`.
- O modelo padrão de IA configurado deve ser validado no ambiente; funções opcionais não
  devem impedir o núcleo de lavagens/recebimentos.

## 4. Auditoria das regras de negócio

### Cadastro individualizado

**Pontos positivos:** identidade Auth por pessoa; associação em `membros`; papéis simples;
filtro explícito por `user_id` ao descobrir o papel; endpoint de criação restrito a admin.

**Critérios de aceite para go-live:**

- uma conta por pessoa, e-mail/telefone recuperável e termo de responsabilidade;
- admin nunca usa conta de campo e vice-versa;
- pessoa inativa recebe 403 imediatamente e sessão é revogada;
- ações críticas guardam `user_id`, data, antes/depois e motivo;
- teste prova que campo não lê família completa, saldo, comprovante, configuração ou equipe.

### Lavagens e blocos

O sistema possui capacidade, ruas, quadras, múltiplos cemitérios, cadência e agenda. Para
confirmar que “bloco” atende a operação real, cadastrar uma amostra representativa com:
duas ruas de nomes semelhantes, jazigo sem endereço, família com dois jazigos, serviço
avulso, quinzenal/mensal e duas pessoas de campo. Validar a ordem física com quem executa;
um algoritmo tecnicamente correto pode gerar percurso impraticável por portões, declive,
horários ou disponibilidade de água não modelados.

### Execução de campo

O PWA cobre o fluxo essencial e há fila offline no cliente. O aceite precisa acontecer no
aparelho real, com tela bloqueada, câmera, GPS recusado, 3G instável, modo avião entre as
fotos, reabertura do app, bateria baixa e repetição do envio. A UI deve sempre dizer se a
lavagem foi apenas salva no aparelho, recebida pelo servidor ou totalmente processada.

### Recebimentos e caixa

Existem dois conceitos históricos (`movimentos` e `conta_corrente`) e comentários indicam
mudanças de modelo. Antes do go-live, a administração deve assinar uma regra única para:
quem é devedor (pessoa ou família), pré/pós-pago, competência, serviço avulso, estorno,
pagamento parcial, adiantamento, desconto, reembolso e fechamento de mês. Executar uma
reconciliação formal: saldo inicial + créditos − débitos = saldo final, e conferir contra
extrato bancário em centavos.

## 5. Plano de go-live recomendado

### Fase 0 — saneamento técnico (obrigatória)

1. Congelar mudanças funcionais e fazer backup/restauração de ensaio.
2. Inventariar schema real, RLS, grants, triggers, funções e buckets.
3. Aplicar matriz de autorização e RPC transacional de conclusão.
4. Corrigir testes, criar CI e reconciliação automática.
5. Configurar ambientes separados, segredos, alertas, domínio/TLS e responsáveis.

### Fase 1 — cadastro assistido

1. Importar/cadastrar famílias individualmente com dupla conferência.
2. Usar checklist por família: contatos, responsável financeiro, receptor de fotos,
   jazigo/endereço, periodicidade, preço, momento de cobrança, saldo inicial e consentimento.
3. Deduplicar família, pessoa, telefone e jazigo antes de gerar agenda.
4. Manter disparos automáticos desligados durante a conferência.

### Fase 2 — piloto de campo

1. Uma pessoa, um cemitério/bloco pequeno, 10–20 lavagens e três dias úteis.
2. Aprovação humana obrigatória para toda mensagem e todo recebimento.
3. Conferência diária de fotos, execução, materiais, remuneração, débito e fila.
4. Registrar tempo real, deslocamento, falhas de localização e itens não feitos.

### Fase 3 — paralelo financeiro

Por pelo menos um ciclo de cobrança, manter a planilha/processo anterior somente como
espelho, sem lançamentos concorrentes. Comparar diariamente quantidades, valores e saldos;
qualquer diferença bloqueia expansão.

### Fase 4 — expansão gradual

Expandir por bloco/cemitério, não para toda a carteira de uma vez. Só ativar automação de
mensagens após taxa de reconciliação de 100%, zero P0/P1 aberto e procedimento de suporte
treinado. Definir janela de rollback e pessoa com autoridade para acioná-lo.

## 6. Checklist objetivo de decisão

### Segurança e dados

- [ ] Policies por papel e por atribuição testadas diretamente no Supabase.
- [ ] Todas as funções `security definer` inventariadas, com `search_path`, validação interna e grants mínimos.
- [ ] Campo inativo/bloqueado perde acesso imediatamente.
- [ ] Buckets privados e URLs assinadas, ou aceite formal e documentado do risco.
- [ ] Backup restaurado com sucesso em ambiente separado.
- [ ] Política LGPD de acesso, retenção, exclusão e incidente aprovada.

### Operação

- [ ] 100% da amostra com família, responsável, jazigo, contrato, cadência e preço conferidos.
- [ ] Agenda por bloco validada fisicamente pela equipe de campo.
- [ ] Offline/reenvio/duplo clique testados em celular real.
- [ ] Toda lavagem executada possui evidência e todos os efeitos reconciliados.
- [ ] Suporte, contingência em papel/planilha e rollback ensaiados.

### Financeiro

- [ ] Regra de pré/pós-pago e competência aprovada pela responsável.
- [ ] Saldos iniciais assinados/conferidos por família.
- [ ] Pagamento parcial, adiantamento, estorno, duplicata e mês fechado testados.
- [ ] Conciliação bancária fecha em centavos por um ciclo completo.
- [ ] Exportação e trilha de auditoria preservam autor/data/motivo.

### Engenharia

- [ ] `npm ci`, verificação estática, testes e build passam em CI limpo.
- [ ] Testes de autorização e concorrência passam.
- [ ] Alertas de cron, upload, fila e divergência financeira chegam ao responsável.
- [ ] Runbook contém deploy, rollback, rotação de segredo e restauração.

## 7. Indicadores para os primeiros 30 dias

- **Operação:** planejadas, iniciadas, executadas, não feitas e reprogramadas por dia/bloco.
- **Qualidade:** percentual com foto antes/depois e reclamações/retrabalho.
- **Produtividade:** duração e deslocamento medianos, sem usar GPS como mecanismo punitivo.
- **Financeiro:** valor previsto, debitado, recebido, conciliado e divergente.
- **Atendimento:** mensagens aguardando, tempo até aprovação e falhas de entrega.
- **Confiabilidade:** erros por etapa, itens presos na fila, crons atrasados e reprocessamentos.
- **Cadastro:** famílias por etapa (`sem_tumulo`, `sem_contrato`, `pronta`, `operacional`).

## 8. Conclusão

A arquitetura funcional está próxima de um piloto útil e demonstra conhecimento da rotina:
há preocupação com fotos, comunicação humana, diferentes responsáveis na família,
cadência, produtividade e recebimentos. Entretanto, a segurança efetiva precisa sair da
camada de interface/API e ser garantida no banco, e a conclusão da lavagem precisa virar
uma unidade transacional recuperável. Depois desses bloqueadores, a estratégia mais segura
é cadastro assistido, piloto pequeno, um ciclo financeiro em paralelo e expansão por bloco.

Esta auditoria não deve ser tratada como certificação do ambiente. O aceite final depende
das evidências do Supabase/Vercel reais, do ensaio de restauração e da validação operacional
pelas pessoas que fazem as lavagens e atendem as famílias.

