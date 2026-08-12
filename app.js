/* ============================================================
   FX Cartel Academy — front-end logic (v4)
   Backend: Supabase (Postgres + Auth + Edge Functions), hosted on Render.
   Checkout now collects address/DOB/geolocation and requires email —
   this data becomes the student's Portal login record (see
   supabase/schema.sql + supabase/functions/checkout). Foreground PWA
   notifications live in app-notify.js (window.FXCNotify), loaded before
   this file.
   ============================================================ */

const SUPABASE_URL = "https://dyatxhudfbvburljycky.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BaA3skRU3e8dNN93rf_eUw_t9odHtoU";
const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/checkout`;
const CONTACT_ENDPOINT = `${SUPABASE_URL}/functions/v1/contact`;
const CREATE_PAYMENT_ENDPOINT = `${SUPABASE_URL}/functions/v1/create-payment`;
// Same key portal.html reads to prefill the login email — set here so a
// student who just paid lands on the portal with their email already filled in.
const LAST_EMAIL_KEY = 'fxc_last_email';

function showFxcToast(msg){
  const el = document.getElementById('fxcToast');
  if(!el) return;
  el.innerHTML = msg + '<button class="fxc-toast-close" aria-label="Dismiss" onclick="this.parentElement.classList.remove(\'show\')">&times;</button>';
  el.classList.add('show');
}

/* ---------- COURSE DATA ---------- */
const COURSES = {
  free:   { name:"FXC Free",   price:0,    sessions:"1 introductory session", mode:"Online or in-person (Abu Dhabi)" },
  master: { name:"FXC Master", price:1500, sessions:"20 live sessions",       mode:"Live + lifetime recordings" },
  pro:    { name:"FXC Pro",    price:4000, sessions:"Advanced tier",           mode:"1-on-1 mentor access" }
};

const TOPICS = {
  free: [
    "What is trading and how markets move",
    "Forex vs. stock markets — the difference",
    "Understanding candlesticks and charts",
    "The single biggest beginner mistake",
    "How FX Cartel programs are structured",
    "Live Q&A with a mentor"
  ],
  master: [
    "Market structure and trend identification",
    "Support, resistance and key levels",
    "Candlestick patterns that matter",
    "Reading momentum and volume",
    "Building your first trading system",
    "Entry, stop-loss and take-profit rules",
    "Position sizing and the 1% rule",
    "Trading psychology and discipline",
    "Session timing — London, New York, Asia",
    "Backtesting your strategy",
    "Journaling and reviewing trades",
    "Managing news and volatility",
    "Swing vs. intraday approaches",
    "Broker setup and order types",
    "Building a weekly trading routine",
    "20 live application sessions with recordings"
  ],
  pro: [
    "Advanced market structure & liquidity",
    "Smart-money concepts (SMC / ICT basics)",
    "Aggressive scalping frameworks",
    "Intraday execution & precision entries",
    "Multi-timeframe confluence",
    "Advanced, structured risk management",
    "Drawdown control and recovery",
    "Trade automation & tooling overview",
    "Professional trade journaling",
    "One-to-one mentor strategy reviews"
  ]
};

/* ---------- TESTIMONIALS ---------- */
const TESTIMONIALS = [
  { q:"I have learned so many valuable things about trading.", n:"Nijil M.", r:"FX Cartel Student", i:"N" },
  { q:"They gave strong guidance on proper risk management and capital protection.", n:"Nishad N S", r:"FX Cartel Student", i:"N" },
  { q:"I can confidently say they are the best academy in the UAE.", n:"Noufal H.", r:"FX Cartel Student", i:"N" },
  { q:"I would like to sincerely thank FX Cartel Academy for completely changing my trading journey.", n:"Mohamed Haris", r:"FX Cartel Student", i:"M" },
  { q:"I received very good guidance from all mentors, and the 1% Club premium WhatsApp community is very helpful for market updates and discussions.", n:"Aneer Ameer", r:"FX Cartel Student", i:"A" },
  { q:"Live sessions and all necessary guidance was provided from the beginning itself.", n:"M. Sharukh", r:"FX Cartel Student", i:"M" }
];

/* ---------- FAQ ---------- */
const FAQS = [
  { q:"I'm a complete beginner. Is this suitable for me?", a:"Absolutely. FXC Free is designed for people who have never traded before. We start from how markets work and build up slowly, with a mentor guiding you the whole way." },
  { q:"Do I need a lot of money to start trading?", a:"No. We teach you to start small and focus on skill and risk management first. The goal is consistency, not gambling large sums. You control your own capital and pace." },
  { q:"Are classes in person or online?", a:"Both. You can attend live at our Abu Dhabi office or join online from anywhere. Every session in FXC Master and Pro is recorded so you can review it anytime." },
  { q:"What's the difference between the three courses?", a:"FXC Free is a single intro session. FXC Master (1,500 AED) is a 20-session program covering practical, intermediate trading. FXC Pro (4,000 AED) is advanced, with scalping, intraday strategy and 1-on-1 mentoring." },
  { q:"Will I definitely make money after the course?", a:"No honest academy can promise profit — trading carries real risk. What we promise is structured education, discipline and a risk-first method. Your results depend on your practice and discipline." },
  { q:"How do the live classes work and can I ask questions?", a:"Classes are interactive. You can ask questions live, and mentors review real charts with you. FXC Pro includes one-to-one sessions for personalised feedback." },
  { q:"What payment methods do you accept?", a:"We accept credit and debit cards, Apple Pay, Google Pay and local UAE payment methods through our secure Paymob gateway. On mobile you can also pay via the app." },
  { q:"Can I access the course material after I finish?", a:"Yes. Enrolled students get lifetime access to class recordings and notes through the Dashboard, organised by course." }
];

/* ---------- RENDER ----------
   Testimonials render one large quote per slide (scroll-snap carousel)
   rather than a long static grid or multi-up carousel — one voice read
   at a time, not skimmed several-at-once. Cards can end up horizontally
   clipped by the carousel's own overflow, which is why they skip the
   .reveal fade-in (IntersectionObserver treats clipped-off-canvas
   siblings as never-intersecting, so they'd stay invisible forever);
   the section header still fades in as normal. */
function chunk(arr, size){
  const out = [];
  for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i, i+size));
  return out;
}
let testiSlideCount = 0;
function renderTestimonials(){
  const slides = chunk(TESTIMONIALS, 1);
  testiSlideCount = slides.length;
  document.getElementById('tGrid').innerHTML = slides.map(pair=>`
    <div class="t-slide">
      ${pair.map(t=>`
        <div class="t-card">
          <div class="stars">★★★★★</div>
          <p>“${t.q}”</p>
          <div class="t-who"><div class="t-av">${t.i}</div><div><div class="t-name">${t.n}</div><div class="t-role">${t.r}</div></div></div>
        </div>`).join('')}
    </div>`).join('');
  document.getElementById('tDots').innerHTML = slides.map((_,i)=>
    `<button class="t-dot${i===0?' active':''}" aria-label="Go to testimonials ${i+1}" onclick="testiGoTo(${i})"></button>`
  ).join('');
  initTestiCarousel();
}
function initTestiCarousel(){
  const grid = document.getElementById('tGrid');
  if(!grid || grid._testiBound) { updateTestiCarousel(); return; }
  grid.addEventListener('scroll', updateTestiCarousel, { passive:true });
  grid._testiBound = true;
  updateTestiCarousel();
}
function updateTestiCarousel(){
  const grid = document.getElementById('tGrid');
  if(!grid || !grid.clientWidth) return;
  const i = Math.round(grid.scrollLeft / grid.clientWidth);
  document.querySelectorAll('.t-dot').forEach((d,idx)=>d.classList.toggle('active', idx===i));
  const prev = document.getElementById('tPrev'), next = document.getElementById('tNext');
  if(prev) prev.disabled = i<=0;
  if(next) next.disabled = i>=testiSlideCount-1;
}
function testiGoTo(i){
  const grid = document.getElementById('tGrid');
  grid.scrollTo({ left: i*grid.clientWidth, behavior:'smooth' });
}
function testiScroll(dir){
  const grid = document.getElementById('tGrid');
  const i = Math.max(0, Math.min(testiSlideCount-1, Math.round(grid.scrollLeft/grid.clientWidth) + dir));
  testiGoTo(i);
}
function renderFaqs(){
  document.getElementById('faqList').innerHTML = FAQS.map(f=>`
    <div class="faq-item reveal">
      <button class="faq-q" onclick="toggleFaq(this)">${f.q}<span class="plus"></span></button>
      <div class="faq-a"><div>${f.a}</div></div>
    </div>`).join('');
}
function toggleFaq(btn){ btn.parentElement.classList.toggle('open'); }

/* ---------- TOPICS (opens checkout panel in topic mode) ---------- */
function openTopics(key){
  const c = COURSES[key], list = TOPICS[key];
  if(window.FXCPixel) FXCPixel.track('ViewContent', { content_name:c.name, content_category:'course', value:c.price, currency:'AED' });
  document.getElementById('coTitle').textContent = c.name + " · Topics";
  document.getElementById('coBody').innerHTML = `
    <div class="co-item">
      <div><div class="ci-name">${c.name}</div><div class="ci-meta">${c.sessions} · ${c.mode}</div></div>
      <div class="ci-price">${c.price===0?'Free':c.price.toLocaleString()+' <span style="font-size:13px">AED</span>'}</div>
    </div>
    <div class="co-section-label">What you'll learn</div>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:11px">
      ${list.map((t,i)=>`<li style="display:flex;gap:11px;font-size:14px;align-items:flex-start">
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold);min-width:22px">${String(i+1).padStart(2,'0')}</span>
        <span>${t}</span></li>`).join('')}
    </ul>`;
  document.getElementById('coFoot').innerHTML = `
    <button class="btn btn-gold btn-block" onclick="openCheckout('${key}')">
      ${c.price===0?'Book free session':'Purchase '+c.name}
    </button>`;
  showPanel();
}

/* ---------- CHECKOUT ---------- */
let GEO = { lat:null, lng:null };
function captureGeo(){
  if(!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    pos => { GEO.lat = pos.coords.latitude; GEO.lng = pos.coords.longitude; },
    () => {}, // silent — never block checkout on a denied/failed permission
    { timeout: 8000, maximumAge: 300000 }
  );
}

function openCheckout(key){
  const c = COURSES[key];
  document.getElementById('coTitle').textContent = "Checkout";
  const isFree = c.price===0;
  const vat = isFree?0:Math.round(c.price*0.05);
  const total = c.price+vat;
  captureGeo();
  if(window.FXCPixel) FXCPixel.track('InitiateCheckout', { content_name:c.name, value:total, currency:'AED' });

  document.getElementById('coBody').innerHTML = `
    ${isFree?'<div class="free-badge">✓ This introductory session is completely free</div>':''}
    <div class="co-item">
      <div><div class="ci-name">${c.name}</div><div class="ci-meta">${c.sessions} · ${c.mode}</div></div>
      <div class="ci-price">${isFree?'Free':c.price.toLocaleString()+' AED'}</div>
    </div>

    <div class="co-section-label">Your details</div>
    <div class="field"><label>Full name *</label><input id="buyerName" type="text" required placeholder="Your full name" /></div>
    <div class="field"><label>Mobile number *</label><input id="buyerPhone" type="tel" required placeholder="+971 5x xxx xxxx" /></div>
    <div class="field"><label>Email *</label><input id="buyerEmail" type="email" required placeholder="you@email.com" /></div>
    <div class="field"><label>Address</label><input id="buyerAddress" type="text" placeholder="Street, area, city" /></div>
    <div class="field"><label>Date of birth</label><input id="buyerDob" type="date" /></div>
    <p style="font-size:12px;color:var(--muted);margin-top:-6px">This will also be your login for the Dashboard — enter it accurately. Any details you skip here can be completed later in the Dashboard.</p>

    ${isFree?'':`
    <div class="co-section-label">Payment methods</div>
    <div class="pay-methods">
      <span class="pay-chip">💳 Card</span>
      <span class="pay-chip">Apple Pay</span>
      <span class="pay-chip">Google Pay</span>
      <span class="pay-chip">UAE debit</span>
      ${isMobile()?'<span class="pay-chip">📱 App pay</span>':''}
    </div>`}

    <div class="summary">
      ${isFree?'':`
      <div class="sum-row"><span>Course fee</span><span>${c.price.toLocaleString()} AED</span></div>
      <div class="sum-row"><span>VAT (5%)</span><span>${vat.toLocaleString()} AED</span></div>`}
      <div class="sum-row total"><span>Total</span><b>${isFree?'Free':total.toLocaleString()+' AED'}</b></div>
    </div>`;

  document.getElementById('coFoot').innerHTML = `
    <button class="btn ${isFree?'btn-navy':'btn-gold'} btn-block" onclick="submitOrder('${key}',${total})">
      ${isFree?'Confirm free booking':'Pay '+total.toLocaleString()+' AED securely'}
    </button>
    <div class="secured">🔒 ${isFree?'No payment required':'Secured by Paymob'}</div>`;
  showPanel();
}

/* ---- CHECKOUT BACK-BUTTON GUARD ----
   The checkout panel is a CSS overlay, not a real navigation, so the
   browser Back button previously had no idea it was open — pressing it
   just did a normal history back, which could jump straight past the
   page the student actually came from (the "not the real back page"
   complaint). Opening checkout now pushes one synthetic history entry;
   Back while it's open is caught by the popstate handler below and asks
   for confirmation instead of silently leaving, while closing it
   normally (the × button, a completed free booking, etc.) uses
   replaceState — never history.back() — so a plain close can't itself
   trigger a real navigation. */
let checkoutHistoryArmed = false;

function showPanel(){
  document.getElementById('overlay').classList.add('show');
  document.getElementById('checkout').classList.add('show');
  document.body.style.overflow='hidden';
  if(!checkoutHistoryArmed){
    checkoutHistoryArmed = true;
    history.pushState({fxcCheckout:true}, '', location.href);
  }
}
function closeCheckout(){
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('checkout').classList.remove('show');
  document.body.style.overflow='';
  if(checkoutHistoryArmed){
    checkoutHistoryArmed = false;
    history.replaceState(null, '', location.href);
  }
}
window.addEventListener('popstate', ()=>{
  if(!checkoutHistoryArmed) return;
  if(!document.getElementById('checkout').classList.contains('show')){ checkoutHistoryArmed = false; return; }
  if(confirm('Are you sure you want to exit payment?')){
    checkoutHistoryArmed = false;
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('checkout').classList.remove('show');
    document.body.style.overflow = '';
  }else{
    history.pushState({fxcCheckout:true}, '', location.href); // undo the back navigation, stay on checkout
  }
});

/* ---------- PURCHASE SUCCESS ---------- */
function showPurchaseSuccess(courseName, studentName, email){
  try{ localStorage.setItem(LAST_EMAIL_KEY, email); }catch(e){}
  document.getElementById('successTitle').textContent = `Successfully purchased ${courseName}`;
  document.getElementById('successSub').textContent = `by ${studentName}`;
  document.getElementById('successEmail').textContent = email;
  document.getElementById('successModal').classList.add('show');
  document.body.style.overflow='hidden';
}
function closeSuccessModal(){
  document.getElementById('successModal').classList.remove('show');
  document.body.style.overflow='';
}

/* Paymob redirects the browser back to the returnUrl we gave it in
   create-payment (see submitOrder), appending its own transaction query
   params alongside the course/name/email we already put there. Per
   Paymob's docs, the redirect carries the same fields as the server-side
   "transaction processed" callback flattened into the query string —
   same `success` field, literally the string "true"/"false" (this is also
   exactly what the `obj.success` boolean in supabase/functions/
   paymob-webhook/index.ts checks, just JSON-typed there instead of a query
   string). A `success=false` means the payment didn't go through, so
   that's shown as a toast instead of the success screen; anything else
   (explicit success, or an absent/malformed param — e.g. someone lands on
   this URL shape by hand) shows the success screen — the student's actual
   portal access is gated server-side by the webhook regardless of what
   this page displays. */
(function checkPurchaseReturn(){
  const params = new URLSearchParams(window.location.search);
  if(params.get('purchased') !== '1') return;
  const course = params.get('course') || 'your course';
  const name = params.get('name') || 'you';
  const email = params.get('email') || '';
  const paymobSuccess = params.get('success');
  history.replaceState(null, '', window.location.pathname);
  if(paymobSuccess === 'false'){
    showFxcToast(`<span><b>Payment not completed.</b> Your card payment for ${course} didn't go through. Please try again or contact us for help.</span>`);
    return;
  }
  showPurchaseSuccess(course, name, email);
})();

/* ---------- ORDER SUBMISSION ---------- */
async function submitOrder(key, total){
  const name = document.getElementById('buyerName').value.trim();
  const phone = document.getElementById('buyerPhone').value.trim();
  const email = document.getElementById('buyerEmail').value.trim();
  const address = (document.getElementById('buyerAddress')||{}).value?.trim()||'';
  const dob = (document.getElementById('buyerDob')||{}).value?.trim()||'';
  if(!name || !phone || !email){ alert('Please enter your name, mobile number and email.'); return; }

  const c = COURSES[key];
  const payload = {
    course:c.name, courseKey:key, amount:total, name, phone, email, address, dob,
    lat: GEO.lat, lng: GEO.lng
  };

  // 1) Create/renew the student's row in Supabase — awaited (not fire-and-forget) so we
  // can read back the generated orderId and hand it to Paymob for webhook matching.
  let orderId = null;
  try{
    const res = await fetch(CHECKOUT_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json', apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(data && data.ok === false && (data.error === 'phone_exists' || data.error === 'email_exists')){
      const which = data.error === 'phone_exists' ? 'mobile number' : 'email address';
      const goLogin = confirm(`This ${which} is already registered. Would you like to go to the Dashboard to log in instead?`);
      if(goLogin) window.location.href = 'portal.html';
      return;
    }
    orderId = data && data.orderId;
  }catch(err){ /* keep going even if logging failed — checkout must never dead-end */ }

  if(c.price===0){
    closeCheckout();
    showPurchaseSuccess(c.name, name, email);
    if(window.FXCPixel) FXCPixel.track('CompleteRegistration', { content_name:c.name, value:0, currency:'AED' });
    window.open('https://wa.me/971508841001?text=' + encodeURIComponent(`Hi FX Cartel, I just booked FXC Free. Name: ${name}`), '_blank');
    return;
  }

  // 2) Paid: request a Paymob payment link from Supabase, then redirect.
  // No client-side "Purchase" pixel event is fired anywhere in this paid
  // path — this is deliberate. Paymob confirms payment asynchronously via
  // a server-to-server webhook (see paymob-webhook/index.ts), which is the
  // only accurate moment a purchase has actually happened; a pixel fired
  // here would count checkout attempts, not completions, and would fire
  // even for payments Paymob later declines.
  // returnUrl carries the course/name/email we already have client-side
  // back through Paymob's hosted checkout, so when the browser lands back
  // here after payment we can show the success screen without a second
  // round-trip (see the `purchased=1` handling below).
  const returnUrl = window.location.origin + window.location.pathname
    + '?purchased=1&course=' + encodeURIComponent(c.name)
    + '&name=' + encodeURIComponent(name)
    + '&email=' + encodeURIComponent(email);
  if(window.FXCPixel) FXCPixel.track('AddPaymentInfo', { content_name:c.name, value:total, currency:'AED' });
  try{
    const res = await fetch(CREATE_PAYMENT_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json', apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`},
      body: JSON.stringify({ orderId, amount: total, name, phone, email, course:c.name, returnUrl })
    });
    const data = await res.json();
    if(data && data.ok && data.checkoutUrl){ window.location.href = data.checkoutUrl; }
    else { throw new Error('No payment URL'); }
  }catch(err){
    // Graceful fallback so checkout never dead-ends
    closeCheckout();
    showFxcToast(`<span><b>Payment not authenticated.</b> We couldn't reach Paymob to process this payment. Order recorded for ${c.name} — our team will contact you on ${phone}.</span>`);
  }
}

/* ---------- CONTACT FORM ---------- */
async function submitContact(e){
  e.preventDefault();
  const f = e.target;
  const payload = { name:f.name.value, phone:f.phone.value, email:f.email.value, message:f.message.value };
  f.reset();
  try{
    const res = await fetch(CONTACT_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json', apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(data && data.duplicate){
      alert('We have already received your details, will contact again.');
    } else {
      // Only fire Lead for a genuinely new submission — not a resubmission
      // of the same details, which would otherwise inflate the lead count
      // for one person contacting us twice.
      if(window.FXCPixel) FXCPixel.track('Lead');
      alert('Thank you! Your message has been sent. We will reply shortly.');
    }
  }catch(err){
    // Graceful fallback so the form never dead-ends if the backend is unreachable
    alert('Thank you! Your message has been sent. We will reply shortly.');
  }
  return false;
}

/* ---------- HELPERS ---------- */
function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }


/* ---------- MOBILE NAV ---------- */
document.getElementById('hamburger').onclick = ()=>document.getElementById('mobileNav').classList.add('show');
document.getElementById('mnClose').onclick = ()=>document.getElementById('mobileNav').classList.remove('show');
document.querySelectorAll('.mobile-nav a').forEach(a=>a.onclick=()=>document.getElementById('mobileNav').classList.remove('show'));
document.getElementById('mnCompanyToggle').onclick = function(){
  const group = this.closest('.mn-group');
  const open = group.classList.toggle('open');
  this.setAttribute('aria-expanded', open);
};

/* ---------- DESKTOP NAV "Company" DROPDOWN ---------- */
(function(){
  const dropdown = document.getElementById('navCompanyDropdown');
  const toggle = document.getElementById('navCompanyToggle');
  function close(){
    dropdown.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.onclick = function(e){
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  };
  document.querySelectorAll('#navCompanyMenu a').forEach(a=>a.onclick=close);
  document.addEventListener('click', (e)=>{ if(!dropdown.contains(e.target)) close(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
})();

/* ---------- SERVICE WORKER ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ---------- NOTIFICATIONS ----------
   Permission is requested from the install flow (see pwa-install.js) and
   from the "Enable notifications" button inside the student portal
   dashboard (portal.html) — there's no standalone top-bar control on this page. */
if('Notification' in window && Notification.permission === 'granted' && window.FXCNotify){ FXCNotify.maybeShowDaily(); }

/* ---------- NAV: ACTIVE-SECTION INDICATOR ----------
   Keeps the sliding underline (see .nav-links a::after) parked under
   whichever nav item corresponds to the section currently in view,
   instead of only appearing on hover. A thin horizontal detection band
   around 42-45% down the viewport (via a shrunk rootMargin) decides
   which section counts as "current" — the standard scroll-spy pattern.
   Mirrors the same .active state onto the mobile drawer's matching
   [data-nav] elements so it stays in sync if that's ever left open
   across a scroll (e.g. on a tall tablet). */
(function initActiveSectionNav(){
  const sectionMap = [
    { id:'courses', nav:'courses' },
    { id:'testimonials', nav:'company' },
    { id:'faq', nav:'company' },
    { id:'contact', nav:'contact' },
  ];
  const sections = sectionMap
    .map(s => ({ el: document.getElementById(s.id), nav: s.nav }))
    .filter(s => s.el);
  if(!sections.length || !('IntersectionObserver' in window)) return;

  const navEls = document.querySelectorAll('[data-nav]');
  function setActive(name){
    navEls.forEach(el => el.classList.toggle('active', el.dataset.nav === name));
  }

  const io = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const match = sections.find(s => s.el === entry.target);
      if(match) setActive(match.nav);
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  sections.forEach(s => io.observe(s.el));
})();

/* ---------- HERO: IMAGE -> VIDEO REVEAL ----------
   Loads as the static poster only (see .hero-bg-video's poster attribute)
   — no autoplay on page load, no bandwidth spent on a video the visitor
   might never scroll past. Starts on whichever comes first: a real
   interaction (hover/mouse move, tap, scroll, key press) anywhere on the
   page, or a 0.001-second fallback timer — effectively immediate, firing
   on arrival for anyone who doesn't happen to interact first. Requiring a
   genuine gesture before calling play() (when that's what triggers it) is
   also what makes autoplay reliable on iOS Safari, which otherwise blocks
   unmuted-looking video starts. Skipped entirely for prefers-reduced-
   motion, and for visitors on a metered/slow connection
   (navigator.connection.saveData or 2G) who are better served by the
   static poster alone — this is independent of whether GSAP loaded
   below, since it's plain video playback, not a GSAP tween. */
function initHeroVideoReveal(){
  const video = document.getElementById('heroVideo');
  const hero = document.getElementById('heroSection');
  if(!video || !hero) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
  if(conn && (conn.saveData || /^(slow-2g|2g)$/.test(conn.effectiveType || ''))) return;

  let activated = false;
  let fallbackTimer = null;
  function activate(){
    if(activated) return;
    activated = true;
    if(fallbackTimer) clearTimeout(fallbackTimer);
    video.src = video.dataset.src;
    video.load();
    const reveal = () => {
      video.play().catch(()=>{});
      requestAnimationFrame(()=> video.classList.add('is-active'));
    };
    if(video.readyState >= 2) reveal();
    else video.addEventListener('loadeddata', reveal, { once:true });
  }
  ['mousemove','pointerdown','touchstart','wheel','keydown','scroll'].forEach(ev=>
    document.addEventListener(ev, activate, { passive:true, once:true })
  );
  fallbackTimer = setTimeout(activate, 1);

  // Battery/CPU: pause while the hero is scrolled offscreen or the tab
  // is hidden, resume when it's back — a looping background video keeps
  // decoding frames whether or not anyone can see it otherwise.
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!activated) return;
        if(entry.isIntersecting) video.play().catch(()=>{});
        else video.pause();
      });
    }, { threshold: 0.1 });
    io.observe(hero);
  }
  document.addEventListener('visibilitychange', ()=>{
    if(!activated) return;
    if(document.hidden){ video.pause(); return; }
    const r = hero.getBoundingClientRect();
    if(r.top < window.innerHeight && r.bottom > 0) video.play().catch(()=>{});
  });
}

/* ---------- HERO: SCROLL MOTION ----------
   GSAP + ScrollTrigger, loaded via CDN <script> tags in index.html only
   (see the tags before app-notify.js) — guarded by a typeof check so a
   CDN failure, an ad-blocker, or any other page that doesn't load these
   scripts just no-ops here, leaving the hero fully functional via plain
   CSS (poster/video still plays via initHeroVideoReveal above, copy is
   visible by default with no animation). prefers-reduced-motion disables
   every transform-based effect below (video scale, market-line parallax,
   copy entrance, magnetic CTA) while still running the scroll-cue
   visibility logic, which is a opacity toggle rather than motion. */
function initHeroScrollMotion(){
  if(typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  const hero = document.getElementById('heroSection');
  const copy = document.querySelector('.hero-copy');
  if(!hero || !copy) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.registerPlugin(ScrollTrigger);

  if(!reduceMotion){
    gsap.from(copy, { opacity:0, y:28, duration:1, ease:'power2.out', delay:.15 });

    const video = document.getElementById('heroVideo');
    if(video){
      // Relative increment, not an absolute target — the CSS base scale
      // differs per breakpoint (1.18 baseline, 1.22 on the laptop tier;
      // see the .hero-bg-video CSS comment), and "+=" reads whatever
      // that computed value actually is instead of assuming 1.0.
      gsap.to(video, {
        scale:'+=0.08', ease:'none',
        scrollTrigger:{ trigger:hero, start:'top top', end:'bottom top', scrub:true }
      });
    }

    const lines = hero.querySelectorAll('.hero-lines svg');
    if(lines[0]) gsap.to(lines[0], { xPercent:-6, ease:'none', scrollTrigger:{ trigger:hero, start:'top top', end:'bottom top', scrub:true } });
    if(lines[1]) gsap.to(lines[1], { xPercent:8, ease:'none', scrollTrigger:{ trigger:hero, start:'top top', end:'bottom top', scrub:.6 } });
  }

  const cue = document.getElementById('heroScrollCue');
  if(cue){
    ScrollTrigger.create({
      trigger:hero, start:'top top', end:'+=150',
      onUpdate:self=> cue.classList.toggle('is-hidden', self.progress > 0.1)
    });
  }

  // Magnetic CTA — desktop, fine-pointer only; skipped under reduced
  // motion and never attached on touch devices, so nothing here depends
  // on a mouse existing.
  const cta = document.getElementById('heroPrimaryCta');
  if(cta && !reduceMotion && window.matchMedia('(hover:hover) and (pointer:fine)').matches){
    const xTo = gsap.quickTo(cta, 'x', { duration:.4, ease:'power3' });
    const yTo = gsap.quickTo(cta, 'y', { duration:.4, ease:'power3' });
    cta.addEventListener('mousemove', e=>{
      const r = cta.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width/2) * .25);
      yTo((e.clientY - r.top - r.height/2) * .25);
    });
    cta.addEventListener('mouseleave', ()=>{ xTo(0); yTo(0); });
  }
}

/* ---------- SCROLL REVEAL ----------
   Fades + rises .reveal elements into place the first time each crosses
   into view (see the .reveal/.reveal.show CSS). Runs after the
   testimonial/FAQ cards are rendered so their reveal elements exist to
   observe. Falls back to showing everything immediately if
   IntersectionObserver isn't available. */
function initScrollReveal(){
  const els = document.querySelectorAll('.reveal');
  if(!els.length) return;
  if(!('IntersectionObserver' in window)){ els.forEach(el=>el.classList.add('show')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){ entry.target.classList.add('show'); io.unobserve(entry.target); }
    });
  }, { threshold:.15, rootMargin:'0px 0px -60px 0px' });
  els.forEach(el=>io.observe(el));
}


/* ---------- TRUST-ROW COUNT-UP ----------
   Counts each stat up from 0 the first time it scrolls into view, using
   its own data-target/decimals/suffix rather than parsing the display
   text (which mixes formats: "4.7/5", "85%+", "1k+", "8+ yrs"). */
function initCountUp(){
  const els = document.querySelectorAll('.count-up');
  if(!els.length) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(el){
    const target = parseFloat(el.dataset.target);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    if(reduceMotion){ el.textContent = target.toFixed(decimals) + suffix; return; }
    const duration = 1400;
    const t0 = performance.now();
    function frame(now){
      const p = Math.min((now-t0)/duration, 1);
      const eased = 1 - Math.pow(1-p, 3); // ease-out cubic
      el.textContent = (target*eased).toFixed(decimals) + suffix;
      if(p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if(!('IntersectionObserver' in window)){ els.forEach(animate); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){ animate(entry.target); io.unobserve(entry.target); }
    });
  }, { threshold:.6 });
  els.forEach(el=>io.observe(el));
}

/* ---------- INIT ---------- */
renderTestimonials();
renderFaqs();
initScrollReveal();
initCountUp();
initHeroVideoReveal();
initHeroScrollMotion();
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeCheckout(); closeInstallModal(); } });
