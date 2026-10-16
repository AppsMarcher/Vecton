// Agrupa as linhas reprovadas na validacao do Vecton para o log e o e-mail de erro.
// Varias linhas costumam reprovar pelo mesmo motivo (ex.: uma conta nao cadastrada em 40 lancamentos):
// agrupa por "descricao + erros", conta as ocorrencias e devolve os primeiros grupos.
//
// descrever(linha) -> texto curto que identifica a linha (ex.: "conta 31101001 · CC 1234 · filial 01").
export function agruparErros(linhas, descrever, limite = 20) {
  const grupos = new Map();
  for (const l of linhas) {
    const resumo = descrever ? descrever(l) : `linha ${l.row_number}`;
    const erros = Array.isArray(l.validation_errors) ? l.validation_errors : [];
    const chave = `${resumo}|${erros.join(";")}`;
    const g = grupos.get(chave);
    if (g) { g.ocorrencias += 1; continue; }
    grupos.set(chave, { ...l, resumo, ocorrencias: 1 });
  }
  return [...grupos.values()].slice(0, limite);
}
