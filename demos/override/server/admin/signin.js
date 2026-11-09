// Password sign-in for the admin pages. The session is an HttpOnly cookie the browser sends by itself:
// nothing is stored in the page. Text goes in through textContent only.
const WRONG = 'Wrong password.';
const THROTTLED = 'Too many attempts. Try again in a minute.';

export async function mountSignIn(doc, { fetch: fetchFn = (...a) => globalThis.fetch(...a), onSignedIn } = {}) {
  const $ = (id) => doc.getElementById(id);
  const form = $('auth');
  const input = $('password');
  const errorEl = $('auth-error');
  const outBtn = $('signout');
  let signedIn = false;

  const show = (message = '') => {
    signedIn = false;
    form.hidden = false;
    if (outBtn) outBtn.hidden = true;
    if (errorEl) errorEl.textContent = message;
  };
  const enter = async () => {
    if (signedIn) return;
    signedIn = true;
    form.hidden = true;
    if (errorEl) errorEl.textContent = '';
    if (outBtn) outBtn.hidden = false;
    await onSignedIn();
  };

  async function signOut() {
    try { await fetchFn('/admin/logout', { method: 'POST' }); } catch { /* the reload shows the form anyway */ }
    (doc.defaultView?.location ?? doc.location).reload();
  }

  async function submit(event) {
    event?.preventDefault?.();
    let res;
    try {
      res = await fetchFn('/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
    } catch { show('Could not reach the server.'); return; }
    if (res.status === 204) { input.value = ''; await enter(); return; }
    if (res.status === 429) { show(THROTTLED); return; }
    show(WRONG);
  }

  form.addEventListener('submit', submit);
  const click = $('signin');
  if (click && click !== form) click.addEventListener('click', submit);
  if (outBtn) outBtn.addEventListener('click', signOut);

  let ok = false;
  try { ok = (await fetchFn('/admin/session')).status === 200; } catch { /* treated as signed out */ }
  if (ok) await enter(); else show();
  return { signOut, show };
}
