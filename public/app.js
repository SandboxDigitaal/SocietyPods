/* API adapter for the supplied Stitch screen. Layout and components remain source-owned. */
(() => {
  const state = { token: null, resident: null, kids: [], pods: [], alerts: [], profile: null, schedule: [], activeTab: 'dashboard' };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const show = (id, visible) => $(id)?.classList.toggle('hidden', !visible);
  const toast = (message, error = false) => {
    const box = $('toast-notification');
    if (!box) return;
    $('toast-message').textContent = message;
    box.classList.remove('hidden', 'bg-emerald-600', 'bg-red-600');
    box.classList.add(error ? 'bg-red-600' : 'bg-emerald-600');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.add('hidden'), 3500);
  };
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const response = await fetch(path, { ...options, headers });
    const body = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'Request failed.');
    return body;
  }
  function renderChildren() {
    $('children-count-badge').textContent = state.kids.length + (state.kids.length === 1 ? ' Child Registered' : ' Kids Registered');
    $('children-list-container').innerHTML = state.kids.length
      ? state.kids.map((kid) => '<div class="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5"><div class="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">' + escapeHtml(kid.name[0]) + '</div><div class="flex-1"><div class="text-xs font-bold text-slate-900">' + escapeHtml(kid.name) + ' <span class="text-[10px] bg-slate-200 text-slate-700 px-1.5 rounded">' + kid.age + ' yrs</span></div><p class="text-[10px] text-indigo-600 font-medium">' + escapeHtml(kid.schoolName) + '</p></div><button class="remove-kid text-slate-400 hover:text-red-600 p-1" data-kid="' + kid.id + '">⌫</button></div>').join('')
      : '<div class="text-[11px] text-slate-400 text-center py-2">No children registered yet. Click Add above.</div>';
    $('founding-children-checkboxes').innerHTML = state.kids.length
      ? state.kids.map((kid) => '<label class="flex items-center gap-2 border border-indigo-100 bg-white rounded-xl p-2 text-xs"><input type="checkbox" checked value="' + kid.id + '" class="rounded text-indigo-600"><span class="font-bold">' + escapeHtml(kid.name) + '</span><span class="text-slate-500">' + kid.age + ' yrs · ' + escapeHtml(kid.schoolName) + '</span></label>').join('')
      : '<p class="text-xs text-amber-700">Register a child before launching a pod.</p>';
    $('sos-child-select').innerHTML = state.kids.length
      ? state.kids.map((kid) => '<option value="' + kid.id + '">' + escapeHtml(kid.name) + ' (' + escapeHtml(kid.schoolName) + ')</option>').join('')
      : '<option value="">Register a child first</option>';
    document.querySelectorAll('.remove-kid').forEach((button) => button.onclick = async () => {
      try { await api('/api/kids/' + button.dataset.kid, { method: 'DELETE' }); await load(); toast('Child removed.'); }
      catch (error) { toast(error.message, true); }
    });
  }
  function podCard(pod, active) {
    const action = active
      ? '<div class="flex flex-col gap-1"><a href="/pods/' + pod.id + '" class="text-center text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg">Details</a><button class="trigger-sos text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg" data-pod="' + pod.id + '">🚨 Trigger SOS</button></div>'
      : '<button class="join-pod text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg" data-pod="' + pod.id + '">Join Pod</button>';
    return '<div class="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm"><div class="flex justify-between gap-3"><div><span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">' + escapeHtml(pod.schoolName) + '</span><h3 class="text-sm font-extrabold text-slate-900 mt-1.5">' + escapeHtml(pod.name) + '</h3><p class="text-[11px] text-slate-500">Departure: <strong class="text-slate-800">' + escapeHtml(pod.departureTime) + '</strong> · ' + pod.memberCount + '/' + pod.maxCapacity + ' seats filled</p></div>' + action + '</div></div>';
  }
  function renderPods() {
    const active = state.pods.filter((pod) => pod.joined);
    const discover = state.pods.filter((pod) => !pod.joined);
    $('active-pods-count').textContent = active.length + ' Enrolled';
    $('active-pods-container').innerHTML = active.length ? active.map((pod) => podCard(pod, true)).join('') : '<div class="text-[11px] text-slate-400 text-center p-3">Join a local pod or create one.</div>';
    $('discover-pods-container').innerHTML = discover.length ? discover.map((pod) => podCard(pod, false)).join('') : '<div class="text-[11px] text-slate-400 text-center p-3">No other open pods in this society.</div>';
    document.querySelectorAll('.join-pod').forEach((button) => button.onclick = () => joinPod(button.dataset.pod));
    document.querySelectorAll('.trigger-sos').forEach((button) => button.onclick = () => openSos(button.dataset.pod));
    if (state.activeTab === 'pods') renderMyPods();
  }
  function renderMyPods() {
    hideStandardViews();
    let view = $('my-pods-view');
    if (!view) {
      view = document.createElement('section');
      view.id = 'my-pods-view';
      view.className = 'space-y-3';
      $('app-content').appendChild(view);
    }
    view.classList.remove('hidden');
    const cards = state.pods.filter((pod) => pod.joined);
    view.innerHTML = '<div class="flex items-center justify-between"><div><h2 class="text-xl font-extrabold text-slate-900">My Society Pods</h2><p class="text-xs text-slate-500 mt-1">Your enrolled carpools in ' + escapeHtml(state.resident.flat_no) + '</p></div><button class="open-my-pods-create bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-xl">New Pod</button></div>' + (cards.length ? cards.map((pod) => '<article class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm"><div class="flex items-start justify-between gap-3"><div><h3 class="font-extrabold text-slate-900">' + escapeHtml(pod.name) + '</h3><p class="text-xs text-slate-500 mt-2">School: ' + escapeHtml(pod.schoolName) + ' · ' + pod.memberCount + '/' + pod.maxCapacity + ' seats filled</p><p class="text-xs text-slate-600 mt-2">Next departure: <b>' + escapeHtml(pod.departureTime) + '</b></p></div><span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">Active</span></div><div class="border-t border-slate-100 mt-3 pt-3 flex justify-between items-center"><a href="/pods/' + pod.id + '" class="text-xs font-bold text-indigo-700">Manage Pod →</a><button class="remove-pod text-xs font-bold text-red-600" data-pod="' + pod.id + '">Remove pod</button></div></article>').join('') : '<div class="bg-white rounded-2xl p-5 text-center text-sm text-slate-500 border border-slate-200">You have not joined a pod yet.</div>');
    view.querySelector('.open-my-pods-create').onclick = () => $('open-create-pod-btn').click();
    view.querySelectorAll('.remove-pod').forEach((button) => button.onclick = async () => {
      if (!confirm('Remove this pod? This cannot be undone in the demo.')) return;
      try { await api('/api/pods/' + button.dataset.pod, { method: 'DELETE' }); await load(); toast('Pod removed.'); }
      catch (error) { toast(error.message, true); }
    });
  }
  function hideStandardViews() {
    document.querySelectorAll('#app-content > :not(#toast-notification):not(#my-pods-view):not(#schedule-view):not(#profile-view)').forEach((element) => element.classList.add('hidden'));
    ['my-pods-view', 'schedule-view', 'profile-view'].forEach((id) => $(id)?.classList.add('hidden'));
  }
  function renderSchedule() {
    hideStandardViews();
    let view = $('schedule-view');
    if (!view) { view = document.createElement('section'); view.id = 'schedule-view'; view.className = 'space-y-4'; $('app-content').appendChild(view); }
    view.classList.remove('hidden');
    view.innerHTML = '<div><h2 class="text-xl font-extrabold text-slate-900">Weekly Pod Schedule</h2><p class="text-xs text-slate-500 mt-1">Your confirmed rides and parent duties.</p></div>' + state.schedule.map((day) => '<article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div class="flex items-center justify-between gap-3 border-b border-slate-200 pb-3"><h3 class="text-sm font-extrabold text-indigo-700">' + escapeHtml(day.heading) + '</h3><span class="text-xs font-bold ' + (day.status === 'All Rides Confirmed' ? 'text-emerald-700' : 'text-amber-700') + '">' + escapeHtml(day.status) + '</span></div>' + (day.rides.length ? '<ul class="mt-3 space-y-3">' + day.rides.map((ride) => '<li class="text-xs text-slate-600"><span class="text-indigo-500">•</span> <b>' + escapeHtml(ride.time) + '</b> – ' + escapeHtml(ride.pod_name) + '<br><span class="ml-3.5">Driver: ' + escapeHtml(ride.driver) + ' <b class="' + (ride.state === 'Done' ? 'text-emerald-700' : ride.state === 'Pending' ? 'text-amber-700' : 'text-slate-500') + '">' + escapeHtml(ride.state) + '</b></span></li>').join('') + '</ul>' : '<p class="pt-3 text-xs text-slate-500">Create or join a pod to add rides to your schedule.</p>') + '</article>').join('');
  }
  function renderProfile() {
    hideStandardViews();
    let view = $('profile-view');
    if (!view) { view = document.createElement('section'); view.id = 'profile-view'; view.className = 'space-y-4'; $('app-content').appendChild(view); }
    const profile = state.profile;
    const initials = profile.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2);
    view.classList.remove('hidden');
    view.innerHTML = '<article class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4"><div class="w-16 h-16 rounded-full bg-indigo-700 text-white flex items-center justify-center text-xl font-extrabold">' + escapeHtml(initials) + '</div><div><h2 class="text-xl font-extrabold text-slate-900">' + escapeHtml(profile.display_name) + '</h2><p class="text-sm text-slate-500 mt-1">' + escapeHtml(profile.society?.name || 'Society') + ' • ' + escapeHtml(profile.flat_no) + '</p><span class="inline-block mt-2 text-xs font-bold px-2 py-1 rounded ' + (profile.is_verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700') + '">' + (profile.is_verified ? 'Verified Resident' : 'Verification Pending') + '</span></div></article><article class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><h3 class="text-sm font-extrabold text-slate-600 uppercase">Children profiles</h3><div class="mt-4 space-y-3">' + (profile.children.length ? profile.children.map((kid) => '<div class="flex items-center gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"><div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">' + escapeHtml(kid.name[0]) + '</div><div><b class="text-sm text-slate-900">' + escapeHtml(kid.name) + ' (Age ' + kid.age + ')</b><p class="text-xs text-slate-500 mt-1">' + escapeHtml(kid.schoolName) + '</p></div></div>').join('') : '<p class="text-sm text-slate-500">No children registered yet.</p>') + '</div></article><button id="logout-demo-btn" class="w-full rounded-xl bg-red-50 text-red-700 py-3 text-sm font-bold">Log Out / Reset Demo Session</button>';
    $('logout-demo-btn').onclick = () => { sessionStorage.clear(); location.href = '/'; };
  }
  function showDashboard() {
    state.activeTab = 'dashboard';
    ['my-pods-view', 'schedule-view', 'profile-view'].forEach((id) => $(id)?.classList.add('hidden'));
    document.querySelectorAll('#app-content > :not(#toast-notification):not(#my-pods-view):not(#schedule-view):not(#profile-view)').forEach((element) => element.classList.remove('hidden'));
  }
  function renderAlerts() {
    const alert = state.alerts[0];
    const container = $('active-sos-container');
    if (!alert) { container.innerHTML = ''; return; }
    const own = alert.triggeredBy === state.resident.id;
    const claimed = alert.status === 'CLAIMED';
    const action = !claimed && !own
      ? '<button class="claim-sos w-full bg-amber-600 text-white text-xs font-bold py-2.5 rounded-xl" data-alert="' + alert.id + '">✋ Claim Swap & Help</button>'
      : claimed && (own || alert.claimedBy === state.resident.id)
        ? '<button class="complete-sos w-full bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl" data-alert="' + alert.id + '">✓ Mark Safe & Handover Complete</button>'
        : '<p class="text-[11px] text-slate-500 text-center">Broadcasting to verified society parents.</p>';
    container.innerHTML = '<div class="bg-red-50 border-2 border-red-500 rounded-2xl p-4 shadow-sm"><div class="flex justify-between"><span class="text-[10px] font-extrabold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">🚨 Live Emergency SOS</span><span class="text-[10px] font-bold text-amber-700">' + alert.status + '</span></div><div class="mt-3 bg-white rounded-xl p-3 border border-red-200 text-xs space-y-2"><p>Pod: <b>' + escapeHtml(alert.podName) + '</b> · Child: <b>' + escapeHtml(alert.childName) + '</b></p><p class="italic text-red-900">“' + escapeHtml(alert.reason) + '”</p></div><div class="mt-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex justify-between items-center"><div><b class="text-[11px] text-indigo-900">4-DIGIT SECURITY HANDSHAKE OTP</b><p class="text-[10px] text-slate-600">Confirm before physical handover.</p></div><b class="text-2xl tracking-widest text-indigo-700">' + alert.handshakeOtp + '</b></div><div class="mt-3">' + action + '</div></div>';
    container.querySelector('.claim-sos')?.addEventListener('click', () => claimSos(alert.id));
    container.querySelector('.complete-sos')?.addEventListener('click', () => completeSos(alert.id));
  }
  async function load() {
    const [kids, pods, sos, profile, schedule] = await Promise.all([api('/api/kids'), api('/api/pods'), api('/api/sos'), api('/api/profile'), api('/api/schedule')]);
    state.kids = kids.kids; state.pods = pods.pods; state.alerts = sos.alerts; state.profile = profile.profile; state.schedule = schedule.days;
    renderChildren(); renderPods(); renderAlerts();
  }
  async function joinPod(podId) {
    if (!state.kids.length) return toast('Register at least one child before joining.', true);
    try {
      await api('/api/pods/join', { method: 'POST', body: JSON.stringify({ pod_id: podId, kids: state.kids.map((kid) => ({ name: kid.name, age: kid.age })) }) });
      await load(); toast('Pod joined successfully.');
    } catch (error) { toast(error.message, true); }
  }
  function openSos(podId) {
    if (!state.kids.length) return toast('Register a child before triggering SOS.', true);
    $('trigger-sos-modal').classList.remove('hidden');
    $('trigger-sos-modal').dataset.podId = podId || state.pods.find((pod) => pod.joined)?.id || '';
  }
  async function claimSos(id) {
    try { await api('/api/sos/' + id + '/claim', { method: 'POST' }); await load(); toast('Swap claimed. Confirm the OTP in person.'); }
    catch (error) { toast(error.message, true); }
  }
  async function completeSos(id) {
    try { await api('/api/sos/' + id + '/complete', { method: 'POST' }); await load(); toast('Handover marked safe and complete.'); }
    catch (error) { toast(error.message, true); }
  }
  function bindControls() {
    document.querySelectorAll('.nav-tab').forEach((tab) => tab.onclick = () => {
      document.querySelectorAll('.nav-tab').forEach((item) => {
        item.classList.remove('active', 'text-indigo-600');
        item.classList.add('text-[#777587]');
      });
      tab.classList.add('active', 'text-indigo-600');
      tab.classList.remove('text-[#777587]');
      if (tab.dataset.tab === 'pods') { state.activeTab = 'pods'; renderMyPods(); }
      else if (tab.dataset.tab === 'dashboard') showDashboard();
      else if (tab.dataset.tab === 'schedule') { state.activeTab = 'schedule'; renderSchedule(); }
      else if (tab.dataset.tab === 'profile') { state.activeTab = 'profile'; renderProfile(); }
    });
    const perspective = $('toggle-sandbox-btn');
    const perspectiveLabel = $('toggle-sandbox-text');
    if (perspective && perspectiveLabel) {
      const role = sessionStorage.getItem('societyPodsRole') || 'driver';
      perspectiveLabel.textContent = role === 'neighbor' ? 'Switch to Driver View' : 'Switch to Neighbor View';
      perspective.onclick = async () => {
        try {
          if ((sessionStorage.getItem('societyPodsRole') || 'driver') === 'neighbor') {
            const driver = JSON.parse(sessionStorage.getItem('societyPodsDriverSession'));
            sessionStorage.setItem('societyPodsToken', driver.token);
            sessionStorage.setItem('societyPodsResident', JSON.stringify(driver.resident));
            sessionStorage.setItem('societyPodsRole', 'driver');
          } else {
            sessionStorage.setItem('societyPodsDriverSession', JSON.stringify({ token: state.token, resident: state.resident }));
            const auth = await api('/api/auth/phone', { method: 'POST', body: JSON.stringify({ phone: '9111111111' }) });
            const response = await fetch('/api/onboarding/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
              body: JSON.stringify({ society_id: state.resident.society_id, flat_no: 'Tower 11, Flat 1104', method: 'invite_code', value: 'TRUST-99' })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error?.message || 'Could not start neighbour view.');
            sessionStorage.setItem('societyPodsToken', auth.token);
            sessionStorage.setItem('societyPodsResident', JSON.stringify(body.resident));
            sessionStorage.setItem('societyPodsRole', 'neighbor');
          }
          location.reload();
        } catch (error) { toast(error.message, true); }
      };
    }
    $('toggle-add-child-form-btn')?.addEventListener('click', () => show('add-child-form', $('add-child-form').classList.contains('hidden')));
    $('cancel-add-child-btn')?.addEventListener('click', () => show('add-child-form', false));
    $('add-child-form').onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api('/api/kids', { method: 'POST', body: JSON.stringify({ name: $('new-child-name').value.trim(), age: Number($('new-child-age').value), school_name: $('new-child-school').value.trim() }) });
        event.target.reset(); show('add-child-form', false); await load(); toast('Child registered.');
      } catch (error) { toast(error.message, true); }
    };
    $('open-create-pod-btn')?.addEventListener('click', () => {
      if (!state.resident.is_verified) return toast('Verified residents only.', true);
      $('create-pod-modal').classList.remove('hidden');
    });
    $('close-create-pod-modal')?.addEventListener('click', () => $('create-pod-modal').classList.add('hidden'));
    $('create-pod-form').onsubmit = async (event) => {
      event.preventDefault();
      const ids = [...document.querySelectorAll('#founding-children-checkboxes input:checked')].map((input) => input.value);
      try {
        await api('/api/pods', { method: 'POST', body: JSON.stringify({ name: $('pod-name-input').value.trim(), school_name: $('pod-school-input').value.trim(), departure_time: $('pod-time-input').value, max_capacity: Number($('pod-capacity-input').value), kid_ids: ids }) });
        $('create-pod-modal').classList.add('hidden'); await load(); toast('Pod launched to your society board.');
      } catch (error) { toast(error.message, true); }
    };
    $('quick-sos-header-btn')?.addEventListener('click', () => openSos());
    $('close-sos-modal-btn')?.addEventListener('click', () => $('trigger-sos-modal').classList.add('hidden'));
    $('cancel-sos-trigger-btn')?.addEventListener('click', () => $('trigger-sos-modal').classList.add('hidden'));
    $('sos-trigger-form').onsubmit = async (event) => {
      event.preventDefault();
      const podId = $('trigger-sos-modal').dataset.podId || state.pods.find((pod) => pod.joined)?.id;
      try {
        await api('/api/sos/trigger', { method: 'POST', body: JSON.stringify({ pod_id: podId, child_id: $('sos-child-select').value, reason: $('sos-reason-input').value.trim() }) });
        $('trigger-sos-modal').classList.add('hidden'); await load(); toast('SOS broadcast to verified society parents.');
      } catch (error) { toast(error.message, true); }
    };
    $('close-toast-btn')?.addEventListener('click', () => $('toast-notification').classList.add('hidden'));
  }
  async function start() {
    try {
      const savedToken = sessionStorage.getItem('societyPodsToken');
      const savedResident = sessionStorage.getItem('societyPodsResident');
      if (savedToken && savedResident) {
        state.token = savedToken;
        state.resident = JSON.parse(savedResident);
        if (!sessionStorage.getItem('societyPodsDriverSession')) sessionStorage.setItem('societyPodsDriverSession', JSON.stringify({ token: state.token, resident: state.resident }));
        if (!sessionStorage.getItem('societyPodsRole')) sessionStorage.setItem('societyPodsRole', 'driver');
        $('header-address-label').textContent = 'Prestige Shantiniketan • ' + state.resident.flat_no;
        bindControls(); await load();
        return;
      }
      const auth = await api('/api/auth/phone', { method: 'POST', body: JSON.stringify({ phone: '9000000000' }) });
      state.token = auth.token;
      const verification = await api('/api/onboarding/verify', { method: 'POST', body: JSON.stringify({ society_id: 'society-prestige-shantiniketan', flat_no: 'Tower 7, Flat 1402', method: 'invite_code', value: 'TRUST-99' }) });
      state.resident = verification.resident;
      $('header-address-label').textContent = 'Prestige Shantiniketan • ' + state.resident.flat_no;
      bindControls(); await load();
    } catch (error) { toast('API connection failed: ' + error.message, true); }
  }
  start();
})();
