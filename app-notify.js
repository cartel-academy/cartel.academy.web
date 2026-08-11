/* ============================================================
   FX Cartel Academy — foreground PWA notifications
   Shared by index.html and portal.html.

   These are local notifications (Notification API + service worker
   showNotification), triggered only while the app is open/foregrounded —
   there is no Web Push/VAPID backend, so nothing fires while the app is
   fully closed. Each notification type is gated to at most once per
   calendar day via localStorage so a visit never gets spammed.
   ============================================================ */
(function(){
  const PREFIX = 'fxc_notify_';

  function todayKey(name){ return PREFIX + name + '_' + new Date().toISOString().slice(0,10); }
  function shownToday(name){ return !!localStorage.getItem(todayKey(name)); }
  function markShownToday(name){ localStorage.setItem(todayKey(name), '1'); }

  async function show(title, body, tag){
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    try{
      if('serviceWorker' in navigator){
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, { body, tag, icon:'icons/icon-192.png', badge:'icons/icon-192.png' });
      }else{
        new Notification(title, { body });
      }
    }catch(e){ /* notifications are a nice-to-have — never break the page over this */ }
  }

  async function requestPermission(){
    if(!('Notification' in window)) return 'unsupported';
    if(Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
    return await Notification.requestPermission();
  }

  function maybeShowDaily(){
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(shownToday('daily')) return;
    markShownToday('daily');
    show('FX Cartel Academy', "Today's a good day to review a lesson or catch a live class. Open the app to continue.", 'fxc-daily');
  }

  function maybeShowMarketUpdate(pair, pct, up){
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(shownToday('market')) return;
    markShownToday('market');
    show('Market update (illustrative)', `${pair} moved ${up?'+':''}${pct}% — illustrative animation, not live trading data.`, 'fxc-market');
  }

  function incompleteCourse(docs, done){
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(!docs || !docs.length) return;
    const doneCount = docs.filter(d => done && done[d.id]).length;
    if(doneCount >= docs.length) return;
    if(shownToday('incomplete')) return;
    markShownToday('incomplete');
    show('Pick up where you left off', `You've completed ${doneCount}/${docs.length} topics. Jump back into your course material.`, 'fxc-incomplete');
  }

  window.FXCNotify = { requestPermission, maybeShowDaily, maybeShowMarketUpdate, incompleteCourse };
})();
