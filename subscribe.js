// subscribe.js — Lead gate + Email Octopus (hidden embed).
// EO v2 + invisible reCAPTCHA: their script expects input[name=g-recaptcha-response] but
// only adds recaptcha-response — we mirror it on submit (capture). Success: emailoctopus:form.success + DOM.
//
// List merge tags (Email Octopus contact fields) are NOT the POST names. The embed submits field_0…field_N;
// EO maps those to {{EmailAddress}}, {{FirstName}}, {{LastName}}, {{Company}}, {{Position}}, {{URL}}.
// For this form (EO_FORM_ID), generated markup has typically:
//   field_1 First name  → {{FirstName}}   |  field_2 Last name → {{LastName}}
//   field_0 Email       → {{EmailAddress}} |  field_3 Company   → {{Company}}
//   field_4 Position    → {{Position}}    |  field_5 URL       → {{URL}}
// Reordering fields in the EO form editor changes field_* indices; we resolve Company/URL by placeholder
// and patch FormData before fetch so Vue empty model does not wipe them.
// Email gate: HTML5 checkValidity + structure + DNS MX/A (Cloudflare DoH). connect-src must allow
// https://cloudflare-dns.com or DNS step fails open (submit still allowed).
// Background: DNS outcomes cached (session, 5m); {{URL}} sync deduped per URL per tab session; bfcache
// pageshow clears dedupe; pending-EO retry on success triggers URL sync; chrome hide debounced (0ms).
(function () {
  var EO_FORM_ID = 'a1be7298-21da-11f1-91f4-271ecaf1fe8d';
  var path = (location.pathname || '').replace(/\\/g, '/').toLowerCase();
  var EO_BG_SYNC_DELAY_MS = 1650;
  var SESSION_EO_URL_SENT_KEY = 'sfabEoUrlSyncedHref';
  var DNS_CACHE_PREFIX = 'sfabDnsV1:';
  var DNS_CACHE_TTL_MS = 5 * 60 * 1000;

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
  var moEoAria = null;
  var debounceChromeHideTimer = null;

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

  function stripEoHiddenAriaConflict() {
    var box = document.getElementById('eoHiddenSub');
    if (!box) return;
    if (box.hasAttribute('aria-hidden')) box.removeAttribute('aria-hidden');
    if (box.hasAttribute('inert')) box.removeAttribute('inert');
    var ae = document.activeElement;
    if (ae && typeof ae.blur === 'function' && box.contains(ae)) ae.blur();
    if (!moEoAria) {
      moEoAria = new MutationObserver(function () {
        stripEoHiddenAriaConflict();
      });
      moEoAria.observe(box, { attributes: true, attributeFilter: ['aria-hidden'] });
    }
  }

  function runChromeHides() {
    stripEoHiddenAriaConflict();
    if (debounceChromeHideTimer != null) {
      clearTimeout(debounceChromeHideTimer);
      debounceChromeHideTimer = null;
    }
    debounceChromeHideTimer = setTimeout(function () {
      debounceChromeHideTimer = null;
      hideFloatingSignupChrome();
    }, 0);
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
    if (debounceChromeHideTimer != null) {
      clearTimeout(debounceChromeHideTimer);
      debounceChromeHideTimer = null;
    }
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
    if (!inp) return;
    var v = val == null ? '' : String(val);
    var tag = (inp.tagName || '').toUpperCase();
    if (tag === 'SELECT') {
      inp.value = v;
    } else if (tag === 'TEXTAREA') {
      var ts = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      ts.call(inp, v);
    } else {
      var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      s.call(inp, v);
    }
    try {
      if (typeof InputEvent === 'function') {
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      } else {
        inp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    } catch (eIn) {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    try {
      inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch (eCh) {
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function findEoFieldByExactPlaceholder(formEl, exactLower) {
    var nodes = formEl.querySelectorAll('input, textarea, select');
    for (var i = 0; i < nodes.length; i++) {
      var inp = nodes[i];
      var ty = (inp.type || '').toLowerCase();
      if (ty === 'hidden' || ty === 'submit' || ty === 'button') continue;
      if (inp.closest && inp.closest('.emailoctopus-form-row-hp')) continue;
      if (ty === 'email' && exactLower === 'company') continue;
      var ph = (inp.getAttribute('placeholder') || '').trim().toLowerCase();
      var al = (inp.getAttribute('aria-label') || '').trim().toLowerCase();
      if (ph === exactLower || al === exactLower) return inp;
    }
    return null;
  }

  function setEoNamedField(formEl, num, val) {
    if (val == null || String(val) === '') return;
    var el =
      formEl.querySelector('input#field_' + num + '[name="field_' + num + '"]') ||
      formEl.querySelector('input[name="field_' + num + '"]') ||
      formEl.querySelector('#field_' + num);
    if (el) setInputValue(el, val);
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

    function isHp(inp) {
      return !!(inp.closest && inp.closest('.emailoctopus-form-row-hp'));
    }

    function pick(needles) {
      for (var i = 0; i < candidates.length; i++) {
        if (isHp(candidates[i])) continue;
        var b = normBlob(candidates[i]);
        for (var j = 0; j < needles.length; j++) {
          if (b.indexOf(needles[j].replace(/[\s_-]/g, '')) !== -1) return candidates[i];
        }
      }
      return null;
    }

    function pickSkipEmail(needles) {
      for (var i = 0; i < candidates.length; i++) {
        var inp = candidates[i];
        if (isHp(inp)) continue;
        if ((inp.type || '').toLowerCase() === 'email') continue;
        var b = normBlob(inp);
        for (var j = 0; j < needles.length; j++) {
          if (b.indexOf(needles[j].replace(/[\s_-]/g, '')) !== -1) return inp;
        }
      }
      return null;
    }

    var fn = pick(['firstname', 'first', 'given']);
    var ln = pick(['lastname', 'last', 'surname', 'family']);
    var co = pickSkipEmail(['company', 'organization', 'organisation', 'org', 'employer', 'business']);
    var po = pickSkipEmail(['position', 'jobtitle', 'title', 'role']);
    var urlInp = pickSkipEmail(['url', 'pageurl', 'page_url', 'website', 'webpage', 'landing', 'signupsource']);

    var texts = candidates.filter(function (inp) {
      if (isHp(inp)) return false;
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
    if (data.url) {
      if (urlInp) setInputValue(urlInp, data.url);
      else if (texts[4]) setInputValue(texts[4], data.url);
    }

    if (emailInp) setInputValue(emailInp, data.email);

    var coExact = findEoFieldByExactPlaceholder(f, 'company');
    if (coExact && data.company) setInputValue(coExact, data.company);
    var urlExact = findEoFieldByExactPlaceholder(f, 'url');
    if (urlExact && data.url) setInputValue(urlExact, data.url);

    setEoNamedField(f, 3, data.company);
    setEoNamedField(f, 5, data.url);

    var hp = f.querySelector('.emailoctopus-form-row-hp input');
    if (hp) setInputValue(hp, '');

    function resyncCompanyUrl() {
      setEoNamedField(f, 3, data.company);
      setEoNamedField(f, 5, data.url);
      var c2 = findEoFieldByExactPlaceholder(f, 'company');
      if (c2 && data.company) setInputValue(c2, data.company);
      var u2 = findEoFieldByExactPlaceholder(f, 'url');
      if (u2 && data.url) setInputValue(u2, data.url);
    }
    setTimeout(resyncCompanyUrl, 0);
    setTimeout(resyncCompanyUrl, 120);
    requestAnimationFrame(resyncCompanyUrl);
  }

  function findEoForm() {
    return (
      document.querySelector('#eoHiddenSub [data-form="' + EO_FORM_ID + '"] form.emailoctopus-form') ||
      document.querySelector('#eoHiddenSub form.emailoctopus-form') ||
      document.querySelector('[data-form="' + EO_FORM_ID + '"] form.emailoctopus-form')
    );
  }

  var sfabEoFormDataLead = null;

  function installEoFetchFormDataFix() {
    if (window.__SFAB_EO_FETCH_FIX) return;
    window.__SFAB_EO_FETCH_FIX = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var urlStr =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : '';
        if (
          sfabEoFormDataLead &&
          urlStr.indexOf('eocampaign1.com/form/') !== -1 &&
          init &&
          init.body instanceof FormData
        ) {
          var form = findEoForm();
          var lead = sfabEoFormDataLead;
          if (form && lead) {
            var coEl = findEoFieldByExactPlaceholder(form, 'company');
            var coName = coEl && coEl.getAttribute('name') ? coEl.getAttribute('name') : 'field_3';
            if (lead.company != null && String(lead.company) !== '') init.body.set(coName, String(lead.company));
            var urlEl = findEoFieldByExactPlaceholder(form, 'url');
            var urlName = urlEl && urlEl.getAttribute('name') ? urlEl.getAttribute('name') : 'field_5';
            if (lead.url != null && String(lead.url) !== '') init.body.set(urlName, String(lead.url));
          }
        }
      } catch (eFd) {}
      return nativeFetch(input, init);
    };
  }

  installEoFetchFormDataFix();

  function waitForEoForm(onReady, onGiveUp, maxWaitMs) {
    var t0 = Date.now();
    var limit = maxWaitMs != null ? maxWaitMs : 55000;
    function poll() {
      var f = findEoForm();
      if (!f || !f.querySelector('input,button,select,textarea')) {
        if (Date.now() - t0 > limit) return onGiveUp();
        return setTimeout(poll, 100);
      }
      if (f.querySelector('[data-column-index]')) {
        if (typeof window.initComponents !== 'function' && Date.now() - t0 < limit) {
          return setTimeout(poll, 120);
        }
        return setTimeout(function () {
          onReady();
        }, 500);
      }
      onReady();
    }
    poll();
  }

  function eoMirrorRecaptchaForSubmit(formEl) {
    var r = formEl.querySelector('[name="recaptcha-response"],[name=recaptcha-response]');
    if (!r || !r.value) return;
    if (formEl.querySelector('[name="g-recaptcha-response"],[name=g-recaptcha-response]')) return;
    var g = document.createElement('input');
    g.setAttribute('type', 'hidden');
    g.setAttribute('name', 'g-recaptcha-response');
    g.setAttribute('value', r.value);
    formEl.appendChild(g);
  }

  function stashAndRevealEoMountForCaptcha() {
    var b = document.getElementById('eoHiddenSub');
    if (!b || b.dataset.sfabEoStyleOrig != null) return;
    b.dataset.sfabEoStyleOrig = b.getAttribute('style') || '';
    b.style.cssText =
      'position:fixed!important;left:0!important;top:0!important;width:4px!important;height:4px!important;' +
      'opacity:0.03!important;overflow:hidden!important;pointer-events:auto!important;z-index:2147483645!important;clip:auto!important;';
  }

  function restoreEoHiddenSubMount() {
    var b = document.getElementById('eoHiddenSub');
    if (!b || b.dataset.sfabEoStyleOrig == null) return;
    var prev = b.dataset.sfabEoStyleOrig;
    delete b.dataset.sfabEoStyleOrig;
    if (prev === '') b.removeAttribute('style');
    else b.setAttribute('style', prev);
  }

  function eoSubmit(data, onOk, onErr, timeoutMs) {
    var maxMs = timeoutMs != null ? timeoutMs : 45000;
    var tries = 0;
    var obs = null;
    var failTimer = null;
    var settled = false;

    function cleanup() {
      sfabEoFormDataLead = null;
      restoreEoHiddenSubMount();
      if (obs) {
        obs.disconnect();
        obs = null;
      }
      if (failTimer) {
        clearTimeout(failTimer);
        failTimer = null;
      }
      document.removeEventListener('emailoctopus:form.success', onEoSuccessDoc, false);
      document.removeEventListener('submit', onEoSubmitCapture, true);
    }

    function finish(ok) {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) onOk();
      else onErr();
    }

    function onEoSuccessDoc(ev) {
      try {
        var d = ev && ev.detail;
        if (d && String(d.form_id || '') === EO_FORM_ID) finish(true);
      } catch (eSe) {}
    }

    function onEoSubmitCapture(ev) {
      if (!ev || !ev.target || ev.target.tagName !== 'FORM') return;
      if (ev.target !== f) return;
      eoMirrorRecaptchaForSubmit(f);
    }

    var f = null;

    function go() {
      f = findEoForm();
      if (!f) {
        if (++tries < 220) return setTimeout(go, 150);
        return finish(false);
      }

      document.addEventListener('emailoctopus:form.success', onEoSuccessDoc, false);
      document.addEventListener('submit', onEoSubmitCapture, true);

      fillEoForm(f, data);
      sfabEoFormDataLead = data;
      f.noValidate = true;
      f.querySelectorAll('[required]').forEach(function (inp) {
        inp.removeAttribute('required');
      });
      f.querySelectorAll('input,select,textarea').forEach(function (inp) {
        try {
          inp.setCustomValidity('');
        } catch (eCv) {}
      });

      stashAndRevealEoMountForCaptcha();

      var eoBox = document.getElementById('eoHiddenSub');
      var ae = document.activeElement;
      if (eoBox && ae && typeof ae.blur === 'function' && eoBox.contains(ae)) ae.blur();

      var host = f.closest('[data-form]') || f.parentElement;
      if (!host) {
        restoreEoHiddenSubMount();
        return finish(false);
      }

      obs = new MutationObserver(function () {
        var sm = host.querySelector('.emailoctopus-success-message');
        var em = host.querySelector('.emailoctopus-error-message');
        if (sm && sm.textContent.trim()) finish(true);
        else if (em && em.textContent.trim()) finish(false);
      });
      obs.observe(host, { childList: true, subtree: true, characterData: true });

      failTimer = setTimeout(function () {
        finish(false);
      }, maxMs);

      var sub =
        f.querySelector('button[type="submit"],input[type="submit"]') ||
        f.querySelector('button.emailoctopus-submit') ||
        f.querySelector('button');
      try {
        if (typeof f.requestSubmit === 'function' && sub) {
          f.requestSubmit(sub);
        } else if (sub && sub.click) {
          sub.click();
        } else {
          f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      } catch (eSubmit) {
        try {
          if (sub && sub.click) sub.click();
          else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } catch (e2) {
          finish(false);
        }
      }
    }
    go();
  }

  function eoSubmitWithRetries(lead) {
    var attempt = 0;
    var maxAttempts = 5;
    var delayMs = 3000;
    function again() {
      attempt++;
      eoSubmit(
        lead,
        function () {
          clearSyncPending();
          stopChromeGuard();
          try {
            sessionStorage.removeItem(SESSION_EO_URL_SENT_KEY);
          } catch (eClr) {}
          setTimeout(trySyncEoLastPageUrl, 900);
        },
        function () {
          if (attempt < maxAttempts) setTimeout(again, delayMs);
          else stopChromeGuard();
        },
        40000
      );
    }
    again();
  }

  function ensureEoHiddenWithScript(done) {
    var mount = document.getElementById('eoHiddenSub');
    if (mount) {
      stripEoHiddenAriaConflict();
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
      s2.async = false;
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
      '<div id="eoHiddenSub" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0" tabindex="-1"></div>';
    document.body.appendChild(wrap.firstChild);
    stripEoHiddenAriaConflict();
    var s = document.createElement('script');
    s.async = false;
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

  /** After signup, EO merge tag {{URL}} reflects the current page (throttled: once per URL per tab session). */
  function trySyncEoLastPageUrl() {
    if (localStorage.getItem('leadGateSyncPending') === '1') return;
    if (localStorage.getItem('leadGateComplete') !== '1') return;
    var href = location.href;
    try {
      if (sessionStorage.getItem(SESSION_EO_URL_SENT_KEY) === href) return;
    } catch (eDedupe) {}
    var raw = localStorage.getItem('leadGateProfile');
    var profile = null;
    try {
      profile = raw ? JSON.parse(raw) : null;
    } catch (eProf) {}
    if (!profile || !profile.email) return;
    var lead = {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email,
      company: profile.company || '',
      position: profile.position || '',
      url: href
    };
    ensureEoHiddenWithScript(function () {
      startChromeGuard();
      eoSubmit(
        lead,
        function () {
          try {
            sessionStorage.setItem(SESSION_EO_URL_SENT_KEY, href);
          } catch (eOk) {}
          stopChromeGuard();
        },
        function () {
          stopChromeGuard();
        },
        35000
      );
    });
  }

  function scheduleBackgroundEoSync() {
    setTimeout(tryPendingEoRetry, 0);
    setTimeout(trySyncEoLastPageUrl, EO_BG_SYNC_DELAY_MS);
  }

  function onBfCachePageShow(ev) {
    if (!ev || ev.persisted !== true) return;
    if (localStorage.getItem('leadGateSyncPending') === '1') return;
    if (localStorage.getItem('leadGateComplete') !== '1') return;
    try {
      sessionStorage.removeItem(SESSION_EO_URL_SENT_KEY);
    } catch (eBf) {}
    setTimeout(trySyncEoLastPageUrl, 500);
  }

  if (localStorage.getItem('subscribed') === '1' && localStorage.getItem('leadGateComplete') !== '1') {
    localStorage.setItem('leadGateComplete', '1');
  }

  if (isNoPopupPage(path)) {
    scheduleBackgroundEoSync();
    window.addEventListener('pageshow', onBfCachePageShow, false);
    return;
  }

  if (localStorage.getItem('leadGateComplete') === '1') {
    scheduleBackgroundEoSync();
    window.addEventListener('pageshow', onBfCachePageShow, false);
    return;
  }

  var PERSONAL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|mac|mail|proton|protonmail|zoho|yandex|gmx|fastmail|tutanota|hey|pm|cock|airmail|inbox|rocketmail|rediffmail|mailinator|guerrillamail|tempmail|throwaway|10minutemail|sharklasers|guerrillamailblock|grr|dispostable)\./i;

  function validateEmailStructure(emailRaw) {
    var email = emailRaw.trim();
    if (!email) return { ok: false, msg: 'Enter your work email.' };
    var at = email.indexOf('@');
    if (at < 1) return { ok: false, msg: 'Enter the name and @ before your domain (e.g. you@company.com).' };
    if (email.lastIndexOf('@') !== at) return { ok: false, msg: 'Use exactly one @ in your email address.' };
    var local = email.slice(0, at);
    var domain = email.slice(at + 1).trim().toLowerCase();
    if (!domain) return { ok: false, msg: 'Add the domain after @ (e.g. mongodb.com).' };
    if (local.length > 64) return { ok: false, msg: 'The part before @ is too long (max 64 characters).' };
    if (domain.length > 253) return { ok: false, msg: 'The domain part is too long.' };
    if (/\s/.test(email)) return { ok: false, msg: 'Remove spaces from your email address.' };
    if (domain.indexOf('..') !== -1 || domain.startsWith('.') || domain.endsWith('.')) {
      return { ok: false, msg: 'That domain looks invalid (check dots).' };
    }
    if (domain.indexOf('.') === -1) return { ok: false, msg: 'Use a full domain with a suffix (e.g. company.com).' };
    var labels = domain.split('.');
    for (var li = 0; li < labels.length; li++) {
      if (!labels[li] || labels[li].length > 63) return { ok: false, msg: 'That domain looks invalid.' };
    }
    return { ok: true, email: email, domain: domain };
  }

  function verifyDomainAcceptsMail(domain) {
    var cacheKey = DNS_CACHE_PREFIX + domain;
    try {
      var cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        var cachedRow = JSON.parse(cachedRaw);
        if (
          cachedRow &&
          cachedRow.v &&
          typeof cachedRow.t === 'number' &&
          Date.now() - cachedRow.t < DNS_CACHE_TTL_MS
        ) {
          return Promise.resolve(cachedRow.v);
        }
      }
    } catch (eCacheRead) {}

    function cacheDnsResult(out) {
      if (out && !out.skip) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: out }));
        } catch (eCacheWrite) {}
      }
      return out;
    }

    function doh(name, type) {
      return fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type, {
        headers: { Accept: 'application/dns-json' },
        cache: 'no-store',
        credentials: 'omit'
      }).then(function (r) {
        if (!r.ok) throw new Error('skip');
        return r.json();
      });
    }
    return doh(domain, 'MX')
      .then(function (j) {
        if (j.Status === 3) return { ok: false, msg: 'We could not find that domain. Check the spelling after @.' };
        if (j.Status !== 0) return { ok: true, skip: true };
        if (j.Answer && j.Answer.length > 0) return { ok: true };
        return doh(domain, 'A').then(function (ja) {
          if (ja.Status === 3) return { ok: false, msg: 'We could not find that domain. Check the spelling after @.' };
          if (ja.Status !== 0) return { ok: true, skip: true };
          if (ja.Answer && ja.Answer.length > 0) return { ok: true };
          return { ok: false, msg: 'That domain does not appear set up to receive email. Check the domain after @.' };
        });
      })
      .then(function (out) {
        return Promise.resolve(out).then(cacheDnsResult);
      })
      .catch(function () {
        return { ok: true, skip: true };
      });
  }

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
    '<div id="eoHiddenSub" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0" tabindex="-1"></div>' +
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
  eoScript.async = false;
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

      var struct = validateEmailStructure(email);
      if (!struct.ok) {
        showErr(struct.msg);
        return;
      }
      email = struct.email;

      elEmail.setCustomValidity('');
      if (!elEmail.checkValidity()) {
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

      if (PERSONAL.test(struct.domain)) {
        elEmail.setCustomValidity('Use your work email (e.g. you@company.com)');
        elEmail.reportValidity();
        elEmail.addEventListener(
          'input',
          function once2() {
            elEmail.setCustomValidity('');
            elEmail.removeEventListener('input', once2);
          }
        );
        return;
      }

      oBtn.disabled = true;
      oBtn.textContent = 'Checking email…';

      function showSuccessAndExit() {
        var oTitle = document.getElementById('sfabGateTitle');
        var oDesc = overlay.querySelector('.sfab-ovl-desc');
        var oArt = overlay.querySelector('.sfab-eo-art');
        if (oTitle) oTitle.style.display = 'none';
        if (oDesc) oDesc.style.display = 'none';
        if (oArt) oArt.style.display = 'none';
        oForm.style.display = 'none';
        oSuccess.style.display = 'block';
        setTimeout(function () {
          overlay.remove();
          unlockScroll();
          document.documentElement.classList.remove('sfab-gate-active');
        }, 900);
      }

      function onEoFailure(msg) {
        oBtn.disabled = false;
        oBtn.textContent = 'Submit and continue';
        showErr(msg || 'Could not complete signup. Please try again.');
      }

      verifyDomainAcceptsMail(struct.domain).then(function (dns) {
        if (!dns.ok) {
          oBtn.disabled = false;
          oBtn.textContent = 'Submit and continue';
          showErr(dns.msg);
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

        oBtn.textContent = 'Submitting…';

        waitForEoForm(
          function () {
            eoSubmit(
              lead,
              function () {
                localStorage.setItem(
                  'leadGateProfile',
                  JSON.stringify({
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    company: company,
                    position: position,
                    url: location.href
                  })
                );
                localStorage.setItem('leadGateComplete', '1');
                localStorage.setItem('subscribed', '1');
                clearSyncPending();
                stopChromeGuard();
                showSuccessAndExit();
              },
              function () {
                markSyncPending(lead);
                onEoFailure(
                  'Email Octopus did not confirm this signup (timeout or error). Check your connection and use Submit and continue to retry.'
                );
              },
              45000
            );
          },
          function () {
            onEoFailure('The signup form is still loading. Wait a few seconds and try again.');
          },
          45000
        );
      });
    });

    setTimeout(function () {
      elFirst.focus();
    }, 100);
  })();
})();
