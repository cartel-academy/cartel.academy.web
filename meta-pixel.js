/* ============================================================
   META PIXEL — shared across every page (index.html, portal.html,
   mentors.html, tools.html, privacy.html, ceo-message.html). One
   <script src="meta-pixel.js"> include per page, as early in <head> as
   possible (Meta's own recommendation), matched by a literal
   <noscript> fallback pixel <img> in each page's <head> (a <noscript>
   block only has any effect for actual no-JS visitors if it's static
   HTML in the page itself, not injected via this file).

   Loads and tracks unconditionally, no cookie-consent gate — this is a
   deliberate choice (previous revisions of this file gated fbq behind
   a consent banner; that's been removed).

   META_PIXEL_ID is a public identifier (visible in the page source of
   any site running Meta Pixel — not a secret), so it's safe to hardcode
   here the same way SUPABASE_URL/SUPABASE_ANON_KEY are hardcoded in
   app.js.

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

!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', META_PIXEL_ID);
fbq('track', 'PageView');

window.FXCPixel = {
  track(eventName, params){
    if(!window.fbq) return;
    try{ fbq('track', eventName, params || {}); }catch(e){}
  }
};
