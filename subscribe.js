// subscribe.js — Lead gate → Google Forms + PostHog identify.
//
// Flow: user sees overlay, fills fields, we validate (structure + DNS MX + personal-email block +
// honeypot + dwell time + real input events), submit to Google Forms via a hidden-iframe form POST,
// set leadGateComplete in localStorage, then identify in PostHog and dismiss. If the iframe submit
// fails after retries, we still mark the gate complete (so the user isn't blocked), persist the lead
// to leadGatePendingLead, and retry on the next page load.
//
// Google Form: one row per submission. Form action `/formResponse`, each field `entry.{id}`.
// Fields (in form order): First name, Last name, Work email, Company, Position, Source URL,
// hp_check (honeypot — bots fill, humans never see it), Timestamp ISO, Referrer. All 9 fields must
// be question type `Short answer` in the Google Form editor (not Date / Time / Quiz / etc.).
//
// Submission mechanism: hidden <iframe name="..."> + hidden <form target="..."> + form.submit().
// This is preferred over fetch() no-cors because Google Forms is stricter with programmatic fetch
// POSTs (can return 400 on certain configs) but accepts iframe form submits the same way it accepts
// real-user UI submits. Requires CSP frame-src allow https://docs.google.com so the iframe loads.
//
// Bot protection layers (client-side):
//   1. Honeypot field hp_check — CSS-offscreen + aria-hidden + tabindex=-1; never populated by JS.
//   2. Minimum dwell time 2500 ms between overlay render and submit.
//   3. Real interaction required: at least one keydown or paste event on a visible input.
//   4. Timestamp + referrer sent for post-hoc analysis in the linked Sheet.
// Sophisticated bots using a real browser can bypass these — for stronger gating, add reCAPTCHA v3
// or Cloudflare Turnstile.
//
// Email gate: HTML5 checkValidity + structure + Cloudflare DoH MX/A lookup. connect-src must allow
// https://cloudflare-dns.com + us.i.posthog.com. frame-src must allow https://docs.google.com.
//
// Local preview: file:// or localhost / 127.0.0.1 skips the gate and PostHog.
// Lead storage: bump LEAD_STORAGE_VERSION to force a one-time wipe of leadGate* state on all clients.
(function() {
    var path = (location.pathname || '').replace(/\\/g, '/').toLowerCase();
    /** Increment to force one-time clear of gate state on all clients (new journey). */
    var LEAD_STORAGE_VERSION = '3';
    var LEAD_STORAGE_VERSION_KEY = 'sfabLeadStorageVersion';
    try {
        var leadVerOk =
            localStorage.getItem(LEAD_STORAGE_VERSION_KEY) === LEAD_STORAGE_VERSION ||
            sessionStorage.getItem('sfabLeadStorageVersionShadow') === LEAD_STORAGE_VERSION;
        if (!leadVerOk) {
            [
                'leadGateComplete',
                'leadGateProfile',
                'subscribed',
                'leadGateSyncPending',
                'leadGatePendingLead'
            ].forEach(function(key) {
                localStorage.removeItem(key);
            });
            try {
                localStorage.setItem(LEAD_STORAGE_VERSION_KEY, LEAD_STORAGE_VERSION);
                sessionStorage.removeItem('sfabLeadStorageVersionShadow');
            } catch (eVer) {
                try {
                    sessionStorage.setItem('sfabLeadStorageVersionShadow', LEAD_STORAGE_VERSION);
                } catch (eS) {}
            }
        }
    } catch (eMigrate) {}

    // ── Google Forms configuration ──
    var GFORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSf9g9wBeUzAd1gFKvAxok_xezR7G_5_6ee9BLHaSJShw0lByA/formResponse';
    var GFORM_FIELDS = {
        firstName: 'entry.1507467738',
        lastName: 'entry.182242014',
        email: 'entry.2074063772',
        company: 'entry.1811579891',
        position: 'entry.681007237',
        sourceUrl: 'entry.1192531712',
        honeypot: 'entry.1735169915',
        timestamp: 'entry.2070104954',
        referrer: 'entry.964663652'
    };

    var DNS_CACHE_PREFIX = 'sfabDnsV1:';
    var DNS_CACHE_TTL_MS = 5 * 60 * 1000;
    /** Minimum time between overlay render and submit (ms). Bots usually submit instantly. */
    var MIN_DWELL_MS = 2500;
    /** Max retries when the network submit rejects. */
    var SUBMIT_MAX_ATTEMPTS = 5;
    /** Delay between submit retries on the same page load (ms). */
    var SUBMIT_RETRY_DELAY_MS = 3000;
    /** Abort the submit fetch if it hasn't resolved in this many ms. */
    var SUBMIT_TIMEOUT_MS = 12000;
    /** Project API key from PostHog → Project settings (leave empty to disable). */
    var POSTHOG_KEY = 'phc_mV7xKEsewjvwficJyjd5wcSmZzYjxFsP3KyCZv7aE6e9';
    /** US cloud default; use https://eu.i.posthog.com for EU hosting. */
    var POSTHOG_API_HOST = 'https://us.i.posthog.com';

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

    /** Opened as file:// or served from loopback — skip gate and analytics for local HTML preview. */
    function isLocalDevBypass() {
        try {
            if (typeof location === 'undefined') return false;
            if (location.protocol === 'file:') return true;
            var h = (location.hostname || '').toLowerCase();
            return h === 'localhost' || h === '127.0.0.1' || h === '::1';
        } catch (e) {
            return false;
        }
    }

    function clearSyncPending() {
        localStorage.removeItem('leadGateSyncPending');
        localStorage.removeItem('leadGatePendingLead');
    }

    function markSyncPending(lead) {
        localStorage.setItem('leadGateSyncPending', '1');
        localStorage.setItem('leadGatePendingLead', JSON.stringify(lead));
    }

    function newVisitorId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'sfab_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
    }

    function parseLeadGateProfile() {
        var raw = localStorage.getItem('leadGateProfile');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function persistLeadGateProfile(profile) {
        try {
            localStorage.setItem('leadGateProfile', JSON.stringify(profile));
        } catch (e) {}
    }

    /** Stable PostHog distinct_id; backfills localStorage for older profiles. */
    function ensureProfileVisitorId(profile) {
        if (!profile || !profile.email) return null;
        if (!profile.visitorId) {
            profile.visitorId = newVisitorId();
            persistLeadGateProfile(profile);
        }
        return profile.visitorId;
    }

    var sfabPostHogCaptureSentThisPage = false;

    function identifyPostHogFromLeadGate() {
        if (sfabPostHogCaptureSentThisPage) return true;
        if (!POSTHOG_KEY || typeof window.posthog === 'undefined' || !window.posthog.identify) return false;
        if (localStorage.getItem('leadGateComplete') !== '1') return false;
        var profile = parseLeadGateProfile();
        if (!profile || !profile.email) return false;
        var emailTrim = String(profile.email).trim();
        var distinctId = emailTrim.toLowerCase();
        if (!distinctId) return false;
        var vid = ensureProfileVisitorId(profile);
        try {
            if (vid && vid !== distinctId && typeof window.posthog.alias === 'function') {
                window.posthog.alias(distinctId, vid);
            }
            window.posthog.identify(distinctId, {
                $email: emailTrim
            });
            window.posthog.capture('$pageview', {
                $current_url: location.href
            });
            sfabPostHogCaptureSentThisPage = true;
            return true;
        } catch (ePh) {
            return false;
        }
    }

    function schedulePostHogIdentifyUntilSent() {
        var n = 0;

        function tick() {
            if (identifyPostHogFromLeadGate() || n++ > 50) return;
            setTimeout(tick, 120);
        }
        setTimeout(tick, 0);
    }

    function queuePostHogIdentifyAfterSignup() {
        schedulePostHogIdentifyUntilSent();
    }

    function installPostHog() {
        if (!POSTHOG_KEY || window.__SFAB_POSTHOG_INSTALLED) return;
        window.__SFAB_POSTHOG_INSTALLED = true;
        var phBootstrap = {};
        if (localStorage.getItem('leadGateComplete') === '1') {
            var bootProf = parseLeadGateProfile();
            if (bootProf && bootProf.email) {
                var bootId = String(bootProf.email).trim().toLowerCase();
                if (bootId) {
                    phBootstrap.distinctID = bootId;
                    phBootstrap.isIdentifiedID = true;
                }
            }
        }
        // Official loader stub (see posthog.com/docs/libraries/js).
        !(function(t, e) {
            var o, n, p, r;
            e.__SV ||
                ((window.posthog = e),
                    (e._i = []),
                    (e.init = function(i, s, a) {
                        function g(t, e) {
                            var o = e.split('.');
                            2 == o.length && ((t = t[o[0]]), (e = o[1])),
                                (t[e] = function() {
                                    t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
                                });
                        }
                        (p = t.createElement('script')).type = 'text/javascript';
                        p.crossOrigin = 'anonymous';
                        p.async = !0;
                        p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
                        (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
                        var u = e;
                        for (
                            void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
                            u.people = u.people || [],
                            u.toString = function(t) {
                                var e = 'posthog';
                                return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
                            },
                            u.people.toString = function() {
                                return u.toString(1) + '.people (stub)';
                            },
                            o =
                            'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(
                                ' '
                            ),
                            n = 0; n < o.length; n++
                        )
                            g(u, o[n]);
                        e._i.push([i, s, a]);
                    }),
                    (e.__SV = 1));
        })(document, window.posthog || []);
        var phInit = {
            api_host: POSTHOG_API_HOST,
            defaults: '2026-01-30',
            person_profiles: 'identified_only',
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_performance: false,
            capture_dead_clicks: false,
            rageclick: false,
            enable_heatmaps: false,
            disable_session_recording: true,
            loaded: function() {
                identifyPostHogFromLeadGate();
                schedulePostHogIdentifyUntilSent();
            }
        };
        if (phBootstrap.distinctID) {
            phInit.bootstrap = phBootstrap;
        }
        window.posthog.init(POSTHOG_KEY, phInit);
        schedulePostHogIdentifyUntilSent();
    }

    /**
     * Submit lead to Google Forms via a hidden-iframe form POST. This is more reliable than
     * fetch + no-cors: the browser treats it as a real top-level form submission (same as a user
     * clicking Submit on the Google Form UI), sends cookies, Referer, and full multipart body, which
     * some Google Form configurations require before accepting a response. We can't read the iframe
     * response (cross-origin), so success is signalled when the iframe fires `load` (Google responded
     * with the confirmation page) within the timeout window.
     */
    function submitToGoogleForms(lead) {
        return new Promise(function(resolve, reject) {
            var name = 'sfabGformSink_' + Math.random().toString(36).slice(2);
            var iframe = document.createElement('iframe');
            iframe.name = name;
            iframe.setAttribute('aria-hidden', 'true');
            iframe.tabIndex = -1;
            iframe.style.cssText =
                'position:absolute!important;left:-10000px!important;top:auto!important;' +
                'width:1px!important;height:1px!important;opacity:0!important;border:0!important;';
            document.body.appendChild(iframe);

            var form = document.createElement('form');
            form.action = GFORM_ACTION;
            form.method = 'POST';
            form.target = name;
            form.acceptCharset = 'UTF-8';
            form.style.display = 'none';

            var fields = {};
            fields[GFORM_FIELDS.firstName] = lead.firstName || '';
            fields[GFORM_FIELDS.lastName] = lead.lastName || '';
            fields[GFORM_FIELDS.email] = lead.email || '';
            fields[GFORM_FIELDS.company] = lead.company || '';
            fields[GFORM_FIELDS.position] = lead.position || '';
            fields[GFORM_FIELDS.sourceUrl] = lead.url || '';
            fields[GFORM_FIELDS.timestamp] = lead.timestamp || new Date().toISOString();
            fields[GFORM_FIELDS.referrer] = lead.referrer || '';
            // honeypot intentionally left blank — only populated by bots that blindly fill every input.
            fields[GFORM_FIELDS.honeypot] = '';

            Object.keys(fields).forEach(function(n) {
                var inp = document.createElement('input');
                inp.type = 'hidden';
                inp.name = n;
                inp.value = fields[n];
                form.appendChild(inp);
            });

            document.body.appendChild(form);

            var settled = false;

            function cleanup() {
                try {
                    if (form.parentNode) form.parentNode.removeChild(form);
                } catch (e) {}
                setTimeout(function() {
                    try {
                        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    } catch (e) {}
                }, 1000);
            }

            function finish(ok) {
                if (settled) return;
                settled = true;
                clearTimeout(to);
                cleanup();
                if (ok) resolve({
                    ok: true
                });
                else reject(new Error('timeout'));
            }

            iframe.addEventListener('load', function() {
                finish(true);
            });
            iframe.addEventListener('error', function() {
                finish(false);
            });

            var to = setTimeout(function() {
                finish(false);
            }, SUBMIT_TIMEOUT_MS);

            try {
                form.submit();
            } catch (eSub) {
                finish(false);
            }
        });
    }

    /** Submit with in-page retries. Calls onOk() on success, onErr() after exhausting attempts. */
    function submitWithRetries(lead, onOk, onErr) {
        var attempt = 0;

        function again() {
            attempt++;
            submitToGoogleForms(lead)
                .then(function() {
                    clearSyncPending();
                    onOk();
                })
                .catch(function() {
                    if (attempt < SUBMIT_MAX_ATTEMPTS) setTimeout(again, SUBMIT_RETRY_DELAY_MS);
                    else onErr();
                });
        }
        again();
    }

    /** On page load, flush any pending submit from a previous session that failed the network. */
    function tryPendingSubmit() {
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
        submitWithRetries(
            lead,
            function() {},
            function() {}
        );
    }

    function onBfCachePageShow(ev) {
        if (!ev || ev.persisted !== true) return;
        if (localStorage.getItem('leadGateSyncPending') === '1') return;
        if (localStorage.getItem('leadGateComplete') !== '1') return;
        setTimeout(function() {
            sfabPostHogCaptureSentThisPage = false;
            identifyPostHogFromLeadGate();
            schedulePostHogIdentifyUntilSent();
        }, 500);
    }

    if (isLocalDevBypass() || window.SFAB_DISABLE_GATE) {
        setTimeout(tryPendingSubmit, 0);
        window.addEventListener('pageshow', onBfCachePageShow, false);
        return;
    }

    if (localStorage.getItem('subscribed') === '1' && localStorage.getItem('leadGateComplete') !== '1') {
        localStorage.setItem('leadGateComplete', '1');
    }

    if (localStorage.getItem('leadGateComplete') === '1') {
        installPostHog();
    }

    if (isNoPopupPage(path)) {
        setTimeout(tryPendingSubmit, 0);
        window.addEventListener('pageshow', onBfCachePageShow, false);
        return;
    }

    if (localStorage.getItem('leadGateComplete') === '1') {
        setTimeout(tryPendingSubmit, 0);
        window.addEventListener('pageshow', onBfCachePageShow, false);
        return;
    }

    var PERSONAL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|mac|mail|proton|protonmail|zoho|yandex|gmx|fastmail|tutanota|hey|pm|cock|airmail|inbox|rocketmail|rediffmail|mailinator|guerrillamail|tempmail|throwaway|10minutemail|sharklasers|guerrillamailblock|grr|dispostable)\./i;

    function validateEmailStructure(emailRaw) {
        var email = emailRaw.trim();
        if (!email) return {
            ok: false,
            msg: 'Enter your work email.'
        };
        var at = email.indexOf('@');
        if (at < 1) return {
            ok: false,
            msg: 'Enter the name and @ before your domain (e.g. you@company.com).'
        };
        if (email.lastIndexOf('@') !== at) return {
            ok: false,
            msg: 'Use exactly one @ in your email address.'
        };
        var local = email.slice(0, at);
        var domain = email.slice(at + 1).trim().toLowerCase();
        if (!domain) return {
            ok: false,
            msg: 'Add the domain after @ (e.g. mongodb.com).'
        };
        if (local.length > 64) return {
            ok: false,
            msg: 'The part before @ is too long (max 64 characters).'
        };
        if (domain.length > 253) return {
            ok: false,
            msg: 'The domain part is too long.'
        };
        if (/\s/.test(email)) return {
            ok: false,
            msg: 'Remove spaces from your email address.'
        };
        if (domain.indexOf('..') !== -1 || domain.startsWith('.') || domain.endsWith('.')) {
            return {
                ok: false,
                msg: 'That domain looks invalid (check dots).'
            };
        }
        if (domain.indexOf('.') === -1) return {
            ok: false,
            msg: 'Use a full domain with a suffix (e.g. company.com).'
        };
        var labels = domain.split('.');
        for (var li = 0; li < labels.length; li++) {
            if (!labels[li] || labels[li].length > 63) return {
                ok: false,
                msg: 'That domain looks invalid.'
            };
        }
        return {
            ok: true,
            email: email,
            domain: domain
        };
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
                    sessionStorage.setItem(cacheKey, JSON.stringify({
                        t: Date.now(),
                        v: out
                    }));
                } catch (eCacheWrite) {}
            }
            return out;
        }

        function doh(name, type) {
            return fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type, {
                headers: {
                    Accept: 'application/dns-json'
                },
                cache: 'no-store',
                credentials: 'omit'
            }).then(function(r) {
                if (!r.ok) throw new Error('skip');
                return r.json();
            });
        }
        return doh(domain, 'MX')
            .then(function(j) {
                if (j.Status === 3) return {
                    ok: false,
                    msg: 'We could not find that domain. Check the spelling after @.'
                };
                if (j.Status !== 0) return {
                    ok: true,
                    skip: true
                };
                if (j.Answer && j.Answer.length > 0) return {
                    ok: true
                };
                return doh(domain, 'A').then(function(ja) {
                    if (ja.Status === 3) return {
                        ok: false,
                        msg: 'We could not find that domain. Check the spelling after @.'
                    };
                    if (ja.Status !== 0) return {
                        ok: true,
                        skip: true
                    };
                    if (ja.Answer && ja.Answer.length > 0) return {
                        ok: true
                    };
                    return {
                        ok: false,
                        msg: 'That domain does not appear set up to receive email. Check the domain after @.'
                    };
                });
            })
            .then(function(out) {
                return Promise.resolve(out).then(cacheDnsResult);
            })
            .catch(function() {
                return {
                    ok: true,
                    skip: true
                };
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
        '.sfab-hp{position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important}' +
        '.sfab-overlay-actions{margin-top:0}' +
        '.sfab-overlay-actions button{width:100%;padding:.8rem 1rem;border:none;border-radius:8px;background:#00ed64;color:#001e2b;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:700;font-size:.9rem;cursor:pointer;transition:background .2s}' +
        '.sfab-overlay-actions button:hover{background:#00c853}' +
        '.sfab-overlay-actions button:disabled{opacity:.65;cursor:not-allowed}' +
        '.sfab-ovl-err{font-size:.8125rem;color:#dc2626;margin:.5rem 0 0}' +
        '.sfab-ovl-success{text-align:center;padding:2rem 1.5rem}' +
        '.sfab-ovl-success p{color:#0f172a}' +
        '.sfab-ovl-success .sfab-ovl-sub{color:#64748b!important}' +
        '@media(max-width:640px){.sfab-eo-inner{grid-template-columns:1fr;min-height:auto}.sfab-eo-art{border-radius:0;min-height:160px;order:-1}.sfab-overlay-card{border-radius:12px}.sfab-overlay-fields{grid-template-columns:1fr}}' +
        '#subscribeFab,.subscribe-fab,button.subscribe-fab{display:none!important;visibility:hidden!important;pointer-events:none!important;clip:rect(0,0,0,0)!important;position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important}';
    document.head.appendChild(css);
    document.documentElement.classList.add('sfab-gate-active');
    lockScroll();

    var wrapper = document.createElement('div');
    wrapper.innerHTML =
        '<div class="sfab-overlay" id="sfabOverlay" role="dialog" aria-modal="true" aria-labelledby="sfabGateTitle">' +
        '<div class="sfab-overlay-card">' +
        '<div class="sfab-eo-inner">' +
        '<div class="sfab-eo-formcol">' +
        '<h3 class="sfab-ovl-title" id="sfabGateTitle">Continue to this page</h3>' +
        '<p class="sfab-ovl-desc">Enter your details to access content. All fields are required.</p>' +
        '<form id="sfabOvlForm" novalidate autocomplete="on">' +
        '<div class="sfab-overlay-fields">' +
        '<label>First name<input type="text" id="sfabFirst" name="firstName" autocomplete="given-name" required placeholder="First name"></label>' +
        '<label>Last name<input type="text" id="sfabLast" name="lastName" autocomplete="family-name" required placeholder="Last name"></label>' +
        '<label class="sfab-span2">Email<input type="email" id="sfabEmail" autocomplete="email" required placeholder="xyz@company.com"></label>' +
        '<label class="sfab-span2">Company<input type="text" id="sfabCompany" name="company" autocomplete="organization" required placeholder="Company"></label>' +
        '<label class="sfab-span2">Position<input type="text" id="sfabPosition" name="position" autocomplete="organization-title" required placeholder="Position"></label>' +
        '</div>' +
        '<div class="sfab-hp" aria-hidden="true">' +
        '<label>Referral code (leave blank)<input type="text" id="sfabHp" name="hp_check" tabindex="-1" autocomplete="off"></label>' +
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

    document.addEventListener(
        'keydown',
        function(e) {
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
        var elHp = document.getElementById('sfabHp');
        if (!overlay || !oForm) return;

        // ── Bot protection instrumentation ──
        var openedAt = Date.now();
        var interactionSignals = {
            keys: 0,
            pastes: 0,
            pointers: 0
        };
        var realFields = [elFirst, elLast, elEmail, elCo, elPos];
        realFields.forEach(function(el) {
            if (!el) return;
            el.addEventListener('keydown', function() {
                interactionSignals.keys++;
            }, {
                passive: true
            });
            el.addEventListener('paste', function() {
                interactionSignals.pastes++;
            }, {
                passive: true
            });
            el.addEventListener('pointerdown', function() {
                interactionSignals.pointers++;
            }, {
                passive: true
            });
        });

        function showErr(msg) {
            oErr.textContent = msg;
            oErr.style.display = 'block';
        }

        function clearErr() {
            oErr.style.display = 'none';
            oErr.textContent = '';
        }

        oForm.addEventListener('submit', function(e) {
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

            // ── Bot protection checks ──
            // 1. Honeypot — if this has any value, silently drop. Show generic error so bots can't learn.
            if (elHp && elHp.value) {
                showErr('Something went wrong. Please try again.');
                return;
            }
            // 2. Minimum dwell time — humans take longer than 2.5s to fill 5 fields.
            if (Date.now() - openedAt < MIN_DWELL_MS) {
                showErr('Something went wrong. Please try again.');
                return;
            }
            // 3. Real interaction required — at least 1 keydown or paste on a real field.
            if (interactionSignals.keys + interactionSignals.pastes < 1) {
                showErr('Something went wrong. Please try again.');
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
                setTimeout(function() {
                    overlay.remove();
                    unlockScroll();
                    document.documentElement.classList.remove('sfab-gate-active');
                }, 900);
            }

            function onSubmitFailure(msg) {
                oBtn.disabled = false;
                oBtn.textContent = 'Submit and continue';
                showErr(msg || 'Could not complete signup. Please try again.');
            }

            verifyDomainAcceptsMail(struct.domain).then(function(dns) {
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
                    url: location.href,
                    timestamp: new Date().toISOString(),
                    referrer: document.referrer || ''
                };

                oBtn.textContent = 'Submitting…';

                submitWithRetries(
                    lead,
                    function() {
                        localStorage.setItem(
                            'leadGateProfile',
                            JSON.stringify({
                                firstName: firstName,
                                lastName: lastName,
                                email: email,
                                company: company,
                                position: position,
                                url: location.href,
                                visitorId: newVisitorId()
                            })
                        );
                        localStorage.setItem('leadGateComplete', '1');
                        localStorage.setItem('subscribed', '1');
                        clearSyncPending();
                        installPostHog();
                        queuePostHogIdentifyAfterSignup();
                        showSuccessAndExit();
                    },
                    function() {
                        // Network failed after retries — persist for next page load and let user continue.
                        markSyncPending(lead);
                        localStorage.setItem(
                            'leadGateProfile',
                            JSON.stringify({
                                firstName: firstName,
                                lastName: lastName,
                                email: email,
                                company: company,
                                position: position,
                                url: location.href,
                                visitorId: newVisitorId()
                            })
                        );
                        localStorage.setItem('leadGateComplete', '1');
                        localStorage.setItem('subscribed', '1');
                        installPostHog();
                        queuePostHogIdentifyAfterSignup();
                        showSuccessAndExit();
                    }
                );
            });
        });

        setTimeout(function() {
            elFirst.focus();
        }, 100);
    })();
})();