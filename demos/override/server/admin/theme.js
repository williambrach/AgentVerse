// Light/dark theme for the admin pages. Classic script, loaded in <head> before the stylesheets.
(function () {
  var KEY = 'override.admin.theme';
  var root = document.documentElement;
  var theme = 'dark';
  try { if (localStorage.getItem(KEY) === 'light') theme = 'light'; } catch (e) {}
  root.dataset.theme = theme;
  function label(btn) {
    var light = root.dataset.theme === 'light';
    btn.textContent = light ? 'Dark mode' : 'Light mode';
    btn.setAttribute('aria-pressed', light ? 'true' : 'false');
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    label(btn);
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
      label(btn);
    });
  });
})();
