(function (global) {
  'use strict';
  function parseFormula(text) {
    const source = String(text || '').replace(/\s/g, '');
    if (source.length > 4000) throw Error('Fórmula muito longa');
    const tokens = String(text || '').match(/<[A-Za-z0-9_]+>|\d+(?:\.\d+)?|[()+*/-]/g) || [];
    if (!tokens.length || tokens.join('') !== source) throw Error('Sintaxe de fórmula inválida');
    let pos = 0;
    function atom() {
      const token = tokens[pos++];
      if (token === '(') { const expr = sum(); if (tokens[pos++] !== ')') throw Error('Parênteses incompletos'); return expr; }
      if (token === '+' || token === '-') return { op: 'unary', sign: token, value: atom() };
      if (token?.startsWith('<')) return { ref: token.slice(1, -1) };
      if (token && /^\d/.test(token)) return { number: Number(token) };
      throw Error('Expressão incompleta');
    }
    function product() { let expr = atom(); while (['*', '/'].includes(tokens[pos])) expr = { op: tokens[pos++], left: expr, right: atom() }; return expr; }
    function sum() { let expr = product(); while (['+', '-'].includes(tokens[pos])) expr = { op: tokens[pos++], left: expr, right: product() }; return expr; }
    const ast = sum(); if (pos !== tokens.length) throw Error('Operador ausente'); return ast;
  }
  function references(ast) { if (ast.ref) return [ast.ref]; return [...(ast.left ? references(ast.left) : []), ...(ast.right ? references(ast.right) : []), ...(ast.value ? references(ast.value) : [])]; }
  function evaluate(ast, lookup) {
    if ('number' in ast) return ast.number;
    if (ast.ref) return lookup(ast.ref);
    if (ast.op === 'unary') return (ast.sign === '-' ? -1 : 1) * evaluate(ast.value, lookup);
    const a = evaluate(ast.left, lookup), b = evaluate(ast.right, lookup);
    if (ast.op === '/' && b === 0) throw Error('Divisão por zero');
    const result = ast.op === '+' ? a + b : ast.op === '-' ? a - b : ast.op === '*' ? a * b : a / b;
    if (!Number.isFinite(result)) throw Error('Resultado não finito'); return result;
  }
  function compile(lines) {
    const names = new Map(), asts = new Map(), order = [], visited = new Set();
    for (const line of lines) {
      if (line.origin === 'label') continue;
      if (!Number.isInteger(Number(line.seq)) || Number(line.seq) < 1 || names.has(String(line.seq))) throw Error('Sequência da linha inválida ou repetida. Use um número inteiro positivo.');
      names.set(String(line.seq), line);
      if (line.origin === 'formula') asts.set(line.id, parseFormula(line.formula_text));
    }
    function visit(line, path) {
      if (path.has(line.id)) throw Error('Referência circular');
      if (visited.has(line.id)) return;
      const next = new Set([...path, line.id]);
      for (const ref of asts.has(line.id) ? references(asts.get(line.id)) : []) {
        if (!names.has(ref)) throw Error('Referência inexistente: ' + ref);
        visit(names.get(ref), next);
      }
      visited.add(line.id); order.push(line);
    }
    lines.filter(l => l.origin !== 'label').forEach(l => visit(l, new Set()));
    return input => {
      const values = new Map();
      for (const line of order) values.set(String(line.seq), line.origin === 'input' ? Number(input(line) || 0) : evaluate(asts.get(line.id), ref => values.get(ref)));
      return Object.fromEntries(lines.map(l => [l.id, l.origin === 'label' ? null : values.get(String(l.seq))]));
    };
  }
  function parseAmount(raw) {
    let text = String(raw ?? '').trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
    if (!text) return 0;
    // A comma selects Brazilian notation; a single dot is decimal notation.
    if (text.includes(',')) { if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) throw Error('Número inválido'); text = text.replace(/\./g, '').replace(',', '.'); }
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw Error('Use no máximo duas casas decimais');
    const value = Number(text); if (!Number.isSafeInteger(Math.round(value * 100))) throw Error('Valor fora do limite'); return Math.round(value * 100) / 100;
  }
  function distribute(amount, count) {
    if (!Number.isInteger(count) || count < 1) throw Error('Nenhum mês editável');
    const cents = Math.round(amount * 100), base = Math.trunc(cents / count);
    return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - base * (count - 1) : base) / 100);
  }
  function sourcePayload(value) {
    if (value === 'forms') return { type: 'forms' };
    if (/^real:\d{4}$/.test(value)) return { type: 'real', year: Number(value.slice(5)) };
    if (value.startsWith('scenario:')) return { type: 'scenario', scenario_id: value.slice(9) };
    throw Error('Fonte inválida');
  }
  global.VECTON_PLANNING_CORE = { parseFormula, references, evaluate, compile, parseAmount, distribute, sourcePayload };
})(window);
