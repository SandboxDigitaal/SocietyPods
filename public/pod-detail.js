/* Adapter for the supplied active-pod tracker screen. The tracker artwork is a demo visual. */
(() => {
  const token = sessionStorage.getItem('societyPodsToken');
  const residentText = sessionStorage.getItem('societyPodsResident');
  const podId = location.pathname.split('/').pop();
  if (!token || !residentText || !podId) { location.assign('/'); return; }
  const resident = JSON.parse(residentText);
  const api = async (path) => {
    const response = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Pod unavailable.');
    return response.json();
  };
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };
  async function load() {
    try {
      const data = await api('/api/pods');
      const pod = data.pods.find((item) => item.id === podId && item.joined);
      if (!pod) { location.assign('/dashboard'); return; }
      setText('#header-subtitle', resident.flat_no + ' • Verified Parent');
      setText('#view-dashboard h3', pod.name);
      const schedule = document.querySelector('#view-dashboard h3 + p');
      if (schedule) schedule.innerHTML = 'Scheduled Pickup: <span class="font-semibold text-[#191c1e]">' + pod.departureTime + '</span> Today';
      const status = document.querySelector('#view-dashboard .bg-\\[\\#006c49\\]\\/10');
      if (status) status.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#006c49] animate-pulse"></span> Active Pod • En Route';
    } catch { location.assign('/dashboard'); }
  }
  document.getElementById('menu-btn')?.addEventListener('click', () => location.assign('/dashboard'));
  document.getElementById('sos-trigger-btn')?.addEventListener('click', () => location.assign('/dashboard'));
  document.getElementById('open-create-pod-modal')?.addEventListener('click', () => location.assign('/dashboard'));
  document.getElementById('open-qr-verify-modal')?.addEventListener('click', () => {
    document.getElementById('qr-modal')?.classList.remove('hidden');
  });
  document.getElementById('close-qr-modal')?.addEventListener('click', () => document.getElementById('qr-modal')?.classList.add('hidden'));
  document.getElementById('done-qr-modal')?.addEventListener('click', () => document.getElementById('qr-modal')?.classList.add('hidden'));
  const remove = document.createElement('button');
  remove.textContent = 'Remove pod';
  remove.className = 'text-xs text-red-600 font-bold mt-2';
  remove.addEventListener('click', async () => {
    if (!confirm('Remove this pod? This cannot be undone.')) return;
    const response = await fetch('/api/pods/' + podId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) location.assign('/dashboard');
    else alert('Could not remove this pod.');
  });
  document.querySelector('#view-dashboard')?.append(remove);
  document.getElementById('view-pod-details-btn')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.getElementById('refresh-map-btn')?.addEventListener('click', () => {
    const button = document.getElementById('refresh-map-btn');
    button?.classList.add('animate-spin');
    setTimeout(() => button?.classList.remove('animate-spin'), 650);
  });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => location.assign('/dashboard')));
  load();
})();
