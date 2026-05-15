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
  const T0 = performance.now();
  console.log('[INIT] Bắt đầu');

  loadEdits();

  const t1 = performance.now();
  await loadData();
  console.log(`[INIT] loadData: ${(performance.now()-t1).toFixed(0)}ms`);

  const t2 = performance.now();
  initMap();
  console.log(`[INIT] initMap (vẽ ${state.features.length} polygon): ${(performance.now()-t2).toFixed(0)}ms`);

  initFilters();
  initNav();
  initTableControls();
  initMobileBehavior();
  autoCollapseQhPanelOnMobile();
  renderAll();

  console.log(`[INIT] TỔNG: ${(performance.now()-T0).toFixed(0)}ms`);
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
  const loadingEl = document.getElementById('map-loading');
  const t0 = performance.now();

  // Timeout 30s
  const timeoutId = setTimeout(() => {
    loadingEl.innerHTML = '<div style="color:var(--danger);text-align:center">⚠️ Tải dữ liệu quá lâu (>30s)<br><small style="color:var(--text-secondary);font-weight:normal">Kiểm tra mạng hoặc thử lại sau</small></div>';
  }, 30000);

  // Thử cả cùng folder và data/
  let res, url;
  for (const u of ['diachinh.geojson', 'data/diachinh.geojson']) {
    try {
      res = await fetch(u);
      if (res.ok) { url = u; break; }
    } catch(e){
      console.error('[DATA] Fetch error:', e);
    }
  }
  clearTimeout(timeoutId);

  if (!res || !res.ok) {
    loadingEl.innerHTML = `<div style="color:var(--danger);text-align:center">
      ⚠️ Không tải được file diachinh.geojson<br>
      <small style="color:var(--text-secondary);font-weight:normal">Kiểm tra file đã upload đầy đủ lên repo chưa</small>
    </div>`;
    return;
  }
  console.log(`[DATA] Fetch xong: ${(performance.now()-t0).toFixed(0)}ms (từ ${url})`);

  const t1 = performance.now();
  let data;
  try {
    data = await res.json();
  } catch(e) {
    loadingEl.innerHTML = `<div style="color:var(--danger);text-align:center">
      ⚠️ File diachinh.geojson bị lỗi hoặc không phải JSON hợp lệ<br>
      <small style="color:var(--text-secondary);font-weight:normal">${e.message}</small>
    </div>`;
    return;
  }
  console.log(`[DATA] Parse JSON: ${(performance.now()-t1).toFixed(0)}ms (${data.features?.length || 0} features)`);

  if (!data.features || data.features.length === 0) {
    loadingEl.innerHTML = `<div style="color:var(--danger)">⚠️ File rỗng hoặc sai định dạng GeoJSON</div>`;
    return;
  }

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
    zoomAnimation: true,
    fadeAnimation: false,
  }).setView([20.952, 105.553], 14);

  // Tạo pane riêng cho QH layers - z-index THẤP hơn overlayPane mặc định (400)
  // → QH nằm dưới thửa đất, click vẫn vào thửa đất được
  state.map.createPane('qhPane');
  state.map.getPane('qhPane').style.zIndex = 350;
  // Renderer riêng cho QH pane
  state.qhRenderer = L.canvas({ pane: 'qhPane' });

  // Dùng OpenStreetMap + ArcGIS giống Việt Mông (đã verify chạy được)
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

  // Ẩn loading NGAY khi map có tile - không chờ vẽ polygon
  document.getElementById('map-loading').classList.add('hidden');

  // Defer vẽ polygon - cho map render xong tiles trước
  requestAnimationFrame(() => {
    setTimeout(() => drawGeoJson(), 50);
  });
}

function drawGeoJson() {
  if (!state.map) return;
  if (state.geojsonLayer) state.map.removeLayer(state.geojsonLayer);

  const t0 = performance.now();
  const filtered = state.features.filter(passesFilter);
  console.log(`[DRAW] Filter: ${(performance.now()-t0).toFixed(0)}ms (${filtered.length} polygons)`);

  const t1 = performance.now();
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
    }
  }).addTo(state.map);
  console.log(`[DRAW] L.geoJSON addTo: ${(performance.now()-t1).toFixed(0)}ms`);

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

  // Nếu không truyền layer, tự tìm trong geojsonLayer hiện tại
  // (xảy ra khi click từ bảng Tra cứu hoặc Biểu rà soát)
  if (!layer && state.geojsonLayer) {
    state.geojsonLayer.eachLayer(l => {
      if (l.feature && l.feature.properties.id === id) {
        layer = l;
      }
    });
  }

  // Reset style các layer khác
  if (state.geojsonLayer) {
    state.geojsonLayer.eachLayer(l => state.geojsonLayer.resetStyle(l));
  }

  // Highlight + zoom đến thửa được chọn
  if (layer) {
    layer.setStyle({ weight: 3, color: '#ffd966' });
    layer.bringToFront();
    state.map.fitBounds(layer.getBounds(), { padding: [60,60], maxZoom: 19 });
  } else if (feature.geometry) {
    // Fallback: nếu thửa bị filter ẩn, vẫn zoom đến tọa độ
    try {
      const tmpLayer = L.geoJSON(feature);
      state.map.fitBounds(tmpLayer.getBounds(), { padding: [60,60], maxZoom: 19 });
    } catch(e) {}
  }

  renderThuaDetail(feature);

  // Mobile: tự động mở rightbar
  if (isMobile()) {
    openMobileRightbar();
  }
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
    html += `<div class="detail-section"><div class="warn-box" style="background:#E6F1FB;color:#185FA5;border-color:#185FA5">ℹ️ Thửa đất không nằm trong đợt bàn giao năm 2018, cần rà soát thông tin phục vụ trả lại xã tiếp nhận lập phương án.</div></div>`;
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
    if (ed.anh_ht && ed.anh_ht.length) {
      html += `<div class="full"><div class="label">📷 Ảnh hiện trạng (${ed.anh_ht.length})</div><div class="img-preview-grid">`;
      ed.anh_ht.forEach((f, i) => {
        const inner = f.type === 'application/pdf'
          ? `<div class="pdf-icon" title="${f.name}">📄</div>`
          : `<img src="${f.data}" alt="${f.name}" title="${f.name}">`;
        html += `<div class="img-item" onclick="viewImage('${p.id}','anh_ht',${i})">${inner}</div>`;
      });
      html += `</div></div>`;
    }
    if (ed.anh_gt && ed.anh_gt.length) {
      html += `<div class="full"><div class="label">📄 Giấy tờ pháp lý (${ed.anh_gt.length})</div><div class="img-preview-grid">`;
      ed.anh_gt.forEach((f, i) => {
        const inner = f.type === 'application/pdf'
          ? `<div class="pdf-icon" title="${f.name}">📄</div>`
          : `<img src="${f.data}" alt="${f.name}" title="${f.name}">`;
        html += `<div class="img-item" onclick="viewImage('${p.id}','anh_gt',${i})">${inner}</div>`;
      });
      html += `</div></div>`;
    }
    html += `</div></div>`;
  }

  html += `
    <div class="detail-actions">
      <button class="btn btn-primary" onclick="openEditPanel('${p.id}')">✏️ Cập nhật</button>
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
      const view = btn.dataset.view;

      // Tab "Liên hệ" đặc biệt: chỉ hiện info trong rightbar, không đổi view
      if (view === 'contact') {
        // LUÔN chuyển về view bản đồ trước (vì rightbar chỉ có ở view map)
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'map'));
        ['view-map','view-table','view-dashboard','view-report','view-help'].forEach(id => {
          document.getElementById(id).classList.toggle('hidden', id !== 'view-map');
        });
        // Render contact vào rightbar
        showContactInRightbar();
        // Fix map size
        setTimeout(()=>state.map && state.map.invalidateSize(), 50);
        // Mở rightbar trên mobile
        if (isMobile()) openMobileRightbar();
        return;
      }

      // Các tab khác như cũ
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b===btn));
      ['view-map','view-table','view-dashboard','view-report','view-help'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== 'view-'+view);
      });
      if (view === 'dashboard') renderDashboard();
      if (view === 'table') renderTable();
      if (view === 'report') renderReport();
      // Fix map size khi quay lại
      if (view === 'map' && state.map) setTimeout(()=>state.map.invalidateSize(), 50);
    });
  });
}

function goToContact() {
  const btn = document.querySelector('.nav-btn[data-view="contact"]');
  if (btn) btn.click();
}

function showContactInRightbar() {
  const wrap = document.getElementById('thua-detail');
  wrap.innerHTML = `
    <div class="contact-card">
      <div class="contact-header">
        <img src="logo.jpg" alt="Thanh Hà" class="contact-logo">
        <div class="contact-header-text">
          <div class="contact-tag">Đơn vị xây dựng hệ thống</div>
          <h3 class="contact-name">CÔNG TY CỔ PHẦN TƯ VẤN ỨNG DỤNG VÀ PHÁT TRIỂN CÔNG NGHỆ THANH HÀ</h3>
        </div>
      </div>

      <p class="contact-slogan">
        Tư vấn chuyên sâu về Quản lý, sử dụng đất đai – Điều tra cơ bản đất đai – Thống kê, kiểm kê đất đai, lập bản đồ hiện trạng sử dụng đất – Quy hoạch đất đai – WebGIS – Chuyển đổi số trong quản lý đất đai.
      </p>

      <div class="contact-services">
        <span class="contact-chip">📍 Lập phương án SDĐ</span>
        <span class="contact-chip">🗺️ WebGIS</span>
        <span class="contact-chip">⚖️ Pháp lý đất đai</span>
        <span class="contact-chip">📋 Hồ sơ thủ tục</span>
      </div>

      <div class="contact-info">
        <div class="contact-info-row">
          <span class="contact-icon">🏢</span>
          <div>
            <div class="contact-label">Trụ sở chính</div>
            <div class="contact-value">Số 267, Tằng My, xã Phúc Thịnh, TP Hà Nội</div>
          </div>
        </div>
        <div class="contact-info-row">
          <span class="contact-icon">🏬</span>
          <div>
            <div class="contact-label">Chi nhánh văn phòng</div>
            <div class="contact-value">HH2D Xuân Mai Complex, P. Yên Nghĩa, TP Hà Nội</div>
          </div>
        </div>
        <div class="contact-info-row">
          <span class="contact-icon">✉️</span>
          <div>
            <div class="contact-label">Email</div>
            <div class="contact-value"><a href="mailto:thanhha.dacjsc@gmail.com">thanhha.dacjsc@gmail.com</a></div>
          </div>
        </div>
        <div class="contact-info-row">
          <span class="contact-icon">📞</span>
          <div>
            <div class="contact-label">Điện thoại</div>
            <div class="contact-value">
              <a href="tel:0911558628"><strong>0911 558 628</strong></a>
              <div class="contact-person">Ông Phạm Văn Tuấn</div>
            </div>
          </div>
        </div>
      </div>

      <div class="contact-actions">
        <a href="tel:0911558628" class="btn btn-primary contact-btn-call">📞 Gọi</a>
        <a href="mailto:thanhha.dacjsc@gmail.com?subject=Liên hệ tư vấn từ WebGIS Long Phú" class="btn contact-btn-email">✉️ Email</a>
      </div>

      <p class="contact-note">
        Quý cơ quan, đơn vị và đối tác có nhu cầu tư vấn rà soát đất đai, lập phương án sử dụng đất, đối chiếu quy hoạch, xây dựng WebGIS hoặc số hóa hồ sơ địa chính... vui lòng liên hệ trực tiếp để được hỗ trợ.
      </p>
    </div>
  `;
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
      ['view-map','view-table','view-dashboard','view-report','view-help'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== 'view-map');
      });
      setTimeout(()=>{
        if (state.map) state.map.invalidateSize();
        selectThua(tr.dataset.id, null);
      }, 120);
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
 * LỚP QUY HOẠCH (lazy-load khi user bật toggle)
 * ============================================================================ */
const QH_PHANKHU_COLORS = {
  // Bảng màu chuẩn QHSDD theo TT 09/2021
  'ONT': {fill:'#FFFFAA', stroke:'#D4A017', label:'Đất ở nông thôn'},
  'DKV': {fill:'#FFD4B3', stroke:'#D77A2E', label:'Đất khu vực (đất ở mới)'},
  'DGT': {fill:'#C8C8C8', stroke:'#777777', label:'Đất giao thông'},
  'DTL': {fill:'#A4D7E1', stroke:'#3782A0', label:'Đất thủy lợi'},
  'SON': {fill:'#B4D6F0', stroke:'#3F76B8', label:'Sông, suối, mặt nước'},
  'MNC': {fill:'#B4D6F0', stroke:'#3F76B8', label:'Mặt nước chuyên dùng'},
  'DGD': {fill:'#FFC8C8', stroke:'#C84545', label:'Đất giáo dục'},
  'DYT': {fill:'#FFD0DD', stroke:'#C8569F', label:'Đất y tế'},
  'DVH': {fill:'#E5C8E5', stroke:'#9B4A9B', label:'Đất văn hóa'},
  'TMD': {fill:'#FFB4B4', stroke:'#C83838', label:'Đất thương mại dịch vụ'},
  'DVO': {fill:'#FFCC99', stroke:'#CC7733', label:'Đất ở đô thị (dự kiến)'},
  'DHT': {fill:'#D2D2D2', stroke:'#666666', label:'Đất hạ tầng kỹ thuật'},
  'DTT': {fill:'#C8E6B4', stroke:'#5C8F3D', label:'Đất thể dục thể thao'},
  'HH': {fill:'#E8E8E8', stroke:'#888888', label:'Đất hỗn hợp'},
  'CCC': {fill:'#FFD6B3', stroke:'#C87A2E', label:'Đất công cộng'},
  'CQP': {fill:'#B5C7B5', stroke:'#4F6B4F', label:'Đất quốc phòng'},
  'DLN': {fill:'#A8D9A8', stroke:'#508B50', label:'Đất lâm nghiệp'},
  'TIN': {fill:'#D2D2D2', stroke:'#666666', label:'Đất truyền thông'},
  'TSC': {fill:'#E5C8E5', stroke:'#9B4A9B', label:'Đất trụ sở cơ quan'},
};

const QH_CHUNG_COLORS = {
  'NN':  {fill:'#E5F0D5', stroke:'#7A9148', label:'Đất nông nghiệp'},
  'NTS': {fill:'#B4D6F0', stroke:'#3F76B8', label:'Nuôi trồng thủy sản / mặt nước'},
  'LN':  {fill:'#A8D9A8', stroke:'#508B50', label:'Đất lâm nghiệp'},
  'DGD': {fill:'#FFC8C8', stroke:'#C84545', label:'Đất giáo dục (trường học)'},
  'DYT': {fill:'#FFD0DD', stroke:'#C8569F', label:'Đất y tế (bệnh viện)'},
  'CCC': {fill:'#FFD6B3', stroke:'#C87A2E', label:'Đất công cộng'},
  'DCX': {fill:'#A8D9A8', stroke:'#508B50', label:'Đất cây xanh / cảnh quan'},
  'TSC': {fill:'#E5C8E5', stroke:'#9B4A9B', label:'Đất cơ quan'},
  'DDL': {fill:'#FFD4B3', stroke:'#D77A2E', label:'Đất du lịch'},
  'DGT': {fill:'#C8C8C8', stroke:'#777777', label:'Giao thông, thủy lợi'},
  'NTD': {fill:'#D9C8B4', stroke:'#876B4D', label:'Nghĩa trang, nghĩa địa'},
  'TT':  {fill:'#FFE6B3', stroke:'#C8951A', label:'Đất trang trại'},
  'ONT': {fill:'#FFFFAA', stroke:'#D4A017', label:'Đất ở / dãn dân'},
  'TON': {fill:'#E5C8E5', stroke:'#9B4A9B', label:'Đất tôn giáo'},
  'HT':  {fill:'#D2D2D2', stroke:'#666666', label:'Hạ tầng kỹ thuật'},
  'KXD': {fill:'#F2F2F2', stroke:'#999999', label:'Khu vực không xây dựng'},
  'DTH': {fill:'#FFEEAA', stroke:'#B89020', label:'Đất khác (dự kiến)'},
  'OTHER': {fill:'#E0E0E0', stroke:'#888888', label:'Khác / chưa phân loại'},
};

// State cho QH layers
const qhLayers = {
  phankhu: { data: null, layer: null, opacity: 0.55, loading: false },
  chung:   { data: null, layer: null, opacity: 0.45, loading: false },
};

async function loadQhData(key) {
  if (qhLayers[key].data) return qhLayers[key].data;
  if (qhLayers[key].loading) return null;
  qhLayers[key].loading = true;
  const fileName = key === 'phankhu' ? 'qh_phankhu.geojson' : 'qh_chung.geojson';
  // Thử cả cùng folder và data/
  let res, lastErr;
  for (const u of [fileName, 'data/' + fileName]) {
    try {
      res = await fetch(u);
      if (res.ok) break;
    } catch(e) { lastErr = e; }
  }
  try {
    if (!res || !res.ok) throw new Error('Không tìm thấy ' + fileName);
    const data = await res.json();
    qhLayers[key].data = data;
    qhLayers[key].loading = false;
    return data;
  } catch(e) {
    qhLayers[key].loading = false;
    toast('Lỗi tải lớp quy hoạch: ' + e.message, 'err');
    return null;
  }
}

function qhStyle(key, props) {
  let color;
  if (key === 'phankhu') {
    color = QH_PHANKHU_COLORS[props.dtsd] || QH_PHANKHU_COLORS['HH'];
  } else {
    color = QH_CHUNG_COLORS[props.nhom] || QH_CHUNG_COLORS['OTHER'];
  }
  return {
    fillColor: color.fill,
    color: color.stroke,
    weight: 0.7,
    fillOpacity: qhLayers[key].opacity,
    opacity: Math.min(1, qhLayers[key].opacity + 0.25)
  };
}

async function toggleQhLayer(key, checked) {
  const subEl = document.getElementById('qh-' + key + '-count');
  const opacityWrap = document.getElementById('qh-' + key + '-opacity-wrap');
  const legendEl = document.getElementById('qh-' + key + '-legend');

  if (!checked) {
    // Tắt layer
    if (qhLayers[key].layer) {
      state.map.removeLayer(qhLayers[key].layer);
    }
    opacityWrap.style.display = 'none';
    legendEl.style.display = 'none';
    updatePaneZIndex();
    return;
  }

  // Bật: lazy load
  if (!qhLayers[key].data) {
    subEl.textContent = 'Đang tải...';
    const data = await loadQhData(key);
    if (!data) {
      document.getElementById('qh-' + key + '-toggle').checked = false;
      subEl.textContent = '⚠️ Tải thất bại';
      return;
    }
    subEl.textContent = `${data.features.length} đối tượng`;
    buildQhLegend(key);
  }

  // Tạo layer nếu chưa có
  if (!qhLayers[key].layer) {
    const data = qhLayers[key].data;
    qhLayers[key].layer = L.geoJSON(data, {
      pane: 'qhPane',
      renderer: state.qhRenderer,
      interactive: true,
      style: f => qhStyle(key, f.properties),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        let popup;
        if (key === 'phankhu') {
          const c = QH_PHANKHU_COLORS[p.dtsd] || {label: p.dtsd};
          popup = `<div style="font-size:12px;line-height:1.5">
            <strong style="color:#0F6E56">QH phân khu HL-05/06</strong><br>
            Mã: <b>${p.dtsd}</b> — ${c.label}<br>
            ${p.ten ? `<span style="font-size:11px;color:#666">${p.ten}</span>` : ''}
          </div>`;
        } else {
          const c = QH_CHUNG_COLORS[p.nhom] || {label: 'Khác'};
          popup = `<div style="font-size:12px;line-height:1.5">
            <strong style="color:#0F6E56">QH chung xã</strong><br>
            Nhóm: <b>${c.label}</b><br>
            ${p.ten ? `<span style="font-size:11px;color:#666">${p.ten}</span>` : ''}
          </div>`;
        }
        layer.bindPopup(popup);
      }
    });
  }

  qhLayers[key].layer.addTo(state.map);
  updatePaneZIndex();

  opacityWrap.style.display = 'flex';
  legendEl.style.display = 'block';
}

/**
 * Cập nhật z-index của pane QH theo trạng thái lớp:
 * - Có ít nhất 1 lớp QH đang bật → QH trên cùng (450 > overlayPane 400)
 *   → click vào ô QH thấy popup QH, không phải thửa đất
 * - Tất cả QH đều tắt → QH dưới thửa đất (350)
 *   → click ưu tiên thửa đất (như mặc định)
 *
 * Khi nhiều lớp QH cùng bật, lớp bật SAU sẽ nhận click trước
 * (vì add sau trong cùng pane Canvas).
 */
function updatePaneZIndex() {
  const pane = state.map.getPane('qhPane');
  if (!pane) return;
  const anyOn = Object.keys(qhLayers).some(k =>
    qhLayers[k].layer && state.map.hasLayer(qhLayers[k].layer)
  );
  pane.style.zIndex = anyOn ? 450 : 350;
}

function setQhOpacity(key, val) {
  qhLayers[key].opacity = (+val) / 100;
  if (qhLayers[key].layer) {
    qhLayers[key].layer.setStyle(f => qhStyle(key, f.properties));
  }
}

function buildQhLegend(key) {
  const legendEl = document.getElementById('qh-' + key + '-legend');
  const titleHtml = `<div class="qh-legend-title">Chú giải QH ${key==='phankhu'?'phân khu':'chung'}</div>`;
  const data = qhLayers[key].data;
  const colors = key === 'phankhu' ? QH_PHANKHU_COLORS : QH_CHUNG_COLORS;
  const propKey = key === 'phankhu' ? 'dtsd' : 'nhom';

  // Đếm các nhóm thực tế có trong data
  const counts = {};
  data.features.forEach(f => {
    const k = f.properties[propKey];
    if (k) counts[k] = (counts[k] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  const rowsHtml = sorted.map(([k, count]) => {
    const c = colors[k] || colors['OTHER'] || colors['HH'];
    return `<div class="qh-legend-row">
      <span class="swatch" style="background:${c.fill};border:0.5px solid ${c.stroke}"></span>
      <span>${k} — ${c.label} <span style="color:#999">(${count})</span></span>
    </div>`;
  }).join('');

  legendEl.innerHTML = titleHtml + rowsHtml;
}

function toggleQhPanel() {
  const panel = document.getElementById('qh-panel');
  panel.classList.toggle('collapsed');
}

// Đóng panel quy hoạch mặc định trên mobile (tiết kiệm không gian)
function autoCollapseQhPanelOnMobile() {
  if (isMobile()) {
    document.getElementById('qh-panel').classList.add('collapsed');
  }
}

/* ============================================================================
 * UPLOAD ẢNH - lưu dưới dạng base64 vào localStorage
 * Giới hạn ~1MB/ảnh, resize nếu lớn hơn
 * ============================================================================ */
const MAX_IMG_DIM = 1280;     // resize ảnh lớn xuống max 1280px
const MAX_IMG_BYTES = 800000; // ~800KB cho mỗi ảnh sau encode base64

// Lưu file đang chọn trong panel hiện tại (sẽ commit khi bấm Lưu)
let pendingFiles = { anh_ht: [], anh_gt: [] };

async function onPickImages(input, key) {
  const files = Array.from(input.files || []);
  for (const file of files) {
    try {
      let dataUrl;
      if (file.type === 'application/pdf') {
        // PDF: chỉ lưu metadata, không resize
        if (file.size > 3 * 1024 * 1024) {
          toast(`File ${file.name} > 3MB - bỏ qua`, 'err');
          continue;
        }
        dataUrl = await fileToBase64(file);
      } else {
        // Ảnh: resize nếu lớn
        dataUrl = await resizeImage(file, MAX_IMG_DIM);
      }
      pendingFiles[key].push({
        name: file.name,
        type: file.type,
        size: dataUrl.length,
        data: dataUrl
      });
    } catch (e) {
      toast('Lỗi xử lý ảnh: ' + e.message, 'err');
    }
  }
  input.value = ''; // reset để chọn lại được cùng file
  renderImagePreview(key);
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function resizeImage(file, maxDim) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim/width, maxDim/height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      // Quality tự động giảm để vừa MAX_IMG_BYTES
      let q = 0.85;
      let out = canvas.toDataURL('image/jpeg', q);
      while (out.length > MAX_IMG_BYTES && q > 0.4) {
        q -= 0.1;
        out = canvas.toDataURL('image/jpeg', q);
      }
      res(out);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function renderImagePreview(key) {
  const el = document.getElementById('preview-'+key);
  if (!el) return;
  el.innerHTML = pendingFiles[key].map((f, i) => {
    const inner = f.type === 'application/pdf'
      ? `<div class="pdf-icon" title="${f.name}">📄</div>`
      : `<img src="${f.data}" alt="${f.name}" title="${f.name}">`;
    return `<div class="img-item">${inner}<button class="del-btn" onclick="removeImage('${key}',${i})" title="Xóa">×</button></div>`;
  }).join('');
}

function removeImage(key, index) {
  pendingFiles[key].splice(index, 1);
  renderImagePreview(key);
}

function viewImage(thuaId, key, index) {
  const ed = state.edits[thuaId];
  if (!ed || !ed[key] || !ed[key][index]) return;
  const f = ed[key][index];
  if (f.type === 'application/pdf') {
    // Mở PDF trong tab mới
    const w = window.open();
    if (w) w.location = f.data;
    return;
  }
  // Lightbox đơn giản
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px';
  overlay.innerHTML = `<img src="${f.data}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:6px"><div style="position:absolute;top:14px;right:18px;color:white;font-size:24px;cursor:pointer">×</div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

/* ============================================================================
 * BIỂU TỔNG HỢP RÀ SOÁT + XUẤT EXCEL
 * ============================================================================ */
function getReportData() {
  // Trả về danh sách các thửa đã được cập nhật (có trong state.edits)
  return Object.entries(state.edits).map(([id, ed]) => {
    const feat = state.features.find(f => f.properties.id === id);
    if (!feat) return null;
    const p = feat.properties;
    return {
      id, tbd: p.tbd, thua: p.thua, xa_cu: p.xa_cu, ten: p.ten || '',
      loai: p.loai || '', dt: p.dt || 0, dt_tt: p.dt_tt || '', dt_bg: p.dt_bg || '',
      tg_khoan: p.tg_khoan || '', de_xuat: DX_LABELS[p.de_xuat] || p.de_xuat,
      nn: p.nn || '',
      phap_ly: ed.phap_ly || '', ke_khai: ed.ke_khai || '',
      ct_loai: ed.ct_loai || '', ct_dt: ed.ct_dt || '', ct_nam: ed.ct_nam || '',
      sdt: ed.sdt || '', nguoi_lh: ed.nguoi_lh || '',
      ghi_chu: ed.ghi_chu || '',
      anh_ht: ed.anh_ht || [], anh_gt: ed.anh_gt || [],
      nguoi_ra_soat: ed.nguoi_ra_soat || '', ngay_ra_soat: ed.ngay_ra_soat || ''
    };
  }).filter(x => x).sort((a,b) => (a.tbd - b.tbd) || (a.thua - b.thua));
}

function renderReport() {
  const data = getReportData();
  const summary = document.getElementById('report-summary');
  const tbody = document.getElementById('report-table-body');

  if (data.length === 0) {
    summary.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có thửa nào được cập nhật. Click vào thửa trên bản đồ → Cập nhật để thêm thông tin rà soát.</div>';
    tbody.innerHTML = '';
    return;
  }

  // Tổng kết
  const byPhapLy = {}, byKeKhai = {}, byNguoi = {};
  let tongDT = 0;
  data.forEach(d => {
    tongDT += +d.dt || 0;
    if (d.phap_ly) byPhapLy[d.phap_ly] = (byPhapLy[d.phap_ly]||0) + 1;
    if (d.ke_khai) byKeKhai[d.ke_khai] = (byKeKhai[d.ke_khai]||0) + 1;
    if (d.nguoi_ra_soat) byNguoi[d.nguoi_ra_soat] = (byNguoi[d.nguoi_ra_soat]||0) + 1;
  });

  summary.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:10px">
      <div><strong>Tổng số thửa đã rà soát:</strong> ${data.length.toLocaleString('vi-VN')} / ${state.features.length.toLocaleString('vi-VN')} (${(data.length/state.features.length*100).toFixed(1)}%)</div>
      <div><strong>Tổng diện tích:</strong> ${(tongDT/10000).toFixed(2)} ha</div>
      <div><strong>Số cán bộ tham gia:</strong> ${Object.keys(byNguoi).length}</div>
    </div>
    ${Object.keys(byPhapLy).length ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><strong>Phân loại pháp lý:</strong> ${Object.entries(byPhapLy).map(([k,v])=>`${k} (${v})`).join(' • ')}</div>` : ''}
    ${Object.keys(byKeKhai).length ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px"><strong>Trạng thái kê khai:</strong> ${Object.entries(byKeKhai).map(([k,v])=>`${k} (${v})`).join(' • ')}</div>` : ''}
  `;

  tbody.innerHTML = data.map(d => {
    const ctText = d.ct_loai ? `${d.ct_loai}${d.ct_dt?` (${d.ct_dt}m²)`:''}${d.ct_nam?`, ${d.ct_nam}`:''}` : '';
    return `<tr>
      <td>${d.tbd}</td>
      <td>${d.thua}</td>
      <td>${d.xa_cu}</td>
      <td>${d.ten}</td>
      <td>${d.loai}</td>
      <td class="num">${d.dt.toLocaleString('vi-VN')}</td>
      <td>${d.de_xuat}</td>
      <td>${d.phap_ly}</td>
      <td>${d.ke_khai}</td>
      <td>${ctText}</td>
      <td>${d.sdt}</td>
      <td style="max-width:200px;white-space:normal">${d.ghi_chu}</td>
      <td>${d.nguoi_ra_soat}</td>
      <td>${d.ngay_ra_soat}</td>
      <td><button class="btn" style="padding:3px 8px;font-size:11px" onclick="goToThua('${d.id}')">📍 Xem</button> <button class="btn" style="padding:3px 8px;font-size:11px;color:var(--danger)" onclick="deleteEdit('${d.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function goToThua(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'map'));
  ['view-map','view-table','view-dashboard','view-report','view-help'].forEach(elid => {
    document.getElementById(elid).classList.toggle('hidden', elid !== 'view-map');
  });
  setTimeout(()=>{
    if (state.map) state.map.invalidateSize();
    selectThua(id, null);
  }, 120);
}

function deleteEdit(id) {
  if (!confirm(`Xóa thông tin rà soát của thửa ${id}?`)) return;
  delete state.edits[id];
  saveEdits();
  renderReport();
  toast('Đã xóa','ok');
}

function exportReportJson() {
  const data = getReportData();
  if (!data.length) { toast('Chưa có dữ liệu','err'); return; }
  const out = {
    ten_du_an: 'Rà soát đất Công ty CP Chè Long Phú',
    don_vi: 'UBND xã Phú Cát',
    ngay_xuat: new Date().toISOString(),
    tong_so_thua_da_rasoat: data.length,
    du_lieu: data,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rasoat_chelongphu_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('Đã xuất JSON','ok');
}

function exportReportExcel() {
  const data = getReportData();
  if (!data.length) { toast('Chưa có dữ liệu','err'); return; }
  if (typeof XLSX === 'undefined') { toast('Thư viện xuất Excel chưa tải','err'); return; }

  // Sheet 1: BIỂU TỔNG HỢP
  const headers = [
    'STT','Tờ BĐ','Thửa','Xã cũ','Chủ sử dụng','Loại đất','DT bản đồ (m²)','DT thực tế (m²)','DT bàn giao (m²)',
    'Thời gian khoán','Đề xuất xử lý','Ghi chú gốc Biểu 3',
    'Pháp lý hiện tại','Trạng thái kê khai',
    'Loại công trình','DT công trình (m²)','Năm xây',
    'SĐT chủ SD','Người liên hệ thay',
    'Ghi chú rà soát','Số ảnh hiện trạng','Số giấy tờ','Người rà soát','Ngày rà soát'
  ];
  const rows = data.map((d,i) => [
    i+1, d.tbd, d.thua, d.xa_cu, d.ten, d.loai, d.dt, d.dt_tt, d.dt_bg,
    d.tg_khoan, d.de_xuat, d.nn,
    d.phap_ly, d.ke_khai,
    d.ct_loai, d.ct_dt, d.ct_nam,
    d.sdt, d.nguoi_lh,
    d.ghi_chu,
    (d.anh_ht || []).length,
    (d.anh_gt || []).length,
    d.nguoi_ra_soat, d.ngay_ra_soat
  ]);

  const titleRows = [
    ['BIỂU TỔNG HỢP KẾT QUẢ RÀ SOÁT THỬA ĐẤT'],
    ['Dự án: Rà soát đất Công ty CP Chè Long Phú - UBND xã Phú Cát'],
    [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} - Tổng số thửa đã rà soát: ${data.length}`],
    [],
    headers,
    ...rows
  ];

  const ws = XLSX.utils.aoa_to_sheet(titleRows);
  // Merge title cells
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:headers.length-1}},
    {s:{r:1,c:0},e:{r:1,c:headers.length-1}},
    {s:{r:2,c:0},e:{r:2,c:headers.length-1}},
  ];
  // Column widths
  ws['!cols'] = [
    {wch:5},{wch:6},{wch:7},{wch:12},{wch:25},{wch:10},{wch:11},{wch:11},{wch:11},
    {wch:22},{wch:25},{wch:30},
    {wch:22},{wch:22},
    {wch:18},{wch:11},{wch:8},
    {wch:15},{wch:18},
    {wch:30},{wch:18},{wch:12}
  ];

  // Sheet 2: TỔNG KẾT
  const byPhapLy = {}, byKeKhai = {}, byNguoi = {}, byDeXuat = {}, byXa = {};
  let tongDT = 0;
  data.forEach(d => {
    tongDT += +d.dt || 0;
    if (d.phap_ly) byPhapLy[d.phap_ly] = (byPhapLy[d.phap_ly]||0)+1;
    if (d.ke_khai) byKeKhai[d.ke_khai] = (byKeKhai[d.ke_khai]||0)+1;
    if (d.nguoi_ra_soat) byNguoi[d.nguoi_ra_soat] = (byNguoi[d.nguoi_ra_soat]||0)+1;
    if (d.de_xuat) byDeXuat[d.de_xuat] = (byDeXuat[d.de_xuat]||0)+1;
    if (d.xa_cu) byXa[d.xa_cu] = (byXa[d.xa_cu]||0)+1;
  });

  const sumRows = [
    ['BÁO CÁO TỔNG KẾT RÀ SOÁT'],
    [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`],
    [],
    ['Tổng số thửa đã rà soát', data.length],
    ['Tổng số thửa toàn khu', state.features.length],
    ['Tỷ lệ hoàn thành', `${(data.length/state.features.length*100).toFixed(2)}%`],
    ['Tổng diện tích đã rà soát (m²)', tongDT],
    ['Tổng diện tích đã rà soát (ha)', +(tongDT/10000).toFixed(2)],
    ['Số cán bộ tham gia', Object.keys(byNguoi).length],
    [],
    ['PHÂN BỔ THEO XÃ CŨ',''],
    ...Object.entries(byXa).map(([k,v]) => [k, v]),
    [],
    ['PHÂN BỔ THEO ĐỀ XUẤT XỬ LÝ',''],
    ...Object.entries(byDeXuat).map(([k,v]) => [k, v]),
    [],
    ['PHÂN BỔ THEO PHÁP LÝ HIỆN TẠI',''],
    ...Object.entries(byPhapLy).map(([k,v]) => [k, v]),
    [],
    ['PHÂN BỔ THEO TRẠNG THÁI KÊ KHAI',''],
    ...Object.entries(byKeKhai).map(([k,v]) => [k, v]),
    [],
    ['SỐ THỬA RÀ SOÁT THEO CÁN BỘ',''],
    ...Object.entries(byNguoi).map(([k,v]) => [k, v]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
  ws2['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:1}},
    {s:{r:1,c:0},e:{r:1,c:1}}
  ];
  ws2['!cols'] = [{wch:42},{wch:18}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, 'Tổng kết');
  XLSX.utils.book_append_sheet(wb, ws, 'Biểu chi tiết');

  const filename = `BieuRaSoat_CheLongPhu_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast('Đã xuất Excel: ' + filename, 'ok');
}

/* ============================================================================
 * EDIT MODAL (cũ - đổi sang panel)
 * ============================================================================ */
let editingId = null;
function openEditPanel(id) {
  editingId = id;
  // Mobile: đóng rightbar đang mở để không che edit panel
  if (isMobile()) {
    document.getElementById('rightbar').classList.remove('mobile-open');
    document.getElementById('mobile-backdrop').classList.remove('show');
  }
  const ed = state.edits[id] || {};
  document.getElementById('edit-thua-id').textContent = `(Tờ ${id.split('-')[0]} — Thửa ${id.split('-')[1]})`;
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

  // Load ảnh đã lưu vào pendingFiles để preview
  pendingFiles = {
    anh_ht: (ed.anh_ht || []).slice(),
    anh_gt: (ed.anh_gt || []).slice()
  };
  renderImagePreview('anh_ht');
  renderImagePreview('anh_gt');

  document.getElementById('edit-panel').classList.add('open');
}
function closeEditPanel() {
  document.getElementById('edit-panel').classList.remove('open');
  pendingFiles = { anh_ht: [], anh_gt: [] };
}
// Backward compat
function openEditModal(id) { openEditPanel(id); }
function closeEditModal() { closeEditPanel(); }

function saveEditClassification() {
  if (!editingId) return;
  const newEdit = {
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
  // Thêm ảnh nếu có
  if (pendingFiles.anh_ht.length) newEdit.anh_ht = pendingFiles.anh_ht.slice();
  if (pendingFiles.anh_gt.length) newEdit.anh_gt = pendingFiles.anh_gt.slice();

  state.edits[editingId] = newEdit;
  // Bỏ key rỗng
  Object.keys(state.edits[editingId]).forEach(k => {
    const v = state.edits[editingId][k];
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) {
      delete state.edits[editingId][k];
    }
  });
  if (Object.keys(state.edits[editingId]).length === 0) delete state.edits[editingId];

  try {
    saveEdits();
    closeEditPanel();
    toast('Đã lưu vào trình duyệt','ok');
  } catch(e) {
    // localStorage quota exceeded - rất có thể do ảnh quá nhiều
    toast('Lỗi: bộ nhớ trình duyệt đầy. Bỏ bớt ảnh hoặc xuất Excel để giải phóng.','err');
    return;
  }

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
function closeRightbarMobile(){
  document.getElementById('rightbar').classList.remove('mobile-open');
  document.getElementById('mobile-backdrop').classList.remove('show');
}

/* ============================================================================
 * MOBILE - sidebar / rightbar trượt
 * ============================================================================ */
function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('mobile-backdrop').classList.add('show');
}

function openMobileRightbar() {
  document.getElementById('rightbar').classList.add('mobile-open');
  document.getElementById('mobile-backdrop').classList.add('show');
}

function closeMobilePanels() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('rightbar').classList.remove('mobile-open');
  document.getElementById('mobile-backdrop').classList.remove('show');
}

// Khi bấm filter trong sidebar mobile, tự đóng sidebar để xem map
function initMobileBehavior() {
  // Đóng sidebar khi tích filter (mobile thôi)
  document.querySelectorAll('[data-filter]').forEach(cb => {
    cb.addEventListener('change', () => {
      // Không tự đóng sidebar khi đổi filter, người dùng có thể muốn đổi nhiều
    });
  });
  // Khi click nav-btn, đóng các panel mobile
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isMobile()) closeMobilePanels();
    });
  });
}

// ===== Start =====
init();
