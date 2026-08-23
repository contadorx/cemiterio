import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTEGIDAS = ["/campo", "/painel"];

/**
 * TELAS DESLIGADAS — escondidas, não apagadas.
 *
 * O sistema nasceu como um mini-ERP: CRM de leads, agente de IA no WhatsApp,
 * campanhas, mapa com pinos, plaquetas QR, portal da família. Para uma
 * operação de duas pessoas, isso é superfície demais: tela para manter, bug
 * para caçar e caminho para se perder.
 *
 * Estas rotas devolvem 404. O CÓDIGO CONTINUA NO REPOSITÓRIO e OS DADOS
 * CONTINUAM NO BANCO — nenhuma tabela foi apagada. Se um dia o negócio
 * crescer e o CRM fizer falta, religar é tirar a linha desta lista.
 *
 * Por que 404 e não só sumir do menu: link antigo, favorito no celular e
 * histórico do navegador continuam funcionando. Meio-desligado é pior que
 * ligado, porque ninguém sabe o que está no ar.
 */
const DESLIGADAS = [
  // CRM e captação — a captação de vocês é indicação e plaquinha, não funil
  "/painel/leads",
  "/painel/reajustes",       // reajuste é uma conversa por WhatsApp, uma vez ao ano
  // Agente de IA — robô conversando com idoso quebra o que faz o cliente ficar
  "/painel/agente",
  "/painel/atendimento",
  // ATENÇÃO: "/painel/conversas" NÃO entra mais nesta lista.
  //
  // Ela estava aqui desde que o CRM foi desligado, e o endereço passou a ser
  // a tela de CONVERSAS — liberação, conversas de WhatsApp e contatos do site,
  // que é para onde o menu aponta agora. Com a linha de pé, o middleware
  // devolvia 404 antes de a página existir: a tela subiu funcionando e o
  // usuário via "HTTP ERROR 404".
  //
  // Foi uma tela nova aterrissando num endereço com placa de "desligado". A
  // lição fica: esta lista casa por `startsWith`, então ela desliga o endereço
  // e TUDO abaixo dele — inclusive uma tela que ainda vai nascer ali.
  //
  // O que continua desligado é o CRM em si: /painel/leads, /painel/agente e
  // /painel/atendimento. A aba de conversas usa o módulo antigo por dentro,
  // mas sem leads, sem rascunho automático e sem robô.
  // ATENÇÃO: /painel/whatsapp NÃO entra nesta lista.
  // Ela foi desligada junto com o agente de IA, mas é a única tela onde se
  // reconecta a instância da Evolution — e a Evolution voltou a ser essencial:
  // é ela que entrega as FOTOS do antes e depois quando a Sureya aprova na
  // fila. Sem esta tela, um WhatsApp caído vira um beco sem saída.
  // Substituídos pela plaquinha física e pelo endereço
  "/painel/mapa",
  "/painel/plaquetas",
  // ATENÇÃO: "/painel/jazigos" NÃO entra nesta lista.
  // Eu a desliguei achando que duplicava a ficha da família. Não duplica: é a
  // ÚNICA tela onde se edita um jazigo que ainda não tem família — e os 71
  // cadastrados no campo estão exatamente nesse estado. Sem ela, corrigir a
  // rua de um jazigo órfão era impossível.
  "/painel/planos",
  // ATENÇÃO: "/familia" e "/t/" NÃO entram nesta lista.
  // O portal voltou a ter função: mostra o ANTES E O DEPOIS de cada limpeza
  // por link sem senha (idoso não guarda senha), e tira peso da Sureya —
  // quem quiser conferir, confere sozinho. O "/t/" resolve o token do portal.
  "/avaliar",
  "/indicar",
];

export async function middleware(req: NextRequest) {
  // A home virou o site publico do Zelo & Memoria. Sem esta saida antecipada,
  // TODA visita de familia dispararia uma checagem de sessao no Supabase antes
  // de a pagina aparecer: ida e volta de rede pura, num visitante que nunca vai
  // ter login. So /painel e /campo precisam saber quem esta logado.
  // Corta antes de qualquer checagem de sessão: rota desligada não precisa
  // saber quem está logado para responder 404.
  if (DESLIGADAS.some((d) => req.nextUrl.pathname.startsWith(d))) {
    return new NextResponse(null, { status: 404 });
  }

  if (!PROTEGIDAS.some((p) => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request: req });
  }

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const precisaLogin = PROTEGIDAS.some((p) => path.startsWith(p));

  if (precisaLogin && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redir", path);
    return NextResponse.redirect(url);
  }

  // G1: papel 'campo' não acessa o painel do dono
  if (user && path.startsWith("/painel")) {
    // filtrar por user_id e obrigatorio: sem isso o limit(1) pode trazer a linha
    // da ajudante e chutar o dono do painel para /campo.
    const { data: membro } = await supabase
      .from("membros")
      .select("papel")
      .eq("user_id", user.id)
      .maybeSingle();
    if ((membro as any)?.papel === "campo") {
      const url = req.nextUrl.clone();
      url.pathname = "/campo";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
