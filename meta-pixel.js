/* ============================================================
   META PIXEL — shared across every page (index.html, portal.html,
   mentors.html, tools.html, privacy.html, ceo-message.html). One
   <script src="meta-pixel.js"> include per page, as early in <head> as
   possible (Meta's own recommendation), matched by a literal
   <noscript> fallback pixel <img> right after <body> in each page (a
   <noscript> block only has any effect for actual no-JS visitors if
   it's static HTML in the page itself, not injected via this file; an
   <img> also isn't valid content inside <head>, hence <body>).

   Loads and tracks unconditionally, no cookie-consent gate — this is a
   deliberate choice (previous revisions of this file gated fbq behind
   a consent banner; that's been removed).

   META_PIXEL_ID is a public identifier (visible in the page source of
   any site running Meta Pixel — not a secret), so it's safe to hardcode
   here the same way SUPABASE_URL is hardcoded in app.js. This file is
   standalone (loaded on pages that don't include app.js), so it
   declares its own SUPABASE_URL rather than depending on app.js's copy.

   Every tracked event also gets mirrored server-side via the
   capi-event Edge Function (supabase/functions/capi-event/index.ts),
   using Meta's Conversions API — better match quality against ad
   blockers/Safari ITP than the browser pixel alone, the same outcome
   Meta's separate Conversions API Gateway product provides without
   needing a persistent server this static site doesn't have. The
   browser (fbq) and server (CAPI) calls share one event_id so Meta
   dedupes them into a single event instead of double-counting.

   The actual purchase-confirmation event for paid courses is NOT fired
   from here — see supabase/functions/paymob-webhook/index.ts. That
   function is the only place a payment is ever actually confirmed
   (this site's Paymob integration is webhook-gated, not client-gated),
   so it's the only accurate place to tell Meta a Purchase happened —
   a client-side pixel next to "checkout submitted" would count
   attempts, not completions, and would count them before Paymob has
   even approved the charge. capi-event's own allowlist also refuses to
   relay a "Purchase" event, as a second layer against that.
   ============================================================ */
const META_PIXEL_ID = '1516497466447028';
const SUPABASE_URL = 'https://dyatxhudfbvburljycky.supabase.co';
const CAPI_ENDPOINT = `${SUPABASE_URL}/functions/v1/capi-event`;

!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', META_PIXEL_ID);

function fxcCookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function fxcEventId(){
  return 'fxc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function fxcTrack(eventName, params){
  if(!window.fbq) return;
  const eventId = fxcEventId();
  try{ fbq('track', eventName, params || {}, { eventID: eventId }); }catch(e){}
  // Fire-and-forget — never blocks the UI or throws, matching the
  // try/catch-and-continue pattern the checkout/contact calls in app.js
  // already use for every Supabase Edge Function call.
  try{
    fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: location.href,
        custom_data: params || {},
        fbp: fxcCookie('_fbp'),
        fbc: fxcCookie('_fbc'),
      }),
      keepalive: true,
    }).catch(()=>{});
  }catch(e){}
}

fxcTrack('PageView');

window.FXCPixel = { track: fxcTrack };
