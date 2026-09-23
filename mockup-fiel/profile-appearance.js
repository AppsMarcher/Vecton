/* Experiência de aparência no protótipo; não altera o perfil no servidor. */
(() => {
  const dialog = document.querySelector('#profile-dialog');
  const form = document.querySelector('#profile-form');
  const section = document.createElement('section');
  section.className = 'profile-appearance';
  section.innerHTML = `<div><strong id="appearance-label">Aparência</strong><span id="appearance-help">Escolha como você prefere visualizar o Vecton.</span></div>
    <label class="appearance-choice"><span>Dark</span><input id="profile-appearance" type="checkbox" role="switch" aria-label="Tema claro" aria-describedby="appearance-help"><span class="appearance-track" aria-hidden="true"></span><span>Claro</span></label>`;
  form.querySelector('.profile-dialog-access-section').before(section);
  const control = section.querySelector('input');
  const root = document.documentElement;
  let original = root.dataset.vectonTheme;
  let opened = false;
  const current = () => root.dataset.vectonTheme;
  const sync = () => { control.checked = current() === 'clear'; };
  control.addEventListener('change', () => window.VECTON_ORIGINAL_PREVIEW.theme(control.checked ? 'clear' : 'dark'));
  // Captura antes do handler original, que salva e fecha o perfil.
  form.addEventListener('submit', () => { original = current(); }, true);
  new MutationObserver(() => {
    if (dialog.open && !opened) { original = current(); sync(); }
    if (!dialog.open && opened) window.VECTON_ORIGINAL_PREVIEW.theme(original);
    opened = dialog.open;
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-vecton-theme'] });
  sync();
})();
