# Implementação paralela do tema claro

Branch: codex/tema-claro. Worktree separado; main continua entregando Dark.

## Primeira etapa
- Serviço de aparência independente, Dark padrão.
- Chave no perfil com prévia, Salvar e Cancelar.
- Preferência local por ID do usuário; logout retorna ao Dark.
- Tokens claros e estilos explícitos para shell e perfil.
- Nenhuma alteração de API, dados, cálculos ou renderizadores.

## Ainda necessário antes da liberação
- Migrar cores fixas dos dashboards, SVGs, relatórios, menus e módulos dinâmicos para tokens explícitos.
- Validar todos os estados, mobile, impressão e exportação com dados reais.
- Definir sincronização entre dispositivos caso desejada; atualmente a escolha é por navegador.
- Atualizar cache PWA e liberar inicialmente em homologação.

## Trabalhar em paralelo
Manter commits pequenos por módulo. Incorporar main frequentemente nesta branch, resolvendo conflitos aqui. Novas funcionalidades usam os mesmos renderizadores e tokens; não criar versões duplicadas Dark/Claro. Validar ambos os temas antes de integrar. Não publicar esta etapa incompleta em produção.
