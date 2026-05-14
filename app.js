/* =============================================================================
 * Rà soát đất Công ty CP Chè Long Phú — Ứng dụng tĩnh
 * Dữ liệu tải từ diachinh.geojson
 * Cập nhật của cán bộ rà soát lưu localStorage
 * ============================================================================= */

const STORAGE_KEY = 'longphu_ra_soat_v1';

const COLORS_DX = {
  'da_bangiao_2018':  { fill: '#BFD8EF', stroke: '#1565c0' },
  'tieptuc_bangiao':  { fill: '#F5C4B3', stroke: '#ef6c00' },
  'giulai_cph':       { fill: '#D6B8DE', stroke: '#7b1fa2' },
  'rasoat_them':      { fill: '#F4B7B7', stroke: '#c62828' },
};
const DX_LABELS = {
  'da_bangiao_2018':  'Đã bàn giao 2018',
  'tieptuc_bangiao':  'Tiếp tục bàn giao về địa phương',
  'giulai_cph':       'Giữ lại theo PA CPH',
  'rasoat_them':      'Cần rà soát thêm',
};
const DX_BADGE = {
  'da_bangiao_2018':  'badge-da',
  'tieptuc_bangiao':  'badge-tt',
  'giulai_cph':       'badge-giu',
  'rasoat_them':      'badge-rs',
};
const LD_NAMES = {
  'ONT':'Đất ở nông thôn','CLN':'Đất trồng cây lâu năm','ONT+CLN':'Đất ở + cây lâu năm',
  'DGT':'Đất giao thông','DTL':'Đất thủy lợi','TMD':'Đất thương mại dịch vụ',
  'RSX':'Đất rừng sản xuất','NTS':'Đất nuôi trồng thủy sản','DNL':'Đất năng lượng',
  'TSC':'Đất trụ sở cơ quan','BCS':'Đất bằng chưa sử dụng','DGD':'Đất giáo dục',
  'NTD':'Đất nghĩa trang, nghĩa địa','BHK':'Đất bằng hàng năm khác','DVH':'Đất văn hóa',
  'DCH':'Đất chợ','SKC':'Đất sản xuất kinh doanh','DBV':'Đất bưu chính viễn thông',
  'SKX':'Đất sản xuất VLXD','HNK':'Đất bằng hàng năm khác'
};

/* ============================================================================
 * STATE
 * ============================================================================ */
const state = {
  features: [],
  edits: {},
  map: null,
  geojsonLayer: null,
  selectedId: null,
  filters: {
    de_xuat: new Set(['da_bangiao_2018','tieptuc_bangiao','giulai_cph','rasoat_them']),
    xa_cu: new Set(),
    phap_ly: new Set(),
    loai: new Set(),
    search: '',
  },
  table: {
    sortKey: 'tbd', sortDir: 'asc',
    page: 1, pageSize: 50,
    searchText: '', filterXa: '', filterDx: '',
  },
};

function effectiveProps(feature) {
  const id = feature.properties.id;
  const edit = state.edits[id];
  if (!edit) return feature.properties;
  return { ...feature.properties, ...edit, _edited: true };
}

/* ============================================================================
 * INIT
 * ============================================================================ */
async function init() {
  loadEdits();
  await loadData();
  initMap();
  initFilters();
  initNav();
  initTableControls();
  renderAll();
}

function loadEdits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.edits = raw ? JSON.parse(raw) : {};
  } catch (e) {
    state.edits = {};
  }
}
function saveEdits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.edits));
}

async function loadData() {
  // Thử cả cùng folder và data/
  let res;
  for (const u of ['diachinh.geojson', 'data/diachinh.geojson']) {
    try { res = await fetch(u); if (res.ok) break; } catch(e){}
  }
  if (!res || !res.ok) {
    document.getElementById('map-loading').innerHTML =
      '<div style="color:var(--danger)">⚠️ Không tải được file diachinh.geojson</div>';
    return;
  }
  const data = await res.json();
  state.features = data.features;
  document.getElementById('total-count').textContent = state.features.length.toLocaleString('vi-VN');

  // Tạo filter sets
  const xaSet = new Set(), loaiSet = new Set();
  state.features.forEach(f => {
    const p = f.properties;
    if (p.xa_cu) xaSet.add(p.xa_cu);
    if (p.loai) loaiSet.add(p.loai);
  });
  state.filters.xa_cu = new Set(xaSet);
  state.filters.loai = new Set(loaiSet);

  renderFilterChecks('filter-xa', 'xa_cu', ['Phú Cát','Hòa Thạch','Đông Yên'].filter(x=>xaSet.has(x)), x => 'Xã ' + x + ' (cũ)');

  const loaiSorted = Array.from(loaiSet).sort();
  renderFilterChecks('filter-loai', 'loai', loaiSorted, v => v + (LD_NAMES[v] ? ' — ' + LD_NAMES[v] : ''));
}

function renderFilterChecks(containerId, filterKey, values, labelFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  values.forEach(v => {
    const row = document.createElement('label');
    row.className = 'filter-row';
    row.innerHTML = `
      <input type="checkbox" data-filter="${filterKey}" value="${v}" checked>
      <span>${labelFn ? labelFn(v) : v}</span>
      <span class="count" data-count="${filterKey}-${v}">—</span>
    `;
    container.appendChild(row);
  });
}

/* ============================================================================
 * MAP - khởi tạo gọn, render thẳng KHÔNG có animation phức tạp
 * ============================================================================ */
function initMap() {
  if (typeof L === 'undefined') {
    document.getElementById('map-loading').innerHTML =
      '⚠️ Không tải được Leaflet. Kiểm tra Internet.';
    return;
  }

  state.map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([20.952, 105.553], 14);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '© Esri'
  });
  satellite.addTo(state.map);

  L.control.layers({
    'Ảnh vệ tinh': satellite,
    'OpenStreetMap': osm,
  }, {}, { position: 'topleft' }).addTo(state.map);

  drawGeoJson();
  document.getElementById('map-loading').classList.add('hidden');
}

function drawGeoJson() {
  if (!state.map) return;
  if (state.geojsonLayer) state.map.removeLayer(state.geojsonLayer);

  const filtered = state.features.filter(passesFilter);

  state.geojsonLayer = L.geoJSON(filtered, {
    style: feature => {
      const p = effectiveProps(feature);
      const c = COLORS_DX[p.de_xuat] || { fill: '#D3D1C7', stroke: '#5F5E5A' };
      return {
        fillColor: c.fill,
        color: c.stroke,
        weight: 0.5,
        fillOpacity: 0.6,
      };
    },
    onEachFeature: (feature, layer) => {
      layer.on('click', () => selectThua(feature.properties.id, layer));
      layer.on('mouseover', e => e.target.setStyle({ weight: 2 }));
      layer.on('mouseout', e => {
        if (state.selectedId !== feature.properties.id) {
          state.geojsonLayer.resetStyle(e.target);
        }
      });
    }
  }).addTo(state.map);

  // Auto-fit lần đầu
  if (!state._fitDone && filtered.length > 0) {
    try {
      state.map.fitBounds(state.geojsonLayer.getBounds(), { padding: [20,20], maxZoom: 15 });
      state._fitDone = true;
    } catch(e){}
  }

  document.getElementById('visible-count').textContent = filtered.length.toLocaleString('vi-VN');
}

function passesFilter(feature) {
  const p = effectiveProps(feature);
  if (!state.filters.de_xuat.has(p.de_xuat)) return false;
  if (!state.filters.xa_cu.has(p.xa_cu)) return false;
  if (!state.filters.loai.has(p.loai || '')) {
    // Cho qua nếu loại trống và không có filter cho ''
    if (p.loai) return false;
  }
  if (state.filters.search) {
    const s = state.filters.search.toLowerCase();
    const hay = `${p.ten || ''} ${p.id} ${p.tbd} ${p.thua}`.toLowerCase();
    if (!hay.includes(s)) return false;
  }
  return true;
}

function selectThua(id, layer) {
  state.selectedId = id;
  const feature = state.features.find(f => f.properties.id === id);
  if (!feature) return;

  // Highlight
  state.geojsonLayer.eachLayer(l => state.geojsonLayer.resetStyle(l));
  if (layer) {
    layer.setStyle({ weight: 3, color: '#ffd966' });
    layer.bringToFront();
    state.map.fitBounds(layer.getBounds(), { padding: [60,60], maxZoom: 19 });
  }
  renderThuaDetail(feature);
}

function renderThuaDetail(feature) {
  const p = effectiveProps(feature);
  const wrap = document.getElementById('thua-detail');
  const chenh = p.dt_tt ? (p.dt_tt - p.dt) : null;
  const ed = state.edits[p.id] || {};

  let html = `
    <div class="thua-header">
      <div class="thua-id">Tờ ${p.tbd} — Thửa ${p.thua}</div>
      <div class="thua-loc">Xã ${p.xa_cu} (cũ)</div>
      <span class="badge ${DX_BADGE[p.de_xuat]}">${DX_LABELS[p.de_xuat]||p.de_xuat}</span>
    </div>

    <div class="detail-section">
      <h4>Thông tin cơ bản</h4>
      <div class="detail-grid">
        <div class="full">
          <div class="label">Chủ sử dụng</div>
          <div class="value">${p.ten || '<span style="color:var(--text-tertiary)">(chưa có)</span>'}</div>
        </div>
        <div>
          <div class="label">DT bản đồ</div>
          <div class="value">${(p.dt||0).toLocaleString('vi-VN')} m²</div>
        </div>
        <div>
          <div class="label">Loại đất</div>
          <div class="value">${p.loai || '—'}${p.loai && LD_NAMES[p.loai] ? ' (' + LD_NAMES[p.loai] + ')' : ''}</div>
        </div>
        <div>
          <div class="label">Đã cấp GCN</div>
          <div class="value">${p.cap_gcn ? '✓ Đã cấp' : 'Chưa cấp'}</div>
        </div>
      </div>
    </div>
  `;

  if (p.b3) {
    html += `
    <div class="detail-section">
      <h4>Hồ sơ rà soát 2019 (Biểu 3)</h4>
      <div class="detail-grid">
        <div class="full">
          <div class="label">Thời gian khoán</div>
          <div class="value">${p.tg_khoan || '(chưa rõ)'}</div>
        </div>
        ${p.dt_gk ? `<div><div class="label">DT giao khoán</div><div class="value">${p.dt_gk.toLocaleString('vi-VN')} m²</div></div>` : ''}
        ${p.dt_o_gk ? `<div><div class="label">- Đất ở</div><div class="value">${p.dt_o_gk.toLocaleString('vi-VN')} m²</div></div>` : ''}
        ${p.dt_cln_gk ? `<div><div class="label">- Cây lâu năm</div><div class="value">${p.dt_cln_gk.toLocaleString('vi-VN')} m²</div></div>` : ''}
        ${p.dt_tt ? `<div><div class="label">DT thực tế 2018</div><div class="value">${p.dt_tt.toLocaleString('vi-VN')} m²</div></div>` : ''}
        ${p.dt_bg ? `<div><div class="label">DT bàn giao 2018</div><div class="value">${p.dt_bg.toLocaleString('vi-VN')} m²</div></div>` : ''}
        ${p.nn ? `<div class="full"><div class="label">Ghi chú gốc</div><div class="value">${p.nn}</div></div>` : ''}
      </div>
      ${chenh !== null && Math.abs(chenh) > 100 ? `<div class="warn-box">⚠️ Chênh lệch DT thực tế vs bản đồ: <strong>${chenh.toFixed(1)} m²</strong> — cần kiểm tra thực địa.</div>` : ''}
    </div>
    `;
  } else {
    html += `<div class="detail-section"><div class="warn-box" style="background:#E6F1FB;color:#185FA5;border-color:#185FA5">ℹ️ Thửa không có trong Biểu 3. Có thể là đất Cty giữ lại, đất giao thông, thủy lợi, hoặc cần rà soát bổ sung.</div></div>`;
  }

  // Phần cập nhật của cán bộ (nếu có)
  if (Object.keys(ed).length > 0) {
    html += `<div class="detail-section"><h4>Cập nhật rà soát</h4><div class="detail-grid">`;
    if (ed.phap_ly) html += `<div class="full"><div class="label">Pháp lý</div><div class="value">${ed.phap_ly}</div></div>`;
    if (ed.ke_khai) html += `<div class="full"><div class="label">Trạng thái kê khai</div><div class="value">${ed.ke_khai}</div></div>`;
    if (ed.ct_loai) html += `<div><div class="label">Công trình</div><div class="value">${ed.ct_loai}${ed.ct_dt?` (${ed.ct_dt} m²)`:''}</div></div>`;
    if (ed.ct_nam) html += `<div><div class="label">Năm xây</div><div class="value">${ed.ct_nam}</div></div>`;
    if (ed.sdt) html += `<div><div class="label">SĐT</div><div class="value">${ed.sdt}</div></div>`;
    if (ed.nguoi_lh) html += `<div><div class="label">Người LH thay</div><div class="value">${ed.nguoi_lh}</div></div>`;
    if (ed.ghi_chu) html += `<div class="full"><div class="label">Ghi chú</div><div class="value">${ed.ghi_chu}</div></div>`;
    if (ed.nguoi_ra_soat) html += `<div class="full"><div class="label">Người rà soát</div><div class="value">${ed.nguoi_ra_soat}${ed.ngay_ra_soat?` (${ed.ngay_ra_soat})`:''}</div></div>`;
    html += `</div></div>`;
  }

  html += `
    <div class="detail-actions">
      <button class="btn btn-primary" onclick="openEditModal('${p.id}')">✏️ Cập nhật</button>
      <button class="btn" onclick="window.print()">🖨️ In phiếu</button>
    </div>
  `;

  wrap.innerHTML = html;
}

/* ============================================================================
 * FILTERS & NAV
 * ============================================================================ */
function initFilters() {
  document.querySelectorAll('[data-filter]').forEach(cb => {
    cb.addEventListener('change', e => {
      const key = e.target.dataset.filter;
      const val = e.target.value;
      if (e.target.checked) state.filters[key].add(val);
      else state.filters[key].delete(val);
      drawGeoJson();
      updateCounts();
    });
  });
  document.getElementById('search-input').addEventListener('input', e => {
    state.filters.search = e.target.value;
    drawGeoJson();
  });
}

function updateCounts() {
  // Đếm theo từng filter
  const counts = {};
  state.features.forEach(f => {
    const p = effectiveProps(f);
    const dxk = 'dx-'+p.de_xuat;
    counts[dxk] = (counts[dxk]||0)+1;
    if (p.xa_cu) counts['xa_cu-'+p.xa_cu] = (counts['xa_cu-'+p.xa_cu]||0)+1;
    if (p.loai) counts['loai-'+p.loai] = (counts['loai-'+p.loai]||0)+1;
  });
  document.querySelectorAll('[data-count]').forEach(el => {
    const k = el.dataset.count;
    el.textContent = (counts[k]||0).toLocaleString('vi-VN');
  });
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b===btn));
      const view = btn.dataset.view;
      ['view-map','view-table','view-dashboard','view-help'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== 'view-'+view);
      });
      if (view === 'dashboard') renderDashboard();
      if (view === 'table') renderTable();
      // Fix map size khi quay lại
      if (view === 'map' && state.map) setTimeout(()=>state.map.invalidateSize(), 50);
    });
  });
}

function renderAll() {
  updateCounts();
}

/* ============================================================================
 * TABLE VIEW
 * ============================================================================ */
function initTableControls() {
  document.getElementById('table-search').addEventListener('input', e => {
    state.table.searchText = e.target.value.toLowerCase();
    state.table.page = 1;
    renderTable();
  });
  document.getElementById('table-xa').addEventListener('change', e => {
    state.table.filterXa = e.target.value; state.table.page=1; renderTable();
  });
  document.getElementById('table-dx').addEventListener('change', e => {
    state.table.filterDx = e.target.value; state.table.page=1; renderTable();
  });
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.table.sortKey === k) state.table.sortDir = state.table.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.table.sortKey = k; state.table.sortDir = 'asc'; }
      renderTable();
    });
  });
}

function getTableData() {
  const t = state.table;
  return state.features
    .map(f => effectiveProps(f))
    .filter(p => {
      if (t.filterXa && p.xa_cu !== t.filterXa) return false;
      if (t.filterDx && p.de_xuat !== t.filterDx) return false;
      if (t.searchText) {
        const hay = (`${p.ten||''} ${p.tbd}-${p.thua}`).toLowerCase();
        if (!hay.includes(t.searchText)) return false;
      }
      return true;
    })
    .sort((a,b) => {
      const k = t.sortKey;
      const va = a[k] ?? '', vb = b[k] ?? '';
      if (typeof va === 'number' || typeof vb === 'number') {
        return (t.sortDir === 'asc' ? 1 : -1) * ((+va) - (+vb));
      }
      return (t.sortDir === 'asc' ? 1 : -1) * String(va).localeCompare(String(vb), 'vi');
    });
}

function renderTable() {
  const data = getTableData();
  const t = state.table;
  const start = (t.page-1) * t.pageSize;
  const slice = data.slice(start, start + t.pageSize);
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = slice.map(p => `
    <tr data-id="${p.id}">
      <td>${p.xa_cu || ''}</td>
      <td>${p.tbd}</td>
      <td>${p.thua}</td>
      <td>${p.ten || ''}</td>
      <td>${p.loai || ''}</td>
      <td class="num">${(p.dt||0).toLocaleString('vi-VN')}</td>
      <td class="num">${p.dt_tt ? p.dt_tt.toLocaleString('vi-VN') : ''}</td>
      <td>${p.tg_khoan || ''}</td>
      <td><span class="badge ${DX_BADGE[p.de_xuat]}">${DX_LABELS[p.de_xuat]||''}</span></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      // Chuyển sang map view và select
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view==='map'));
      ['view-map','view-table','view-dashboard','view-help'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== 'view-map');
      });
      setTimeout(()=>{ if (state.map) state.map.invalidateSize(); selectThua(tr.dataset.id, null); }, 60);
    });
  });

  renderPagination(data.length);
}

function renderPagination(total) {
  const t = state.table;
  const pages = Math.ceil(total / t.pageSize) || 1;
  const wrap = document.getElementById('pagination');
  const buttons = [];
  buttons.push(`<button ${t.page<=1?'disabled':''} onclick="goPage(${t.page-1})">‹</button>`);
  // Show smart pages
  const maxShow = 7;
  let start = Math.max(1, t.page - Math.floor(maxShow/2));
  let end = Math.min(pages, start + maxShow - 1);
  if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
  if (start > 1) buttons.push(`<button onclick="goPage(1)">1</button>${start>2?'<span class="info">…</span>':''}`);
  for (let i = start; i <= end; i++) {
    buttons.push(`<button class="${i===t.page?'active':''}" onclick="goPage(${i})">${i}</button>`);
  }
  if (end < pages) buttons.push(`${end<pages-1?'<span class="info">…</span>':''}<button onclick="goPage(${pages})">${pages}</button>`);
  buttons.push(`<button ${t.page>=pages?'disabled':''} onclick="goPage(${t.page+1})">›</button>`);
  buttons.push(`<span class="info">Tổng: ${total.toLocaleString('vi-VN')} thửa</span>`);
  wrap.innerHTML = buttons.join('');
}

function goPage(p) {
  state.table.page = p;
  renderTable();
  document.getElementById('thua-table-wrap').scrollTop = 0;
}

function exportFilteredCsv() {
  const data = getTableData();
  if (!data.length) { toast('Không có dữ liệu để xuất','err'); return; }
  const headers = ['Tờ BĐ','Thửa','Chủ SD','Loại đất','DT bản đồ (m²)','DT thực tế (m²)','DT bàn giao (m²)','Thời gian khoán','Xã cũ','Đề xuất xử lý','Ghi chú gốc'];
  const rows = data.map(p => [
    p.tbd, p.thua, csvEsc(p.ten||''), p.loai||'', p.dt||'', p.dt_tt||'', p.dt_bg||'',
    csvEsc(p.tg_khoan||''), p.xa_cu||'', DX_LABELS[p.de_xuat]||'', csvEsc(p.nn||'')
  ]);
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r=>r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tracuu_chelongphu_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('Đã xuất CSV','ok');
}
function csvEsc(s) {
  if (s == null) return '';
  s = String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

/* ============================================================================
 * DASHBOARD
 * ============================================================================ */
function renderDashboard() {
  const fs = state.features.map(f => effectiveProps(f));
  const byDx = {}, byXa = {}, byLoai = {}, byTime = {};
  let total = 0;
  for (const p of fs) {
    const dt = p.dt || 0;
    total += dt;
    byDx[p.de_xuat] = byDx[p.de_xuat] || {c:0, a:0}; byDx[p.de_xuat].c++; byDx[p.de_xuat].a += dt;
    if (p.xa_cu) { byXa[p.xa_cu] = byXa[p.xa_cu] || {c:0,a:0}; byXa[p.xa_cu].c++; byXa[p.xa_cu].a += dt; }
    const lk = p.loai || '(trống)';
    byLoai[lk] = byLoai[lk] || {c:0,a:0}; byLoai[lk].c++; byLoai[lk].a += dt;
    if (p.tg_khoan) {
      byTime[p.tg_khoan] = (byTime[p.tg_khoan]||0) + 1;
    }
  }

  // Cards
  document.getElementById('stat-total').textContent = fs.length.toLocaleString('vi-VN');
  document.getElementById('stat-area').textContent = (total/10000).toFixed(2) + ' ha';
  document.getElementById('stat-area-m2').textContent = total.toLocaleString('vi-VN', {maximumFractionDigits:1}) + ' m² đã đo đạc';
  setStat('stat-da','stat-da-ha', byDx['da_bangiao_2018']);
  setStat('stat-tt','stat-tt-ha', byDx['tieptuc_bangiao']);
  setStat('stat-gl','stat-gl-ha', byDx['giulai_cph']);
  document.getElementById('stat-rs').textContent = (byDx['rasoat_them']?.c || 0).toLocaleString('vi-VN') + ' thửa';
  const daRaSoat = Object.values(state.edits).filter(e => e.phap_ly).length;
  document.getElementById('stat-progress').textContent = (daRaSoat / fs.length * 100).toFixed(1) + '%';

  // Bảng theo xã
  document.querySelector('#table-by-xa tbody').innerHTML = Object.entries(byXa)
    .sort((a,b)=>b[1].c-a[1].c)
    .map(([k,v]) => `<tr><td>Xã ${k} (cũ)</td><td class="num">${v.c.toLocaleString('vi-VN')}</td><td class="num">${(v.a/10000).toFixed(2)}</td></tr>`)
    .join('');

  // Bảng theo loại đất
  document.querySelector('#table-by-loai tbody').innerHTML = Object.entries(byLoai)
    .sort((a,b)=>b[1].c-a[1].c)
    .map(([k,v]) => `<tr><td><strong>${k}</strong></td><td>${LD_NAMES[k]||''}</td><td class="num">${v.c.toLocaleString('vi-VN')}</td><td class="num">${(v.a/10000).toFixed(2)}</td></tr>`)
    .join('');

  // Bảng theo thời gian
  const timeOrder = ['Trước 15/10/1993','Từ 15/10/1993 đến 01/7/2004','Từ 01/7/2004 đến 04/11/2008','Từ 04/11/2008 đến 01/7/2014','Từ 01/7/2014 đến 19/8/2019','Chưa có hồ sơ'];
  document.querySelector('#table-by-time tbody').innerHTML = timeOrder
    .filter(k => byTime[k])
    .map(k => `<tr><td>${k}</td><td class="num">${byTime[k].toLocaleString('vi-VN')}</td></tr>`)
    .join('');
}

function setStat(elCount, elHa, group) {
  document.getElementById(elCount).textContent = (group?.c || 0).toLocaleString('vi-VN') + ' thửa';
  document.getElementById(elHa).textContent = ((group?.a || 0)/10000).toFixed(2) + ' ha';
}

/* ============================================================================
 * EDIT MODAL
 * ============================================================================ */
let editingId = null;
function openEditModal(id) {
  editingId = id;
  const ed = state.edits[id] || {};
  document.getElementById('edit-thua-id').textContent = id;
  document.getElementById('edit-phap-ly').value = ed.phap_ly || '';
  document.getElementById('edit-ke-khai').value = ed.ke_khai || '';
  document.getElementById('edit-ct-dt').value = ed.ct_dt || '';
  document.getElementById('edit-ct-nam').value = ed.ct_nam || '';
  document.getElementById('edit-ct-loai').value = ed.ct_loai || '';
  document.getElementById('edit-sdt').value = ed.sdt || '';
  document.getElementById('edit-nguoi-lh').value = ed.nguoi_lh || '';
  document.getElementById('edit-ghi-chu').value = ed.ghi_chu || '';
  document.getElementById('edit-nguoi-ra-soat').value = ed.nguoi_ra_soat || '';
  document.getElementById('edit-ngay-ra-soat').value = ed.ngay_ra_soat || new Date().toISOString().slice(0,10);
  document.getElementById('edit-modal').classList.add('open');
}
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}
function saveEditClassification() {
  if (!editingId) return;
  state.edits[editingId] = {
    phap_ly: document.getElementById('edit-phap-ly').value,
    ke_khai: document.getElementById('edit-ke-khai').value,
    ct_dt: document.getElementById('edit-ct-dt').value,
    ct_nam: document.getElementById('edit-ct-nam').value,
    ct_loai: document.getElementById('edit-ct-loai').value,
    sdt: document.getElementById('edit-sdt').value,
    nguoi_lh: document.getElementById('edit-nguoi-lh').value,
    ghi_chu: document.getElementById('edit-ghi-chu').value,
    nguoi_ra_soat: document.getElementById('edit-nguoi-ra-soat').value,
    ngay_ra_soat: document.getElementById('edit-ngay-ra-soat').value,
  };
  // Bỏ key rỗng
  Object.keys(state.edits[editingId]).forEach(k => {
    if (!state.edits[editingId][k]) delete state.edits[editingId][k];
  });
  if (Object.keys(state.edits[editingId]).length === 0) delete state.edits[editingId];

  saveEdits();
  closeEditModal();
  toast('Đã lưu vào trình duyệt','ok');
  // Refresh chi tiết
  const feature = state.features.find(f => f.properties.id === editingId);
  if (feature) renderThuaDetail(feature);
}

/* ============================================================================
 * TOAST
 * ============================================================================ */
let toastTimer;
function toast(msg, type='') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// Mobile placeholder
function closeRightbarMobile(){}

// ===== Start =====
init();
