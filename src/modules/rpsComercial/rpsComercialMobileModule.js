(function attachVectonRpsComercialMobileModule(window) {
  // RPS Comercial — versão mobile. Diferente do Painel de Vendas/A3
  // Estratégicos mobile (telas próprias reescritas do zero, só leitura),
  // aqui o pedido do usuário foi edição completa — texto, anexo (inclusive
  // foto tirada na hora) e comentário por anexo, igual ao desktop. Como a
  // tela do módulo desktop (rpsComercialModule.js) já é responsiva (testado
  // em 375px de largura: colunas empilham, alvos de toque grandes o
  // bastante, nada estoura a largura), reescrever seria duplicar ~1300
  // linhas de regra de negócio à toa. Este arquivo só reabre a MESMA
  // fábrica (createRpsComercialModule) apontando pro container que o shell
  // mobile fornece a cada mount() — mount/unmount é a interface que
  // mobileShellModule.js espera de todo módulo mobile (mesmo contrato do
  // Painel de Vendas/A3 mobile).
  function createRpsComercialMobileModule(deps) {
    let instance = null;

    function mount(container) {
      unmount();
      const factory = window.VECTON_RPS_COMERCIAL?.createRpsComercialModule;
      if (!factory) return;
      instance = factory({ ...deps, root: container });
      instance.render();
    }

    function unmount() {
      if (!instance) return;
      instance.destroy();
      instance = null;
    }

    return { mount, unmount };
  }

  window.VECTON_RPS_COMERCIAL_MOBILE = { createRpsComercialMobileModule };
})(window);
