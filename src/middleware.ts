import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTEGIDAS = ["/campo", "/painel"];

export async function middleware(req: NextRequest) {
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
    const { data: membro } = await supabase.from("membros").select("papel").limit(1).maybeSingle();
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
