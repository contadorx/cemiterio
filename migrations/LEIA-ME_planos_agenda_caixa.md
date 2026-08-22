# Planos, agenda e caixa de entrada — 18/07/2026

## Onde ficam os planos e valores (você perguntou duas vezes)
Criei uma tela dedicada: **menu → Planos**. Estava escondido dentro da ficha do
cliente, e isso foi erro meu de organização.

Cada linha é um jazigo. Mostra família, jazigo, quadra/rua, periodicidade, valor
mensal, valor do ciclo, **pago até**, **próxima lavagem** e **próxima cobrança**.
Clique em Editar e ajusta tudo na própria linha, sem sair da tela.

Filtros que importam para a migração:
- **Falta data de lavagem ou cobrança** — os que travam o início da operação
- **Ainda não conferidos** — quanto da carteira já passou por você
- **Com pagamento vencido**
- Ordem da rota, próxima lavagem, próxima cobrança, maior valor

A borda colorida diz o estado: laranja = falta data · vermelha = vencido ·
cinza = inativo.

## Caixa de entrada única
O que a Nina escreve no app de campo virava só "ocorrência", escondida em
Config. Agora vira **conversa na mesma tela das famílias**, com fundo verde,
📌 no nome e **sempre fixada no topo** — quem está no campo agora pode estar
esperando resposta. Não pode ser arquivada nem excluída.

## Agenda
**Filtros de período**: Amanhã · 3 · 7 · 14 · 30 · 90 dias, ou um período com
data inicial e final próprias.

**Geração**: botões de 30/60/90 dias **e geração de um mês inteiro** (seletor de
mês). Com a opção **"Incluir os avulsos neste mês"** + data — é assim que se
prepara o Finados: marca 30/10 e os esporádicos entram na agenda.

## Localização e foto: quem manda é o cadastro
- **Admin/cadastro**: define a posição e envia as fotos de referência
  (ficha do cliente → jazigo → Editar).
- **Nina**: a leitura de GPS dela **entra na média** e refina o ponto, mas não
  sobrescreve o oficial. Se o jazigo ainda não tem posição, a primeira leitura
  dela vira o ponto inicial.

## Confirmação do jazigo pelo QR
Componente `ConfirmarJazigo`: a Nina aponta a câmera para a plaqueta e o sistema
confere se é o jazigo certo. Se o QR for de outro jazigo, avisa.
**Ela pode seguir sem** — a plaqueta pode ter caído, sujado ou não existir ainda.
Nesse caso mostra a foto de referência para conferência visual.

## Marca
"Sureya" saiu do topo do menu e da home. Agora é **Zelo & Memória** com a
assinatura "Por Dona Nadir · Desde 1990" logo abaixo.
