// subscribe.js — Self-contained subscribe FAB + modal for all pages
// Injects CSS, HTML, and handles form submission via hidden EmailOctopus embed
(function () {
  if (document.getElementById('subscribeFab')) return; // already loaded (e.g. home.html)

  var PERSONAL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|mac|mail|proton|protonmail|zoho|yandex|gmx|fastmail|tutanota|hey|pm|cock|airmail|inbox|rocketmail|rediffmail|mailinator|guerrillamail|tempmail|throwaway|10minutemail|sharklasers|guerrillamailblock|grr|dispostable)\./i;

  // --- Inject CSS ---
  var css = document.createElement('style');
  css.textContent =
    '.subscribe-fab{position:fixed;bottom:1.5rem;right:1.5rem;z-index:900;display:flex;align-items:center;gap:.5rem;padding:.65rem 1.1rem;border-radius:99px;background:#00ed64;color:#001E2B;border:none;font-family:system-ui,-apple-system,sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;box-shadow:0 4px 24px rgba(0,237,100,0.25);transition:all .2s}' +
    '.subscribe-fab:hover{transform:translateY(-2px);box-shadow:0 6px 32px rgba(0,237,100,0.35)}' +
    '.subscribe-fab.hidden{display:none}' +
    '.sfab-modal{position:fixed;bottom:5rem;right:1.5rem;z-index:901;width:340px;max-width:calc(100vw - 2rem);background:#003345;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:1.5rem;box-shadow:0 16px 48px rgba(0,0,0,0.5);opacity:0;pointer-events:none;transform:translateY(12px) scale(0.96);transition:all .25s cubic-bezier(0.16,1,0.3,1)}' +
    '.sfab-modal.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}' +
    '.sfab-close{position:absolute;top:.75rem;right:.75rem;background:none;border:none;color:#7fa8bc;font-size:1.4rem;cursor:pointer;line-height:1;padding:.25rem}' +
    '.sfab-close:hover{color:#fafafa}' +
    '.sfab-title{font-size:1.05rem;font-weight:700;color:#fafafa;margin:0 0 .3rem}' +
    '.sfab-desc{font-size:.78rem;color:#7fa8bc;line-height:1.45;margin:0 0 .85rem}' +
    '.sfab-form{display:flex;flex-direction:column;gap:.5rem}' +
    '.sfab-form input{width:100%;padding:.55rem .75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:#002838;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;font-size:.82rem;outline:none;box-sizing:border-box;transition:border-color .2s}' +
    '.sfab-form input:focus{border-color:#00ed64}' +
    '.sfab-form button[type=submit]{width:100%;padding:.6rem;border:none;border-radius:8px;background:#00ed64;color:#001E2B;font-family:system-ui,-apple-system,sans-serif;font-weight:600;font-size:.85rem;cursor:pointer;transition:all .2s;margin-top:.15rem}' +
    '.sfab-form button[type=submit]:hover{background:#00c853}' +
    '.sfab-form button[type=submit]:disabled{opacity:.5;cursor:not-allowed}' +
    '.sfab-ok{text-align:center;padding:1rem 0;display:none}' +
    '@media(max-width:500px){.sfab-modal{bottom:4.5rem;right:.75rem;left:.75rem;width:auto}.subscribe-fab{bottom:1rem;right:1rem}}';
  document.head.appendChild(css);

  // --- Inject HTML ---
  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    '<div id="eoHiddenSub" style="position:absolute;left:-9999px;height:0;overflow:hidden;pointer-events:none" aria-hidden="true"></div>' +
    '<button class="subscribe-fab" id="subscribeFab" title="Subscribe for updates">' +
      '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>' +
      '<span>Get Notified</span>' +
    '</button>' +
    '<div class="sfab-modal" id="sfabModal">' +
      '<button class="sfab-close" id="sfabClose">&times;</button>' +
      '<p class="sfab-title">Join the MongoDB Community</p>' +
      '<p class="sfab-desc">Don\'t miss out on technical deep-dives, demos and further content.</p>' +
      '<form class="sfab-form" id="sfabForm">' +
        '<input type="email" id="sfabEmail" placeholder="you@company.com" required autocomplete="email">' +
        '<button type="submit" id="sfabBtn">Notify me</button>' +
        '<a href="https://emailoctopus.com" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin-top:.5rem;font-size:.65rem;color:#7fa8bc;opacity:.5;text-decoration:none">Powered by EmailOctopus</a>' +
      '</form>' +
      '<div class="sfab-ok" id="sfabOk">' +
        '<svg width="32" height="32" fill="none" stroke="#00ed64" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
        '<p style="margin-top:.5rem;font-weight:600;color:#fafafa">You\'re subscribed!</p>' +
        '<p style="font-size:.78rem;color:#7fa8bc;margin-top:.25rem">We\'ll email you when there\'s something new.</p>' +
      '</div>' +
    '</div>';

  while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);

  // Load EO embed script dynamically
  var eoScript = document.createElement('script');
  eoScript.async = true;
  eoScript.src = 'https://eocampaign1.com/form/a1be7298-21da-11f1-91f4-271ecaf1fe8d.js';
  eoScript.setAttribute('data-form', 'a1be7298-21da-11f1-91f4-271ecaf1fe8d');
  document.getElementById('eoHiddenSub').appendChild(eoScript);

  // --- Logic ---
  var fab = document.getElementById('subscribeFab');
  var modal = document.getElementById('sfabModal');
  var closeBtn = document.getElementById('sfabClose');
  var form = document.getElementById('sfabForm');
  var btn = document.getElementById('sfabBtn');
  var ok = document.getElementById('sfabOk');

  if (localStorage.getItem('subscribed') === '1') fab.classList.add('hidden');

  fab.addEventListener('click', function () { modal.classList.toggle('open'); });
  closeBtn.addEventListener('click', function () { modal.classList.remove('open'); });
  document.addEventListener('click', function (e) {
    if (!modal.contains(e.target) && !fab.contains(e.target)) modal.classList.remove('open');
  });

  function eoSubmit(email, onOk, onErr) {
    var tries = 0;
    function go() {
      var f = document.querySelector('#eoHiddenSub form.emailoctopus-form');
      var inp = f && f.querySelector('input[type="email"]');
      if (!f || !inp) { if (++tries < 20) return setTimeout(go, 300); return onErr(); }
      var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      s.call(inp, email);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      var obs = new MutationObserver(function () {
        var sm = f.closest('[data-form]').querySelector('.emailoctopus-success-message');
        var em = f.closest('[data-form]').querySelector('.emailoctopus-error-message');
        if (sm && sm.textContent.trim()) { obs.disconnect(); onOk(); }
        else if (em && em.textContent.trim()) { obs.disconnect(); onErr(); }
      });
      obs.observe(f.closest('[data-form]'), { childList: true, subtree: true, characterData: true });
      f.querySelector('[type="submit"]').click();
      setTimeout(function () { obs.disconnect(); onErr(); }, 8000);
    }
    go();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('sfabEmail').value.trim();
    if (!email) return;
    var d = email.split('@')[1];
    if (!d || PERSONAL.test(d)) {
      var inp = document.getElementById('sfabEmail');
      inp.setCustomValidity('Please use your work email (e.g. you@company.com)');
      inp.reportValidity();
      inp.addEventListener('input', function once() { inp.setCustomValidity(''); inp.removeEventListener('input', once); });
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Subscribing...';
    eoSubmit(email, function () {
      form.style.display = 'none';
      ok.style.display = 'block';
      localStorage.setItem('subscribed', '1');
      setTimeout(function () { modal.classList.remove('open'); fab.classList.add('hidden'); }, 3000);
    }, function () {
      btn.disabled = false;
      btn.textContent = 'Try again';
    });
  });
})();
