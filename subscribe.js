// subscribe.js — Lead gate + Email Octopus (hidden embed only).
// Submit is optimistic: local save, dismiss UI; EO sync retries in background.
// leadGateSyncPending / leadGatePendingLead drive retries on later page loads.
(function () {
  var EO_FORM_ID = 'a1be7298-21da-11f1-91f4-271ecaf1fe8d';
  var path = (location.pathname || '').replace(/\\/g, '/').toLowerCase();

  function subscribeScriptBase() {
    var cur = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
    if (cur) {
      var i = cur.lastIndexOf('/');
      if (i !== -1) return cur.slice(0, i + 1);
    }
    return '';
  }
  var leafImgSrc = subscribeScriptBase() + 'assets/mongodb-leaf.png';
  function htmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  var moChrome = null;
  var ivChrome = null;
  var ivChromeTick = 0;

  function isNoPopupPage(p) {
    return (
      p.endsWith('home.html') ||
      p.endsWith('changelog.html') ||
      p.endsWith('/readme/readme.html') ||
      p.endsWith('readme/readme.html') ||
      p.endsWith('performance_visualization.html') ||
      p.endsWith('performance_visualizer.html')
    );
  }

  function clearSyncPending() {
    localStorage.removeItem('leadGateSyncPending');
    localStorage.removeItem('leadGatePendingLead');
  }

  function markSyncPending(lead) {
    localStorage.setItem('leadGateSyncPending', '1');
    localStorage.setItem('leadGatePendingLead', JSON.stringify(lead));
  }

  function inSubscribeShell(el) {
    return !!(el && (el.closest('#eoHiddenSub') || el.closest('#sfabOverlay')));
  }

  function hideEl(el) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function hideFloatingSignupChrome() {
    document.querySelectorAll('[data-form="' + EO_FORM_ID + '"], form.emailoctopus-form').forEach(function (el) {
      if (!inSubscribeShell(el)) hideEl(el);
    });
    document.querySelectorAll('button, a[href], [role="button"]').forEach(function (el) {
      if (inSubscribeShell(el)) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/get\s+notified/i.test(t) && !/notify\s+me/i.test(t)) return;
      var pos = window.getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') hideEl(el);
    });
    document.querySelectorAll('body *').forEach(function (el) {
      if (inSubscribeShell(el)) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/get\s+notified/i.test(t) && !/notify\s+me/i.test(t)) return;
      if (t.length > 64) return;
      var cur = el;
      while (cur && cur !== document.body) {
        if (inSubscribeShell(cur)) return;
        var st = window.getComputedStyle(cur);
        var pos = st.position;
        if (pos === 'fixed' || pos === 'sticky') {
          cur.setAttribute('data-sfab-eo-launcher-hide', '1');
          hideEl(cur);
          return;
        }
        if (pos === 'absolute') {
          var br = cur.getBoundingClientRect();
          var nearCorner = br.bottom > window.innerHeight * 0.55 && br.right > window.innerWidth * 0.5;
          if (nearCorner && br.width < 420 && br.height < 120) {
            cur.setAttribute('data-sfab-eo-launcher-hide', '1');
            hideEl(cur);
            return;
          }
        }
        cur = cur.parentElement;
      }
    });
  }

  function runChromeHides() {
    hideFloatingSignupChrome();
  }

  function startChromeGuard() {
    if (moChrome) return;
    runChromeHides();
    moChrome = new MutationObserver(function () {
      runChromeHides();
    });
    moChrome.observe(document.body, { childList: true, subtree: true });
    ivChromeTick = 0;
    ivChrome = setInterval(function () {
      runChromeHides();
      if (++ivChromeTick > 220) stopChromeGuard();
    }, 400);
  }

  function stopChromeGuard() {
    if (moChrome) {
      moChrome.disconnect();
      moChrome = null;
    }
    if (ivChrome) {
      clearInterval(ivChrome);
      ivChrome = null;
    }
  }

  function normBlob(inp) {
    return ((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.getAttribute('placeholder') || '')).toLowerCase().replace(/[\s_-]+/g, '');
  }

  function setInputValue(inp, val) {
    var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    s.call(inp, val);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillEoForm(f, data) {
    var candidates = [];
    f.querySelectorAll('input,select,textarea').forEach(function (inp) {
      var ty = (inp.type || '').toLowerCase();
      if (ty === 'hidden' || ty === 'submit' || ty === 'button') return;
      candidates.push(inp);
    });

    var emailInp = f.querySelector('input[type="email"]') || null;
    candidates.forEach(function (inp) {
      if (inp.type === 'email') emailInp = inp;
    });

    function pick(needles) {
      for (var i = 0; i < candidates.length; i++) {
        var b = normBlob(candidates[i]);
        for (var j = 0; j < needles.length; j++) {
          if (b.indexOf(needles[j].replace(/[\s_-]/g, '')) !== -1) return candidates[i];
        }
      }
      return null;
    }

    var fn = pick(['firstname', 'first', 'given']);
    var ln = pick(['lastname', 'last', 'surname', 'family']);
    var co = pick(['company', 'organization', 'organisation', 'org']);
    var po = pick(['position', 'jobtitle', 'title', 'role']);

    var texts = candidates.filter(function (inp) {
      var ty = (inp.type || 'text').toLowerCase();
      return ty !== 'email' && ty !== 'checkbox' && ty !== 'radio';
    });

    if (fn) setInputValue(fn, data.firstName);
    else if (texts[0]) setInputValue(texts[0], data.firstName);
    if (ln) setInputValue(ln, data.lastName);
    else if (texts[1]) setInputValue(texts[1], data.lastName);
    if (co) setInputValue(co, data.company);
    else if (texts[2]) setInputValue(texts[2], data.company);
    if (po) setInputValue(po, data.position);
    else if (texts[3]) setInputValue(texts[3], data.position);

    if (emailInp) setInputValue(emailInp, data.email);

    // EO form: one hidden field = page URL (not in `candidates` above).
    if (data.url) {
      var hiddens = f.querySelectorAll('input[type="hidden"]');
      if (hiddens.length === 1) {
        setInputValue(hiddens[0], data.url);
      } else if (hiddens.length > 1) {
        var urlNeedles = ['url', 'pageurl', 'page_url', 'landing', 'source', 'signupsource', 'website', 'webpage', 'page'];
        for (var hi = 0; hi < hiddens.length; hi++) {
          var inp = hiddens[hi];
          var b = normBlob(inp);
          for (var u = 0; u < urlNeedles.length; u++) {
            if (b.indexOf(urlNeedles[u].replace(/[\s_-]/g, '')) !== -1) {
              setInputValue(inp, data.url);
              return;
            }
          }
        }
      }
    }
  }

  function eoSubmit(data, onOk, onErr) {
    var tries = 0;
    function go() {
      var f = document.querySelector('#eoHiddenSub form.emailoctopus-form');
      if (!f) {
        if (++tries < 36) return setTimeout(go, 250);
        return onErr();
      }
      fillEoForm(f, data);
      var host = f.closest('[data-form]');
      if (!host) return onErr();
      var obs = new MutationObserver(function () {
        var sm = host.querySelector('.emailoctopus-success-message');
        var em = host.querySelector('.emailoctopus-error-message');
        if (sm && sm.textContent.trim()) {
          obs.disconnect();
          onOk();
        } else if (em && em.textContent.trim()) {
          obs.disconnect();
          onErr();
        }
      });
      obs.observe(host, { childList: true, subtree: true, characterData: true });
      var sub = f.querySelector('[type="submit"]');
      if (sub) sub.click();
      else f.dispatchEvent(new Event('submit', { bubbles: true }));
      setTimeout(function () {
        obs.disconnect();
        onErr();
      }, 12000);
    }
    go();
  }

  function eoSubmitWithRetries(lead) {
    var attempt = 0;
    var maxAttempts = 30;
    var delayMs = 4000;
    function again() {
      attempt++;
      eoSubmit(
        lead,
        function () {
          clearSyncPending();
          stopChromeGuard();
        },
        function () {
          if (attempt < maxAttempts) setTimeout(again, delayMs);
        }
      );
    }
    again();
  }

  function ensureEoHiddenWithScript(done) {
    var mount = document.getElementById('eoHiddenSub');
    if (mount) {
      if (mount.querySelector('form.emailoctopus-form')) {
        if (done) setTimeout(done, 200);
        return;
      }
      var old = mount.querySelector('script[data-form="' + EO_FORM_ID + '"]');
      if (old) {
        if (done) {
          var ran = false;
          function once() {
            if (ran) return;
            ran = true;
            setTimeout(done, 450);
          }
          old.addEventListener('load', once);
          setTimeout(once, 2200);
        }
        return;
      }
      var s2 = document.createElement('script');
      s2.async = true;
      s2.src = 'https://eocampaign1.com/form/a1be7298-21da-11f1-91f4-271ecaf1fe8d.js';
      s2.setAttribute('data-form', EO_FORM_ID);
      s2.addEventListener('load', function () {
        runChromeHides();
        setTimeout(function () {
          runChromeHides();
          if (done) done();
        }, 400);
      });
      mount.appendChild(s2);
      return;
    }
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="eoHiddenSub" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0" aria-hidden="true"></div>';
    document.body.appendChild(wrap.firstChild);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://eocampaign1.com/form/a1be7298-21da-11f1-91f4-271ecaf1fe8d.js';
    s.setAttribute('data-form', EO_FORM_ID);
    s.addEventListener('load', function () {
      runChromeHides();
      setTimeout(function () {
        runChromeHides();
        if (done) done();
      }, 400);
    });
    document.getElementById('eoHiddenSub').appendChild(s);
  }

  function tryPendingEoRetry() {
    if (localStorage.getItem('leadGateSyncPending') !== '1') return;
    var raw = localStorage.getItem('leadGatePendingLead');
    var lead = null;
    try {
      lead = raw ? JSON.parse(raw) : null;
    } catch (e) {}
    if (!lead || !lead.email) {
      clearSyncPending();
      return;
    }
    ensureEoHiddenWithScript(function () {
      startChromeGuard();
      eoSubmitWithRetries(lead);
    });
  }

  if (localStorage.getItem('subscribed') === '1' && localStorage.getItem('leadGateComplete') !== '1') {
    localStorage.setItem('leadGateComplete', '1');
  }

  if (isNoPopupPage(path)) {
    setTimeout(tryPendingEoRetry, 0);
    return;
  }

  if (localStorage.getItem('leadGateComplete') === '1') {
    setTimeout(tryPendingEoRetry, 0);
    return;
  }

  var PERSONAL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|mac|mail|proton|protonmail|zoho|yandex|gmx|fastmail|tutanota|hey|pm|cock|airmail|inbox|rocketmail|rediffmail|mailinator|guerrillamail|tempmail|throwaway|10minutemail|sharklasers|guerrillamailblock|grr|dispostable)\./i;

  function lockScroll() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  var css = document.createElement('style');
  css.textContent =
    'html.sfab-gate-active,html.sfab-gate-active body{overflow:hidden!important}' +
    '.sfab-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.65);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:1;pointer-events:auto}' +
    '.sfab-overlay-card{position:relative;width:min(760px,calc(100vw - 1.5rem));max-height:calc(100vh - 2rem);overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:0;box-shadow:0 25px 50px -12px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.04)}' +
    '.sfab-eo-inner{display:grid;grid-template-columns:1fr min(220px,32vw);gap:0;align-items:stretch;min-height:min(420px,70vh)}' +
    '.sfab-eo-formcol{padding:1.75rem 1.5rem 1.25rem;display:flex;flex-direction:column}' +
    '.sfab-eo-art{background:#001e2b;display:flex;align-items:center;justify-content:center;border-radius:0 16px 16px 0}' +
    '.sfab-eo-art-img{display:block;width:min(88px,40vw);height:auto;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,237,100,.2))}' +
    '.sfab-ovl-title{font-size:1.35rem;font-weight:700;color:#0f172a;margin:0 0 .4rem;line-height:1.2;letter-spacing:-.02em}' +
    '.sfab-ovl-desc{font-size:.875rem;color:#64748b;line-height:1.5;margin:0 0 1.1rem}' +
    '.sfab-overlay-fields{display:grid;grid-template-columns:1fr 1fr;gap:.65rem .75rem;margin-bottom:1rem;flex:1}' +
    '.sfab-overlay-fields .sfab-span2{grid-column:1/-1}' +
    '.sfab-overlay-fields label{display:flex;flex-direction:column;gap:.28rem;font-size:.75rem;font-weight:600;color:#475569}' +
    '.sfab-overlay-fields input{padding:.65rem .8rem;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:.875rem;outline:none;transition:border-color .15s,box-shadow .15s;width:100%;box-sizing:border-box}' +
    '.sfab-overlay-fields input::placeholder{color:#94a3b8}' +
    '.sfab-overlay-fields input:focus{border-color:#00ed64;box-shadow:0 0 0 3px rgba(0,237,100,.2)}' +
    '.sfab-overlay-actions{margin-top:0}' +
    '.sfab-overlay-actions button{width:100%;padding:.8rem 1rem;border:none;border-radius:8px;background:#00ed64;color:#001e2b;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:700;font-size:.9rem;cursor:pointer;transition:background .2s}' +
    '.sfab-overlay-actions button:hover{background:#00c853}' +
    '.sfab-overlay-actions button:disabled{opacity:.65;cursor:not-allowed}' +
    '.sfab-ovl-err{font-size:.8125rem;color:#dc2626;margin:.5rem 0 0}' +
    '.sfab-ovl-success{text-align:center;padding:2rem 1.5rem}' +
    '.sfab-ovl-success p{color:#0f172a}' +
    '.sfab-ovl-success .sfab-ovl-sub{color:#64748b!important}' +
    '.sfab-ovl-powered{display:block;text-align:center;margin-top:auto;padding-top:1rem;font-size:.6875rem;color:#94a3b8;text-decoration:none}' +
    '.sfab-ovl-powered:hover{color:#64748b}' +
    '@media(max-width:640px){.sfab-eo-inner{grid-template-columns:1fr;min-height:auto}.sfab-eo-art{border-radius:0;min-height:160px;order:-1}.sfab-overlay-card{border-radius:12px}.sfab-overlay-fields{grid-template-columns:1fr}}' +
    '#subscribeFab,.subscribe-fab,button.subscribe-fab,[data-sfab-eo-launcher-hide]{display:none!important;visibility:hidden!important;pointer-events:none!important;clip:rect(0,0,0,0)!important;position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important}';
  document.head.appendChild(css);
  document.documentElement.classList.add('sfab-gate-active');
  lockScroll();

  var wrapper = document.createElement('div');
  wrapper.innerHTML =
    '<div id="eoHiddenSub" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0" aria-hidden="true"></div>' +
    '<div class="sfab-overlay" id="sfabOverlay" role="dialog" aria-modal="true" aria-labelledby="sfabGateTitle">' +
      '<div class="sfab-overlay-card">' +
        '<div class="sfab-eo-inner">' +
          '<div class="sfab-eo-formcol">' +
            '<h3 class="sfab-ovl-title" id="sfabGateTitle">Continue to this page</h3>' +
            '<p class="sfab-ovl-desc">Enter your details to access content. All fields are required.</p>' +
            '<form id="sfabOvlForm" novalidate>' +
              '<div class="sfab-overlay-fields">' +
                '<label>First name<input type="text" id="sfabFirst" name="firstName" autocomplete="given-name" required placeholder="First name"></label>' +
                '<label>Last name<input type="text" id="sfabLast" name="lastName" autocomplete="family-name" required placeholder="Last name"></label>' +
                '<label class="sfab-span2">Email<input type="email" id="sfabEmail" autocomplete="email" required placeholder="xyz@company.com"></label>' +
                '<label class="sfab-span2">Company<input type="text" id="sfabCompany" name="company" autocomplete="organization" required placeholder="Company"></label>' +
                '<label class="sfab-span2">Position<input type="text" id="sfabPosition" name="position" autocomplete="organization-title" required placeholder="Position"></label>' +
              '</div>' +
              '<div class="sfab-overlay-actions">' +
                '<button type="submit" id="sfabOvlBtn">Submit and continue</button>' +
              '</div>' +
              '<p class="sfab-ovl-err" id="sfabOvlErr" style="display:none"></p>' +
            '</form>' +
            '<div class="sfab-ovl-success" id="sfabOvlSuccess" style="display:none">' +
              '<svg width="32" height="32" fill="none" stroke="#00ed64" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
              '<p style="margin-top:.5rem;font-weight:600;font-size:1rem">You\'re in</p>' +
              '<p class="sfab-ovl-sub" style="font-size:.8125rem;margin-top:.35rem">Finishing signup in the background…</p>' +
            '</div>' +
            '<a href="https://emailoctopus.com" target="_blank" rel="noopener noreferrer" class="sfab-ovl-powered">Powered by EmailOctopus</a>' +
          '</div>' +
          '<div class="sfab-eo-art">' +
            '<img class="sfab-eo-art-img" src="' +
            htmlAttr(leafImgSrc) +
            '" alt="MongoDB" width="88" height="88" decoding="async">' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);

  var eoScript = document.createElement('script');
  eoScript.async = true;
  eoScript.src = 'https://eocampaign1.com/form/a1be7298-21da-11f1-91f4-271ecaf1fe8d.js';
  eoScript.setAttribute('data-form', EO_FORM_ID);
  document.getElementById('eoHiddenSub').appendChild(eoScript);

  startChromeGuard();
  eoScript.addEventListener('load', function () {
    runChromeHides();
    setTimeout(runChromeHides, 50);
    setTimeout(runChromeHides, 300);
    setTimeout(runChromeHides, 1500);
  });

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.key === 'Escape' && document.getElementById('sfabOverlay')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  (function initGate() {
    var overlay = document.getElementById('sfabOverlay');
    var oForm = document.getElementById('sfabOvlForm');
    var oBtn = document.getElementById('sfabOvlBtn');
    var oSuccess = document.getElementById('sfabOvlSuccess');
    var oErr = document.getElementById('sfabOvlErr');
    var elFirst = document.getElementById('sfabFirst');
    var elLast = document.getElementById('sfabLast');
    var elEmail = document.getElementById('sfabEmail');
    var elCo = document.getElementById('sfabCompany');
    var elPos = document.getElementById('sfabPosition');
    if (!overlay || !oForm) return;

    function showErr(msg) {
      oErr.textContent = msg;
      oErr.style.display = 'block';
    }
    function clearErr() {
      oErr.style.display = 'none';
      oErr.textContent = '';
    }

    oForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErr();
      var firstName = elFirst.value.trim();
      var lastName = elLast.value.trim();
      var email = elEmail.value.trim();
      var company = elCo.value.trim();
      var position = elPos.value.trim();
      if (!firstName || !lastName || !email || !company || !position) {
        showErr('Please fill in every field.');
        return;
      }
      var dom = email.split('@')[1];
      if (!dom || PERSONAL.test(dom)) {
        elEmail.setCustomValidity('Use your work email (e.g. you@company.com)');
        elEmail.reportValidity();
        elEmail.addEventListener(
          'input',
          function once() {
            elEmail.setCustomValidity('');
            elEmail.removeEventListener('input', once);
          }
        );
        return;
      }

      var lead = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        company: company,
        position: position,
        url: location.href
      };

      localStorage.setItem(
        'leadGateProfile',
        JSON.stringify({
          firstName: firstName,
          lastName: lastName,
          email: email,
          company: company,
          position: position
        })
      );
      localStorage.setItem('leadGateComplete', '1');
      localStorage.setItem('subscribed', '1');
      markSyncPending(lead);

      oBtn.disabled = true;
      oBtn.textContent = 'Submitting…';
      var oTitle = document.getElementById('sfabGateTitle');
      var oDesc = overlay.querySelector('.sfab-ovl-desc');
      var oArt = overlay.querySelector('.sfab-eo-art');
      if (oTitle) oTitle.style.display = 'none';
      if (oDesc) oDesc.style.display = 'none';
      if (oArt) oArt.style.display = 'none';
      oForm.style.display = 'none';
      oSuccess.style.display = 'block';

      eoSubmitWithRetries(lead);

      setTimeout(function () {
        overlay.remove();
        unlockScroll();
        document.documentElement.classList.remove('sfab-gate-active');
      }, 500);
    });

    setTimeout(function () {
      elFirst.focus();
    }, 100);
  })();
})();
