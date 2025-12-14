const KEY = 'pendataan-penduduk';
let deferredPrompt = null;
const state = { data: null, selectedKKId: null, edit: null };
const QKEY = KEY + ':queue';
let queue = [];

function load() {
  const raw = localStorage.getItem(KEY);
  state.data = raw ? JSON.parse(raw) : { household: null, kks: [] };
  const qraw = localStorage.getItem(QKEY);
  queue = qraw ? JSON.parse(qraw) : [];
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state.data));
}

function saveQueue() {
  localStorage.setItem(QKEY, JSON.stringify(queue));
}

function enqueueSync(type, payload) {
  queue.push({ id: crypto.randomUUID(), type, payload, status: 'pending', ts: Date.now() });
  saveQueue();
  if (!navigator.onLine) showToast('Akan disinkron saat online');
}

async function processSync() {
  if (!navigator.onLine) return;
  const endpoint = localStorage.getItem(KEY + ':endpoint');
  if (!endpoint) return;
  for (const item of queue) {
    if (item.status !== 'pending') continue;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      if (res.ok) { item.status = 'done'; item.doneAt = Date.now(); saveQueue(); }
    } catch (e) { /* tetap pending */ }
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function switchView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.target === id));
}

function initTabs() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.target));
  });
}

function validatePhone(v) {
  return /^\+?\d{10,15}$/.test(v);
}

function validateNIK(v) {
  return /^\d{16}$/.test(v);
}

function validateKK(v) {
  return /^\d{16}$/.test(v);
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function setupHouseholdForm() {
  const f = document.getElementById('householdForm');
  const housePhoto = document.getElementById('housePhoto');
  const housePhotoPreview = document.getElementById('housePhotoPreview');
  housePhoto.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) { housePhotoPreview.src = ''; return; }
    const r = new FileReader();
    r.onload = () => { housePhotoPreview.src = r.result; };
    r.readAsDataURL(file);
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const headName = document.getElementById('headName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const kelurahan = document.getElementById('kelurahan').value.trim();
    const kecamatan = document.getElementById('kecamatan').value.trim();
    const homeCondition = document.getElementById('homeCondition').value;
    const ownership = document.getElementById('ownership').value;
    const notes = document.getElementById('houseNotes').value.trim();
    if (!headName || !phone || !address || !kelurahan || !kecamatan || !homeCondition || !ownership) {
      showToast('Isi semua field wajib');
      return;
    }
    if (!validatePhone(phone)) {
      showToast('Nomor telepon tidak valid');
      return;
    }
    const photoDataUrl = await toDataUrl(housePhoto.files[0]);
    state.data.household = { headName, phone, address, kelurahan, kecamatan, homeCondition, ownership, photoDataUrl, notes };
    save();
    enqueueSync('household_upsert', state.data.household);
    renderSummary();
    showToast('Data Rumah Tangga disimpan');
    switchView('view-kk');
  });
  if (state.data.household) {
    document.getElementById('headName').value = state.data.household.headName || '';
    document.getElementById('phone').value = state.data.household.phone || '';
    document.getElementById('address').value = state.data.household.address || '';
    document.getElementById('kelurahan').value = state.data.household.kelurahan || '';
    document.getElementById('kecamatan').value = state.data.household.kecamatan || '';
    document.getElementById('homeCondition').value = state.data.household.homeCondition || '';
    document.getElementById('ownership').value = state.data.household.ownership || '';
    document.getElementById('houseNotes').value = state.data.household.notes || '';
    if (state.data.household.photoDataUrl) housePhotoPreview.src = state.data.household.photoDataUrl;
  }
}

function kkDuplicate(kkNumber) {
  return state.data.kks.some(k => k.kkNumber === kkNumber);
}

function nikDuplicate(nik) {
  return state.data.kks.some(k => (k.members||[]).some(m => m.nik === nik));
}

function setupKKForm() {
  const f = document.getElementById('kkForm');
  const kkList = document.getElementById('kkList');
  const kkSelect = document.getElementById('kkSelect');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const kkNumber = document.getElementById('kkNumber').value.trim();
    const totalMembers = parseInt(document.getElementById('memberTotal').value, 10);
    if (!validateKK(kkNumber)) { showToast('Nomor KK harus 16 digit'); return; }
    if (!totalMembers || totalMembers < 1) { showToast('Jumlah anggota minimal 1'); return; }
    if (kkDuplicate(kkNumber)) { showToast('Nomor KK sudah ada'); return; }
    const id = crypto.randomUUID();
    state.data.kks.push({ id, kkNumber, totalMembers, members: [] });
    save();
    enqueueSync('kk_add', { id, kkNumber, totalMembers });
    renderKKs();
    renderSummary();
    showToast('Kartu Keluarga ditambahkan');
    f.reset();
  });
  document.getElementById('goMembersBtn').addEventListener('click', () => {
    const selectedId = kkSelect.value;
    if (!selectedId) { showToast('Pilih KK terlebih dahulu'); return; }
    state.selectedKKId = selectedId;
    renderMembersView();
    switchView('view-members');
  });
  function renderKKList() {
    kkList.innerHTML = '';
    state.data.kks.forEach(k => {
      const c = document.createElement('div');
      c.className = 'kk-card';
      const counted = (k.members||[]).length;
      const status = counted >= k.totalMembers ? 'Lengkap' : 'Belum Lengkap';
      c.innerHTML = `<div><strong>KK ${k.kkNumber}</strong></div>
        <div>Anggota terdata: ${counted} / ${k.totalMembers}</div>
        <div>Status: ${status}</div>
        <div class="actions">
          <button class="btn secondary" data-act="edit" data-id="${k.id}">Edit</button>
          <button class="btn primary" data-act="members" data-id="${k.id}">Isi Anggota</button>
        </div>`;
      kkList.appendChild(c);
    });
    kkList.querySelectorAll('button').forEach(b => {
      const id = b.getAttribute('data-id');
      const act = b.getAttribute('data-act');
      b.addEventListener('click', () => {
        if (act === 'members') { state.selectedKKId = id; renderMembersView(); switchView('view-members'); }
        if (act === 'edit') {
          const kk = state.data.kks.find(x => x.id === id);
          const nn = prompt('Edit Nomor KK', kk.kkNumber);
          if (!nn) return;
          if (!validateKK(nn)) { showToast('Nomor KK harus 16 digit'); return; }
          if (nn !== kk.kkNumber && kkDuplicate(nn)) { showToast('Duplikasi Nomor KK'); return; }
          const tt = prompt('Edit Jumlah Anggota', kk.totalMembers);
          const ttn = parseInt(tt, 10);
          if (!ttn || ttn < kk.members.length) { showToast('Jumlah anggota kurang dari terdata'); return; }
          kk.kkNumber = nn; kk.totalMembers = ttn; save(); renderKKs(); renderSummary(); showToast('KK diperbarui');
          enqueueSync('kk_update', { id: kk.id, kkNumber: kk.kkNumber, totalMembers: kk.totalMembers });
        }
      });
    });
    kkSelect.innerHTML = '<option value="">Pilih KK</option>' + state.data.kks.map(k => `<option value="${k.id}">${k.kkNumber}</option>`).join('');
  }
  renderKKs = renderKKList;
}

let renderKKs = () => {};

function setupMemberForm() {
  const f = document.getElementById('memberForm');
  const list = document.getElementById('memberList');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('memberName').value.trim();
    const nik = document.getElementById('memberNIK').value.trim();
    const relation = document.getElementById('relation').value;
    const health = document.querySelector('input[name="health"]:checked').value;
    const education = document.getElementById('education').value;
    const job = document.getElementById('job').value.trim();
    const birthPlace = document.getElementById('birthPlace').value.trim();
    const birthDate = document.getElementById('birthDate').value;
    const notes = document.getElementById('memberNotes').value.trim();
    if (!name || !nik || !relation || !education || !job || !birthPlace || !birthDate) { showToast('Isi semua field wajib'); return; }
    if (!validateNIK(nik)) { showToast('NIK harus 16 digit'); return; }
    const kk = state.data.kks.find(k => k.id === state.selectedKKId);
    if (!kk) { showToast('KK tidak ditemukan'); return; }
    if (state.edit && state.edit.type === 'member') {
      const idx = kk.members.findIndex(x => x.id === state.edit.id);
      if (idx >= 0) {
        const otherNikUsed = kk.members.some((x,i) => i!==idx && x.nik === nik) || state.data.kks.some(k => k.id!==kk.id && (k.members||[]).some(m => m.nik === nik));
        if (otherNikUsed) { showToast('NIK sudah terdaftar'); return; }
        kk.members[idx] = { ...kk.members[idx], name, nik, relation, health, education, job, birthPlace, birthDate, notes };
        state.edit = null;
        save();
        enqueueSync('member_update', { kkId: kk.id, id: kk.members[idx].id, ...kk.members[idx] });
        renderMembersView();
        renderSummary();
        showToast('Anggota diperbarui');
        f.reset();
        return;
      }
    }
    if (nikDuplicate(nik)) { showToast('NIK sudah terdaftar'); return; }
    const mid = crypto.randomUUID();
    kk.members.push({ id: mid, name, nik, relation, health, education, job, birthPlace, birthDate, notes });
    save();
    enqueueSync('member_add', { kkId: kk.id, id: mid, name, nik, relation, health, education, job, birthPlace, birthDate, notes });
    renderMembersView();
    renderSummary();
    showToast('Anggota disimpan');
    f.reset();
  });
  function renderMemberList() {
    const kk = state.data.kks.find(k => k.id === state.selectedKKId);
    list.innerHTML = '';
    if (!kk) return;
    kk.members.forEach(m => {
      const c = document.createElement('div');
      c.className = 'member-card';
      c.innerHTML = `<div><strong>${m.name}</strong></div>
        <div>NIK: ${m.nik}</div>
        <div>${m.relation} • ${m.health} • ${m.education}</div>
        <div>Pekerjaan: ${m.job}</div>
        <div>Tempat/Tanggal Lahir: ${m.birthPlace || '-'} / ${formatDate(m.birthDate) || '-'}</div>
        <div class="actions">
          <button class="btn secondary" data-act="edit" data-id="${m.id}">Edit</button>
        </div>`;
      list.appendChild(c);
    });
    list.querySelectorAll('button').forEach(b => {
      const id = b.getAttribute('data-id');
      const act = b.getAttribute('data-act');
      b.addEventListener('click', () => {
        if (act === 'edit') {
          const kk = state.data.kks.find(k => k.id === state.selectedKKId);
          const m = kk.members.find(x => x.id === id);
          if (!m) return;
          document.getElementById('memberName').value = m.name;
          document.getElementById('memberNIK').value = m.nik;
          document.getElementById('relation').value = m.relation;
          document.querySelectorAll('input[name="health"]').forEach(r => r.checked = r.value === m.health);
          document.getElementById('education').value = m.education;
          document.getElementById('job').value = m.job;
          document.getElementById('birthPlace').value = m.birthPlace || '';
          document.getElementById('birthDate').value = m.birthDate || '';
          document.getElementById('memberNotes').value = m.notes || '';
          state.edit = { type: 'member', id };
          showToast('Edit mode aktif');
        }
      });
    });
  }
  renderMembersView = function() {
    const kk = state.data.kks.find(k => k.id === state.selectedKKId);
    document.getElementById('selectedKKHeader').textContent = kk ? kk.kkNumber : '';
    renderMemberList();
  };
}

let renderMembersView = () => {};

function renderSummary() {
  const h = document.getElementById('summaryHousehold');
  const klist = document.getElementById('summaryKKs');
  if (!state.data.household) {
    h.innerHTML = 'Belum ada data rumah tangga';
  } else {
    const d = state.data.household;
    const photo = d.photoDataUrl ? `<img src="${d.photoDataUrl}" alt="Foto Rumah" style="max-width:120px;border-radius:8px"/>` : '';
    h.innerHTML = `<div class="kk-card"><div><strong>${d.headName}</strong></div>
    <div>${d.address}, Kel. ${d.kelurahan}, Kec. ${d.kecamatan}</div>
    <div>Tel: ${d.phone} • Kondisi: ${d.homeCondition} • Kepemilikan: ${d.ownership}</div>
    <div>${photo}</div>
    <div>${d.notes||''}</div></div>`;
  }
  klist.innerHTML = '';
  state.data.kks.forEach(k => {
    const counted = (k.members||[]).length;
    const status = counted >= k.totalMembers ? 'Lengkap' : 'Belum Lengkap';
    const c = document.createElement('div');
    c.className = 'summary-card';
    c.innerHTML = `<div><strong>KK ${k.kkNumber}</strong></div>
      <div>Anggota: ${counted} / ${k.totalMembers}</div>
      <div>Status: ${status}</div>`;
    klist.appendChild(c);
  });
}

function setupSummaryActions() {
  document.getElementById('editDataBtn').addEventListener('click', () => {
    const choice = prompt('Edit: rumah/kk/anggota');
    if (choice === 'rumah') switchView('view-household');
    if (choice === 'kk') switchView('view-kk');
    if (choice === 'anggota') switchView('view-members');
  });
  document.getElementById('exportPdfBtn').addEventListener('click', async () => {
    if (!state.data.household) { showToast('Lengkapi data rumah tangga'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const d = state.data.household;
    const mm = n => n * 2.83465;
    const margin = mm(15);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica','normal');
    let y = margin;
    doc.setFontSize(14);
    doc.text('Pendataan Penduduk', margin, y); y += 22;
    doc.setFontSize(10);
    doc.text(`Kepala Keluarga: ${d.headName}`, margin, y); y += 14;
    doc.text(`Telp: ${d.phone}`, margin, y); y += 14;
    doc.text(`Alamat: ${d.address}`, margin, y); y += 14;
    doc.text(`Kelurahan: ${d.kelurahan} • Kecamatan: ${d.kecamatan}`, margin, y); y += 14;
    doc.text(`Kondisi: ${d.homeCondition} • Kepemilikan: ${d.ownership}`, margin, y); y += 18;
    if (d.photoDataUrl) { try { doc.addImage(d.photoDataUrl, 'JPEG', margin, y, mm(60), mm(45)); y += mm(50); } catch(e) {} }
    doc.text('Data Kartu Keluarga', margin, y); y += 16;
    state.data.kks.forEach(k => {
      const counted = (k.members||[]).length;
      const status = counted >= k.totalMembers ? 'Lengkap' : 'Belum Lengkap';
      doc.text(`KK ${k.kkNumber} • Anggota ${counted}/${k.totalMembers} • ${status}`, margin, y); y += 10;
      const head = ['Nama','NIK','Hubungan','Kesehatan','Pendidikan','Pekerjaan','Tempat Lahir','Tanggal Lahir','Keterangan'];
      const body = (k.members||[]).map(m => [
        m.name,
        m.nik,
        m.relation,
        m.health,
        m.education,
        m.job,
        m.birthPlace || '-',
        formatDate(m.birthDate) || '-',
        m.notes || '-'
      ]);
      doc.autoTable({
        head: [head],
        body,
        startY: y,
        theme: 'grid',
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [34,211,238], textColor: 0 },
        alternateRowStyles: { fillColor: [248,250,252] },
        didDrawPage: (data) => {
          doc.setFontSize(12);
          doc.text('Pendataan Penduduk', margin, margin - 6);
          const footer = `Halaman ${data.pageNumber}`;
          doc.setFontSize(10);
          doc.text(footer, pageWidth - margin, pageHeight - 8, { align: 'right' });
        }
      });
      y = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 20 : y + 20;
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
    });
    doc.save(`pendataan-penduduk-${Date.now()}.pdf`);
    const reset = confirm('Mulai baru? Data tersimpan di perangkat.');
    if (reset) { state.data = { household: null, kks: [] }; save(); location.reload(); }
  });
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) { return d; }
}

function setupInstallPrompt() {
  const btn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
    btn.disabled = false;
  });
  window.addEventListener('appinstalled', () => {
    showToast('Aplikasi terinstal');
    btn.hidden = true;
  });
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });
  // Fallback: tampilkan tombol agar pengguna tahu cara menginstal via menu
  setTimeout(() => { btn.hidden = false; }, 1000);
}

function setupNetworkIndicator() {
  const el = document.getElementById('netStatus');
  function update() {
    const online = navigator.onLine;
    el.textContent = online ? 'Online' : 'Offline';
    el.classList.toggle('online', online);
    el.classList.toggle('offline', !online);
    if (online) processSync();
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (meta) meta.setAttribute('content', bg || '#121212');
  localStorage.setItem(KEY + ':theme', theme);
}

function setupThemeToggle() {
  const btn = document.getElementById('themeToggle');
  const stored = localStorage.getItem(KEY + ':theme') || 'dark';
  applyTheme(stored);
  btn.textContent = stored === 'dark' ? 'Light Mode' : 'Dark Mode';
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    btn.textContent = next === 'dark' ? 'Light Mode' : 'Dark Mode';
  });
}

function init() {
  load();
  initTabs();
  setupHouseholdForm();
  setupKKForm();
  setupMemberForm();
  setupSummaryActions();
  setupInstallPrompt();
  setupThemeToggle();
  setupNetworkIndicator();
  renderSummary();
  switchView('view-household');
}

document.addEventListener('DOMContentLoaded', init);
