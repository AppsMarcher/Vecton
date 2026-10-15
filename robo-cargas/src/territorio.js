// Resolve o territorio (REGIONAL_MARCHER) a partir de Cidade + UF do cliente.
// Reproduz a formula da coluna "territorio" do Painel_Vecton.xlsm:
//   1) vendedor 000274 -> "GO_MG NORTE"; 000590 -> "GO_MG SUL"
//   2) nome do municipio igual (sem diferenciar maiusculas) + UF
//   3) senao, municipio que COMECA com o texto da cidade (A1_MUN truncado) + UF, na ordem do cadastro
//   4) senao, nao encontrado (retorna "")
const FIXOS_POR_VENDEDOR = { "000274": "GO_MG NORTE", "000590": "GO_MG SUL" };

const chave = (s) => String(s ?? "").trim().toLocaleLowerCase("pt-BR");

export function criarResolvedor(regioes) {
  const exato = new Map();
  const porUf = new Map();
  for (const r of regioes) {
    const uf = chave(r.uf);
    const mun = chave(r.municipio);
    const k = `${mun}|${uf}`;
    if (!exato.has(k)) exato.set(k, r.regional);
    if (!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf).push({ mun, regional: r.regional });
  }
  return function resolver({ cidade, uf, vend }) {
    const fixo = FIXOS_POR_VENDEDOR[String(vend ?? "").trim()];
    if (fixo) return fixo;
    const c = chave(cidade);
    const u = chave(uf);
    if (!c || !u) return "";
    const hit = exato.get(`${c}|${u}`);
    if (hit) return hit;
    const lista = porUf.get(u) || [];
    const parcial = lista.find((m) => m.mun.startsWith(c));
    return parcial ? parcial.regional : "";
  };
}
