/* ============================================================
   META PIXEL + CONSENT — shared across index.html, portal.html and
   mentors.html. Self-contained: injects its own consent-banner DOM and
   styles, so every page needs only one <script src="meta-pixel.js">
   include, as early in <head> as possible (Meta's own recommendation).

   META_PIXEL_ID is a public identifier (visible in the page source of
   any site running Meta Pixel — not a secret), so it's safe to hardcode
   here the same way SUPABASE_URL/SUPABASE_ANON_KEY are hardcoded in
   app.js. This is FX Cartel Academy's real Pixel ID from Meta Events
   Manager.

   Uses Meta's own Consent Mode (fbq('consent','revoke'/'grant')) rather
   than withholding the base pixel script entirely: fbevents.js loads and
   fbq('init', ...) runs on every page load, immediately preceded by
   fbq('consent','revoke'), so Meta's Events Manager (domain health
   checks, the "Add events" URL scanner, Pixel Helper) can actually see
   the pixel is installed. While revoked, Meta's own SDK guarantees no
   event data is sent and no cookies are set — real tracking only starts
   once fbq('consent','grant') runs, which only happens after a visitor
   accepts the cookie-consent banner below. This keeps the same "no
   tracking without consent" guarantee as before, just via Meta's
   supported mechanism instead of withholding the script outright (which
   made the pixel technically undetectable by Meta's own tooling).

   The actual purchase-confirmation event for paid courses is NOT fired
   from here — see supabase/functions/paymob-webhook/index.ts. That
   function is the only place a payment is ever actually confirmed
   (this site's Paymob integration is webhook-gated, not client-gated),
   so it's the only accurate place to tell Meta a Purchase happened —
   a client-side pixel next to "checkout submitted" would count
   attempts, not completions, and would count them before Paymob has
   even approved the charge.
   ============================================================ */
const META_PIXEL_ID = '1516497466447028';

const FXC_CONSENT_KEY = 'fxc_cookie_consent'; // localStorage: 'accepted' | 'rejected'

let fxcConsentGranted = false;

function fxcInitMetaPixel(){
  if(window.fbq) return;
  !function(f,b,e,v,n,t,s){
    if(f.fbq) return;
    n = f.fbq = function(){ n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if(!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('consent', 'revoke'); // must precede init — blocks all data/cookies until fxcGrantConsent() runs
  fbq('init', META_PIXEL_ID);
}

function fxcGrantConsent(){
  fxcConsentGranted = true;
  fxcInitMetaPixel(); // no-op if already loaded
  fbq('consent', 'grant');
  fbq('track', 'PageView');
}

// Runs unconditionally on every page load — see the Consent Mode note
// above for why this no longer waits for the accept click.
fxcInitMetaPixel();

/* Deliberately no <noscript> fallback pixel — it's a raw <img> request
   with no fbq()/consent involved at all, so it would fire unconditionally
   with no way to gate it on cookie consent, unlike everything above. */
window.FXCPixel = {
  track(eventName, params){
    if(!fxcConsentGranted) return; // visitor hasn't accepted the banner yet
    try{ fbq('track', eventName, params || {}); }catch(e){}
  }
};

/* ---------- Cookie consent banner ----------
   Required before firing any tracking pixel for UK/EU/India visitors
   (this site now markets to Dubai/UK/India/Abu Dhabi). Shown once;
   the choice is remembered in localStorage. Injects its own <style>
   and markup so this file works standalone on any page. */
function fxcShowConsentBanner(){
  if(document.getElementById('fxcConsentBanner')) return;

  const style = document.createElement('style');
  style.textContent = `
#fxcConsentBanner{position:fixed;left:0;right:0;bottom:0;z-index:300;background:linear-gradient(120deg,#000 0%,#1A6D63 55%,#125C53 100%);color:#EAF1EF;padding:16px 20px;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;font-size:13.5px;box-shadow:0 -8px 30px rgba(0,0,0,.35)}
#fxcConsentBanner p{margin:0;max-width:640px;line-height:1.5;color:rgba(234,241,239,.85)}
#fxcConsentBanner a{color:#FCD673}
#fxcConsentBanner .fxc-consent-actions{display:flex;gap:10px;flex-shrink:0}
#fxcConsentBanner button{border:none;cursor:pointer;font-weight:600;font-size:13px;border-radius:8px;padding:10px 16px;font-family:inherit}
#fxcConsentBanner .fxc-accept{background:#FABC14;color:#125C53}
#fxcConsentBanner .fxc-reject{background:transparent;border:1px solid rgba(234,241,239,.3);color:#EAF1EF}
@media(max-width:640px){#fxcConsentBanner{flex-direction:column;text-align:center}#fxcConsentBanner .fxc-consent-actions{justify-content:center;width:100%}#fxcConsentBanner button{flex:1}}
`;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'fxcConsentBanner';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Cookie consent');
  el.innerHTML =
    '<p>We use cookies to measure ad performance and improve the site. See our <a href="privacy.html">Privacy Policy</a>.</p>' +
    '<div class="fxc-consent-actions">' +
      '<button class="fxc-reject" id="fxcConsentReject">Reject</button>' +
      '<button class="fxc-accept" id="fxcConsentAccept">Accept</button>' +
    '</div>';
  document.body.appendChild(el);

  document.getElementById('fxcConsentAccept').addEventListener('click', () => {
    try{ localStorage.setItem(FXC_CONSENT_KEY, 'accepted'); }catch(e){}
    el.remove();
    fxcGrantConsent();
  });
  document.getElementById('fxcConsentReject').addEventListener('click', () => {
    try{ localStorage.setItem(FXC_CONSENT_KEY, 'rejected'); }catch(e){}
    el.remove();
  });
}

(function initFxcConsent(){
  let consent = null;
  try{ consent = localStorage.getItem(FXC_CONSENT_KEY); }catch(e){}
  if(consent === 'accepted'){
    fxcGrantConsent();
  } else if(consent !== 'rejected'){
    const show = () => fxcShowConsentBanner();
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  }
})();
