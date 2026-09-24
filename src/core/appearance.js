/* Preferência local por usuário. Dark permanece o padrão. */
(function (window) {
  let userId = null;
  let saved = 'dark';
  const normalize = value => value === 'clear' ? 'clear' : 'dark';
  const key = () => 'vecton.appearance.v1.' + userId;
  function apply(value) {
    const theme = normalize(value);
    document.documentElement.dataset.vectonTheme = theme;
    return theme;
  }
  function setUser(id) {
    userId = id || null;
    saved = 'dark';
    if (userId) { try { saved = normalize(window.localStorage.getItem(key())); } catch {} }
    apply(saved);
  }
  function save(value) {
    const next = normalize(value);
    if (!userId) return false;
    try { window.localStorage.setItem(key(), next); }
    catch { return false; }
    saved = next;
    apply(saved);
    return true;
  }
  window.VECTON_APPEARANCE = { setUser, preview: apply, save,
    restore: () => apply(saved), get: () => document.documentElement.dataset.vectonTheme || 'dark' };
  apply('dark');
})(window);
