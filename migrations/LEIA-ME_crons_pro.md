# Crons no plano Pro — 18/07/2026

| Cron | Horário | O que faz | Duração |
|---|---|---|---|
| `/api/cron/minuto` | a cada minuto | consolida rajadas de mensagem + reprocessa envios que falharam | 60s |
| `/api/cron/diario` | 09:00 UTC (6h BRT) | gera e distribui a agenda + rascunhos de cobrança, saldo baixo e datas de memória | 300s |
| `/api/cron/convites` | 13:00 UTC (10h BRT) | régua de ativação: convites de data e periódicos | 300s |
| `/api/cron/perfis` | 06:00 UTC (3h BRT) | destilação dos perfis da IA (chama o modelo, é a mais lenta) | 300s |

## Por que separado
Antes tudo rodava dentro do cron diário. Com 59 famílias, uma falha no meio
derrubava o resto. Agora cada rotina é independente e registra o próprio erro
em `erros_log` (visível em Config > Diagnóstico).

## ATENÇÃO: escopo do plano Pro
O plano Pro da Vercel vale por **escopo** (conta pessoal ou time), não por projeto.
O time "ContadorX's projects" tem bpox-app, financeiro-simples-app e bpox-demo.
O projeto do cemitério **não está nesse time** — está na conta pessoal.

Se o Pro foi assinado no TIME, o cemitério continua no Hobby e o cron por minuto
não vai rodar. Duas saídas:
1. Mover o projeto do cemitério para o time (Vercel > projeto > Settings > transferir), ou
2. Confirmar que o Pro foi assinado na conta pessoal.

Como conferir: Vercel > Settings > Cron Jobs do projeto do cemitério.
Se os 4 crons aparecerem, está tudo certo. Se der erro de limite, é escopo errado.
