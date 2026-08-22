// Captura de GPS pensada para o cemitério: em vez de aceitar a primeira leitura
// (que costuma vir de rede/wifi, com 50-100m de erro), acompanha o sinal por
// alguns segundos e fica com a MELHOR amostra.

export interface Leitura {
  lat: number;
  lng: number;
  precisao: number; // metros
}

export interface OpcoesGps {
  alvoMetros?: number;   // para assim que atingir esta precisão
  timeoutMs?: number;    // tempo máximo de espera
  aoProgredir?: (precisao: number) => void;
}

// Retorna a melhor leitura obtida na janela, ou null se não conseguiu nenhuma.
export function capturarGps(opts: OpcoesGps = {}): Promise<Leitura | null> {
  const alvo = opts.alvoMetros ?? 8;
  const timeout = opts.timeoutMs ?? 12000;

  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);

    let melhor: Leitura | null = null;
    let encerrado = false;

    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      resolve(melhor);
    };

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p = pos.coords.accuracy ?? 9999;
        const leitura: Leitura = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: Math.round(p * 10) / 10,
        };
        if (!melhor || leitura.precisao < melhor.precisao) {
          melhor = leitura;
          opts.aoProgredir?.(leitura.precisao);
        }
        if (melhor.precisao <= alvo) encerrar(); // já está bom o bastante
      },
      () => {
        /* erro/permissão negada: encerra com o que tiver */
        encerrar();
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );

    const timer = setTimeout(encerrar, timeout);
  });
}

// Texto amigável sobre a qualidade da leitura.
export function qualidade(precisao: number): { rotulo: string; cor: string; serve: boolean } {
  if (precisao <= 8) return { rotulo: "ótima", cor: "#16a34a", serve: true };
  if (precisao <= 15) return { rotulo: "boa", cor: "#0f766e", serve: true };
  if (precisao <= 30) return { rotulo: "razoável", cor: "#d97706", serve: true };
  return { rotulo: "fraca — chegue mais perto e tente de novo", cor: "#dc2626", serve: false };
}
