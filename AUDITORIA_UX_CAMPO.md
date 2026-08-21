# Auditoria de UX e contraprovas — aplicativo de campo

**Data:** 21/08/2026
**Objeto:** somente a experiência da pessoa que executa lavagens no cemitério.
**Método:** inspeção heurística do fluxo ativo, análise de estados, contagem de ações e
contraprovas estáticas. Não houve teste presencial com a operadora nem aparelho real;
os roteiros de validação prática estão definidos neste documento.

## 1. Resposta direta

O núcleo da lavagem está no caminho certo: existe uma ação principal por estado, botões
grandes, linguagem cotidiana, reconhecimento por fotos e fila offline para início e
conclusão. Mesmo assim, **a tela inteira ainda não pode ser considerada simples o
suficiente para uma operação ágil**.

O problema não é o botão de fotografar. Antes de chegar ao primeiro jazigo, a pessoa pode
encontrar instalação/notificações, briefing repetido, conversa com apoio, “puxar mais”,
“encerrar dia”, material e cadastro de jazigo. Em cada cartão ainda aparecem localização,
até três fotos, avisos, cronômetro e duas ações lado a lado. A função principal está correta,
mas compete visualmente com funções de exceção e configuração.

**Parecer de simplicidade:**

- **fluxo feliz de uma lavagem:** aprovado com ressalvas;
- **visão do dia e priorização:** razoável;
- **prevenção de erro:** insuficiente em cancelamento da câmera, repetição e offline;
- **recuperação de falha:** insuficiente porque “guardado” não equivale a “confirmado” e
  nem todas as exceções funcionam offline;
- **tela como um todo:** precisa simplificação antes de escalar a operação.

## 2. Critério de simplicidade adotado

Para esta operação, “simples” não significa apenas poucos componentes ou aparência limpa.
O app será usado andando, ao sol, possivelmente com luvas, mãos molhadas, conexão ruim e
atenção dividida entre ferramenta, lápide e rota. Portanto, a experiência deve cumprir:

1. **Uma decisão por vez:** o próximo passo é inequívoco.
2. **Ação principal dominante:** exceções não disputam espaço com a lavagem.
3. **Reconhecimento, não memória:** foto e endereço confirmam o jazigo.
4. **Estado explícito:** não iniciado, em andamento, guardado no aparelho, enviado e com erro.
5. **Erro recuperável:** cancelar câmera, tocar duas vezes ou perder sinal não duplica nem perde trabalho.
6. **Operação com uma mão:** alvos grandes, sem ações críticas lado a lado.
7. **Sem promessas falsas:** “funciona sem internet” vale para tudo que a tela oferece ou
   a exceção é claramente marcada como indisponível.
8. **Pouca rolagem administrativa:** a rota de lavagens começa antes das ferramentas ocasionais.

## 3. Fluxo ativo observado

O componente realmente renderizado é `src/app/campo/page.tsx`, que contém uma segunda
implementação própria do cartão. `CardTumulo.tsx`, `Concluir.tsx` e
`ConfirmarJazigo.tsx` permanecem no repositório, mas não fazem parte do fluxo atual.

### Caminho mínimo de uma lavagem

1. Localizar o grupo de quadra/rua.
2. Reconhecer o jazigo por endereço, nome e fotos.
3. Opcionalmente abrir “Como chegar” e voltar ao cartão.
4. Tocar em “Tirar foto e começar”.
5. Fotografar e confirmar no aplicativo de câmera do sistema.
6. Executar a lavagem.
7. Tocar em “Tirar foto e terminar”.
8. Fotografar e confirmar novamente.
9. Aguardar preparação/gravação; o cartão desaparece da lista pendente.

Assim, “dois toques” é uma boa metáfora de produto, mas não é a contagem real. São duas
ações no app e pelo menos duas confirmações da câmera, além da localização do cartão e,
quando necessário, navegação. A meta correta para avaliação é **duas decisões operacionais
por lavagem**, não literalmente dois toques.

## 4. O que está bem resolvido

### 4.1 Uma ação principal por estado

O cartão troca “começar” por “terminar” depois do início, em vez de mostrar as duas opções.
Isso reduz decisão e previne conclusão acidental antes do começo.

### 4.2 Linguagem concreta

“Tirar foto e começar”, “tirar foto e terminar” e “não deu para fazer” são termos do
trabalho, sem jargão de ERP como ordem de serviço, baixa ou apontamento.

### 4.3 Alvos grandes e legíveis

As ações principais têm altura mínima de 64 px e fontes de 18 px. O app restringe a largura
e usa orientação retrato, decisões adequadas para celular e operação em pé.

### 4.4 Reconhecimento visual

Fotos “onde fica”, “o jazigo” e “antes (hoje)” apoiam tarefas diferentes: orientação,
confirmação e evidência. Endereço e nome aparecem antes da ação.

### 4.5 Continuidade básica sem sinal

Início e conclusão tentam enviar e, se falharem, são guardados no IndexedDB. A ordem é
preservada para que o início seja processado antes da conclusão. A agenda do mesmo dia é
mantida em `localStorage`, e `/campo` possui fallback de cache no service worker.

### 4.6 GPS não bloqueia a lavagem

A coleta de GPS da conclusão ocorre em paralelo. É uma boa escolha: precisão opcional não
deve segurar uma tarefa física já realizada.

## 5. Contraprovas das afirmações de simplicidade

Contraprova não significa que o fluxo falha sempre; significa construir uma situação em
que a afirmação deixa de ser verdadeira.

### CP-01 — “A tela leva direto ao trabalho”

**Cenário:** primeiro acesso, notificações ainda não decididas, briefing com materiais e
dia com muitos jazigos.
**Observação estática:** antes da lista são renderizados cabeçalho, convite de instalação/
notificação, briefing/assistente com três ações, pedido de material e cadastro de jazigo.
**Resultado:** a operadora precisa ler ou rolar por até cinco áreas antes do primeiro cartão.
**Conclusão:** reprovada. Ferramentas ocasionais devem ficar em “Mais opções”; a rota deve
começar logo após o resumo.

### CP-02 — “Há somente uma escolha por vez”

**Cenário:** cartão ainda não iniciado.
**Observação estática:** aparecem “Como chegar”, “Tirar foto e começar” e “Não deu para
fazer”; as duas últimas ficam lado a lado.
**Resultado:** há três caminhos visíveis, e a ação de exceção reduz a largura da principal.
**Conclusão:** parcialmente reprovada. “Não deu” deve ser link secundário abaixo, afastado
da ação principal; “Como chegar” pode ser incorporado à área de endereço/foto.

### CP-03 — “Dois toques concluem uma lavagem”

**Cenário:** câmera nativa exige confirmação da foto.
**Observação estática:** cada toque abre um `<input capture="environment">`; a confirmação
acontece fora do app e pode oferecer repetir/usar foto.
**Resultado:** pelo menos quatro interações, sem contar localizar/rolar.
**Conclusão:** a promessa literal é falsa. A UX continua curta, mas deve ser medida como
duas decisões, tempo e taxa de erro, não pela contagem promocional de toques.

### CP-04 — “Sem internet pode continuar normalmente”

**Cenário:** sem sinal, a pessoa informa que não achou o jazigo ou que faltou material.
**Observação estática:** início/conclusão têm fila; `NaoDeu`, `Materiais`, conversa, puxar
mais, encerrar dia e cadastro usam `fetch` direto.
**Resultado:** a faixa promete continuidade, mas exceções operacionais falham e pedem nova
tentativa. “Não deu” é justamente mais provável onde o sinal é ruim.
**Conclusão:** reprovada. Enfileirar ao menos “não feito” e pedido de material, ou mudar a
mensagem para dizer exatamente quais ações ficam guardadas.

### CP-05 — “O que ficou guardado não reaparece”

**Cenário:** concluir offline, fechar/recarregar o app ainda offline.
**Observação estática:** o estado React marca o item como executado, mas o cache da agenda
é atualizado somente após resposta válida da API. Ao reabrir, a lista cacheada anterior
pode mostrar o mesmo jazigo como pendente, embora a conclusão esteja no IndexedDB.
**Resultado:** risco de confusão, nova foto e duplicação de fila.
**Conclusão:** reprovada. A renderização deve reconciliar agenda cacheada com a fila local e
mostrar “concluído no aparelho — aguardando envio”.

### CP-06 — “Guardado” significa trabalho finalizado

**Cenário:** servidor retorna erro persistente de autorização, validação ou regra de negócio.
**Observação estática:** qualquer resposta não reconhecida vira item offline; a faixa mostra
apenas quantidade aguardando. A sincronização aumenta tentativas, mas não classifica nem
expõe erro permanente.
**Resultado:** o cartão some e a pessoa acredita que terminou; o item pode nunca ser aceito.
**Conclusão:** reprovada. Separar estados `guardado`, `enviando`, `confirmado` e `precisa de
ajuda`, com detalhe simples e alerta persistente para falha permanente.

### CP-07 — “Cancelar a câmera não muda o fluxo”

**Cenário:** tocar em começar, cancelar a câmera e depois abrir a câmera por outra ação.
**Observação estática:** quando nenhum arquivo volta, a função retorna antes de limpar
`pendente.current`; a ação pendente antiga permanece.
**Resultado:** estado interno obsoleto e comportamento dependente do navegador na próxima
seleção.
**Conclusão:** reprovada. Limpar a ação pendente também no cancelamento e testar Android/iOS.

### CP-08 — “Toque duplo não duplica operação”

**Cenário:** celular lento; a pessoa toca duas vezes antes de a câmera abrir ou imediatamente
após voltar dela.
**Observação estática:** o bloqueio visual começa somente depois que `change` recebe arquivo;
o botão não é desabilitado no primeiro toque. A fila cria UUID local novo para cada tentativa.
**Resultado:** podem surgir duas aberturas/tentativas e registros locais repetidos.
**Conclusão:** precisa teste e trava imediata no primeiro toque, além de idempotência por
`servicoId + tipo` na fila local.

### CP-09 — “As fotos tornam o cartão mais simples”

**Cenário:** jazigo com três fotos, avisos e tela estreita.
**Observação estática:** as miniaturas formam carrossel horizontal com rótulos; depois vêm
avisos, cronômetro e ações.
**Resultado:** ajudam no reconhecimento, mas aumentam altura e rolagem; em rota longa, a
próxima tarefa fica distante.
**Conclusão:** parcialmente aprovada. Mostrar uma foto principal grande/útil e agrupar as
demais em “ver mais”; após iniciar, priorizar somente foto de hoje e terminar.

### CP-10 — “O app tem uma implementação clara do cartão”

**Cenário:** manutenção ou correção urgente.
**Observação estática:** existe `CardTumulo.tsx` com uma implementação aparentemente ativa,
mas `page.tsx` define e usa outro `Card`; `Concluir.tsx` e `ConfirmarJazigo.tsx` também são
fluxos antigos não importados.
**Resultado:** um desenvolvedor pode corrigir a tela errada e acreditar que alterou produção.
**Conclusão:** reprovada em manutenibilidade, que afeta UX futura. Remover/arquivar código
morto ou consolidar o cartão em um único componente testado.

### CP-11 — “A pessoa sabe o que já foi enviado”

**Cenário:** três conclusões offline e retorno parcial da rede.
**Observação estática:** a faixa mostra somente o total de registros, não quais jazigos,
tipo, horário ou estado. Um serviço gera dois registros (`iniciar` e `concluir`), portanto
“4 registros esperando” não significa “4 jazigos”.
**Resultado:** o contador usa unidade técnica, não linguagem operacional.
**Conclusão:** reprovada. Mostrar “2 lavagens aguardando envio”, com resumo acessível por jazigo.

### CP-12 — “Encerrar o dia é simples e seguro”

**Cenário:** toque acidental ou pessoa com pouca familiaridade.
**Observação estática:** o fluxo usa `confirm()`, depois `prompt()`, depois `alert()`, interfaces
do navegador com aparência variável e pouca explicação contextual.
**Resultado:** três diálogos, bloqueio da tela e risco de confirmar mecanicamente.
**Conclusão:** reprovada. Usar uma única folha com resumo: feitos, aguardando envio, não
feitos e ação inequívoca de encerrar.

## 6. Diagnóstico por heurística

| Heurística | Nota | Evidência resumida |
|---|---:|---|
| Próximo passo visível | 4/5 | A ação muda por estado e tem texto claro |
| Carga cognitiva | 2/5 | Muitas ferramentas aparecem antes da rota e no cartão |
| Operação com uma mão | 3/5 | Alvos grandes, mas duas ações dividem a mesma linha |
| Prevenção de erro | 2/5 | Cancelamento, toque duplo e atribuição precisam travas |
| Visibilidade do estado | 2/5 | Offline mostra registros técnicos, não confirmação por lavagem |
| Recuperação de falha | 2/5 | Erro permanente pode parecer apenas pendência offline |
| Consistência | 2/5 | Duas implementações de cartão e diálogos nativos misturados |
| Acessibilidade | 3/5 | Fonte/alvos bons; falta auditoria de contraste, foco e leitor de tela |
| Eficiência da rota | 3/5 | Agrupamento físico ajuda; altura dos cartões aumenta rolagem |
| Adequação à linguagem | 5/5 | Textos concretos e respeitosos |

**Resultado:** 28/50. O fluxo central é compreensível, mas simplicidade operacional exige
menos superfície e estados offline mais honestos.

## 7. Redesenho mínimo recomendado

Não é necessário reescrever o produto. A maior melhoria vem de hierarquia e estados.

### Tela “Meu dia”

1. Faixa compacta: `Próximo: Quadra 1 · Rua 3` e `3 de 12 concluídos`.
2. Se offline: `2 lavagens guardadas neste celular` + botão `Ver`.
3. Lista começa imediatamente.
4. Uma área recolhida `Mais opções` contém apoio, materiais, cadastrar jazigo e puxar mais.
5. `Encerrar dia` aparece somente no fim da lista ou dentro de “Mais opções”.
6. Instalação/notificações aparecem no onboarding ou após o expediente, nunca no meio da rota.

### Cartão não iniciado

- endereço e nome;
- uma foto principal de localização, tocável para ver as demais;
- ação dominante em largura total: `📷 Tirar foto e começar`;
- links secundários abaixo: `Como chegar` e `Não consegui fazer`.

### Cartão iniciado

- estado: `Em andamento · começou 10:32`;
- foto anterior pequena como confirmação;
- única ação dominante: `📷 Tirar foto e terminar`;
- `Não consegui terminar` como link separado.

### Após concluir offline

O cartão não deve simplesmente desaparecer. Por alguns segundos, mostrar:

> ✓ Guardado neste celular
> Enviaremos quando a internet voltar.

Depois, mover para uma seção recolhida `Concluídos hoje`, mantendo o selo `aguardando envio`.
Somente após resposta do servidor, trocar para `enviado`.

## 8. Prioridades

### P0 — antes do piloto

1. Reconciliar cache da agenda com IndexedDB ao abrir/recarregar offline.
2. Diferenciar pendência transitória de erro permanente e mostrar o estado por lavagem.
3. Impedir duplicação local por serviço/tipo e travar no primeiro toque.
4. Limpar ação pendente quando a câmera for cancelada.
5. Colocar ações de exceção abaixo/afastadas da principal.

### P1 — antes de ampliar equipe/blocos

1. Recolher ferramentas administrativas/ocasionais em `Mais opções`.
2. Enfileirar `não feito` e pedido de material.
3. Trocar “registros esperando” por lavagens e nomes compreensíveis.
4. Consolidar/remover componentes de campo não utilizados.
5. Substituir `alert/confirm/prompt` por componentes consistentes e acessíveis.

### P2 — evolução

1. Foto principal adaptativa e galeria secundária.
2. Modo de alto contraste para sol forte.
3. Telemetria respeitosa de tempo/taxa de erro, sem vigilância punitiva.
4. Testes automatizados de estados do cartão, offline e acessibilidade.

## 9. Contraprovas práticas obrigatórias

Executar com a pessoa que realmente fará a lavagem, no celular real. Não orientar durante
o teste; observar e perguntar depois.

| Teste | Procedimento | Critério de aprovação |
|---|---|---|
| T1 — primeiro jazigo | Abrir o app no portão e pedir “comece o próximo” | Encontra a ação em até 10 s, sem ajuda |
| T2 — sol/luva | Brilho automático, sol e luva usada no trabalho | Acerta os alvos na primeira tentativa |
| T3 — offline completo | Modo avião antes de abrir; iniciar e concluir dois jazigos | Reabre sem rede e preserva estado/fotos |
| T4 — retorno parcial | Rede instável durante sincronização | Distingue guardado, enviado e erro sem linguagem técnica |
| T5 — câmera cancelada | Cancelar antes/depois e tentar novamente | Nenhuma ação errada, travada ou duplicada |
| T6 — toque duplo | Tocar rapidamente duas vezes | Uma câmera e um registro local |
| T7 — não feito offline | Sem rede, escolher “não achei” | Fica guardado e sai da rota corretamente |
| T8 — rota longa | 20 jazigos com três fotos/avisos | Próximo cartão é localizado sem rolagem excessiva |
| T9 — jazigos parecidos | Dois vizinhos/famílias de nomes semelhantes | Confirma o correto antes da foto inicial |
| T10 — memória cheia | Simular falha do IndexedDB/quota | Não afirma que salvou; oferece ação clara |
| T11 — sessão expirada | Expirar token ao sincronizar | Mostra “entre novamente”, preserva dados locais |
| T12 — fechar dia | Misturar enviados, offline e não feitos | Resumo compreendido e nenhuma perda |

Registrar para cada tarefa: sucesso sem ajuda, tempo, toques errados, retorno para tela
anterior, frase dita espontaneamente e confiança de 1 a 5. Aprovar o piloto somente se:

- 100% das lavagens ficarem preservadas;
- pelo menos 90% das tarefas principais forem concluídas sem ajuda;
- mediana para encontrar a próxima ação for menor que 10 segundos;
- não houver toque acidental em “não deu” ou “encerrar dia”;
- a operadora explicar corretamente a diferença entre guardado e enviado.

## 10. Conclusão

O produto já reduziu um fluxo antigo de várias telas para duas decisões claras, o que é
um avanço real. A contraprova mostra, porém, que a simplicidade está concentrada dentro da
ação fotográfica e não na jornada inteira. A tela deve priorizar a rota, esconder funções
ocasionais e representar honestamente o ciclo offline.

O objetivo não deve ser “ter muitos recursos fáceis”, mas **fazer a próxima lavagem sem
pensar no aplicativo**. Depois dos P0, o teste presencial acima decide o go-live; comentários
no código e inspeção visual, sozinhos, não comprovam usabilidade.
