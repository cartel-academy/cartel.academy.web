/* ============================================================
   PWA INSTALL — shared by every page that has an install button.
   Currently that's just the header icon button on portal.html
   (installBtnPortal) — the marketing homepage shows no install
   prompting at all anymore, since the app is meant to be installed
   from the student portal, which is also what the PWA opens to (see
   manifest.webmanifest's start_url).

   Safari (iPhone/iPad/Mac) never fires beforeinstallprompt — there's no
   native install prompt to trigger there. Instead we show real
   step-by-step instructions for the manual Share-menu flow those
   platforms actually use. openInstallModal/closeInstallModal expect the
   #installModal markup (backdrop + title + steps list) to exist on the
   page; harmless no-ops if a page doesn't have it.
   ============================================================ */
const INSTALL_BUTTON_IDS = ['installBtnPortal'];

let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; });

function isIOSDevice(){
  const ua = navigator.userAgent;
  const iOSByUA = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const iPadAsMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS Safari reports as "Macintosh"
  return iOSByUA || iPadAsMac;
}
function isMacSafariDevice(){
  const ua = navigator.userAgent;
  const isMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints <= 1;
  const isSafari = /^((?!chrome|crios|fxios|edg|android).)*safari/i.test(ua);
  return isMac && isSafari;
}
function openInstallModal(kind){
  const titleEl = document.getElementById('installModalTitle');
  const stepsEl = document.getElementById('installModalSteps');
  const modalEl = document.getElementById('installModal');
  if(!titleEl || !stepsEl || !modalEl) return;
  const steps = kind === 'ios' ? [
    "Tap the <b>Share</b> icon (square with an arrow) in Safari's toolbar.",
    'Scroll down and tap <b>Add to Home Screen</b>.',
    'Tap <b>Add</b> in the top-right corner.'
  ] : [
    "Click the <b>Share</b> icon in Safari's toolbar (or open the <b>File</b> menu).",
    'Choose <b>Add to Dock</b>.',
    'Click <b>Add</b> to confirm.'
  ];
  titleEl.textContent = kind === 'ios' ? 'Install on iPhone/iPad' : 'Install on Mac';
  stepsEl.innerHTML = steps.map((s,i)=>`<li><span class="step-num">${i+1}</span><span>${s}</span></li>`).join('');
  modalEl.classList.add('show');
  document.body.style.overflow='hidden';
}
function closeInstallModal(){
  const modalEl = document.getElementById('installModal');
  if(modalEl) modalEl.classList.remove('show');
  document.body.style.overflow='';
}

async function triggerInstall(e){
  if(e) e.preventDefault();
  if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; }
  else if(isIOSDevice()){ openInstallModal('ios'); }
  else if(isMacSafariDevice()){ openInstallModal('mac'); }
  else { alert('To install: open your browser menu and choose "Add to Home Screen".'); }
  if(window.FXCNotify) await FXCNotify.requestPermission();
}
INSTALL_BUTTON_IDS.forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('click', triggerInstall);
});

/* Once installed (mobile or desktop), there's nothing left to "download" —
   hide the install button. Only applies to the installed app view; a
   normal browser tab keeps it. */
const isStandalonePwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
if(isStandalonePwa){
  INSTALL_BUTTON_IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
}
