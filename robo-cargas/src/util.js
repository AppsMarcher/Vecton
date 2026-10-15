import { createHash } from "node:crypto";

// Data/hora "de parede" no fuso configurado.
export function agora(tz, instante = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(instante).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return { ano: +parts.year, mes: +parts.month, dia: +parts.day, hhmm: `${parts.hour}:${parts.minute}`, data: `${parts.year}-${parts.month}-${parts.day}` };
}

// Meses a processar: do mes corrente - atras ate o mes corrente + frente.
export function janelaMeses({ ano, mes }, atras = 0, frente = 0) {
  const out = [];
  for (let d = -atras; d <= frente; d += 1) {
    const idx = ano * 12 + (mes - 1) + d;
    out.push({ ano: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  }
  return out;
}

export function intervaloMes({ ano, mes }) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const p2 = (n) => String(n).padStart(2, "0");
  return { ini: `${ano}${p2(mes)}01`, fim: `${ano}${p2(mes)}${p2(ultimo)}` };
}

export const sha256 = (txt) => createHash("sha256").update(txt).digest("hex");

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const round = (v, casas = 2) => (v == null ? null : Math.round((Number(v) + Number.EPSILON) * 10 ** casas) / 10 ** casas);
