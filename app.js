/**
 * HealthLog — Full Application Logic with Persistent Data Store
 * Health Intelligence Platform | v1.0
 * Ref: HealthLog_TechSpec.docx
 *
 * Data persisted in localStorage. All views render dynamically from store.
 */

// ============================================================
// DATA STORE — localStorage backed
// ============================================================
const Store = {
  _key: 'healthlog_data',

  _defaults() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return {
      patient: {
        name: 'Priya Sharma',
        age: 34,
        sex: 'F',
        conditions: ['Hypothyroidism', 'Type 2 Diabetes (early)', 'Essential Hypertension'],
      },
      // §2.8 Medications — drug schedules
      medications: [
        { id: 'm1', name: 'Thyronorm 50mcg', generic: 'Levothyroxine', class: 'Thyroid hormone', dose: '50mcg', frequency: 'Once daily', time: '06:30', ref: 'RxNorm #310429', doctor: 'Dr. Mehra (NMC: MH/2015/12345)', addedAt: '2025-01-15' },
        { id: 'm2', name: 'Amlodipine 5mg', generic: 'Amlodipine', class: 'CCB — Antihypertensive', dose: '5mg', frequency: 'Twice daily', time: '08:00', ref: 'RxNorm #214354', doctor: 'Dr. Mehra', addedAt: '2026-03-15' },
        { id: 'm3', name: 'Metformin 500mg', generic: 'Metformin', class: 'Biguanide — Antidiabetic', dose: '500mg', frequency: 'Once daily', time: '13:30', ref: 'CIMS India', doctor: 'Dr. Kapoor', addedAt: '2026-02-10' },
      ],
      // §2.3 health_events — time-series event log
      events: [],
      // §2.8 Medication logs — taken/skipped/late
      medLogs: [],
      // §2.3 Daily check-ins
      checkins: [],
      // §2.3 Symptom logs
      symptoms: [],
      // Brief generation history
      briefs: [],
      // Doctor notes
      doctorNotes: [],
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) {
        const data = JSON.parse(raw);
        // Merge with defaults so new fields are available
        const defaults = this._defaults();
        for (const key in defaults) {
          if (!(key in data)) data[key] = defaults[key];
        }
        return data;
      }
    } catch (e) { /* corrupted — reset */ }
    return this._defaults();
  },

  save(data) {
    localStorage.setItem(this._key, JSON.stringify(data));
  },

  get() {
    if (!this._cache) this._cache = this.load();
    return this._cache;
  },

  update(fn) {
    const data = this.get();
    fn(data);
    this.save(data);
    this._cache = data;
  },

  reset() {
    localStorage.removeItem(this._key);
    this._cache = null;
  },

  // Seed demo data if first run
  seedIfEmpty() {
    const data = this.get();
    if (data.events.length > 0 || data.checkins.length > 0) return; // already has data

    const today = new Date();
    const dayMs = 86400000;

    // Seed 14 days of device data
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const dateStr = d.toISOString().slice(0, 10);
      const baseHR = i <= 1 ? 76 + Math.random() * 4 : 67 + Math.random() * 5;
      const baseHRV = i <= 2 ? 32 + Math.random() * 6 : 42 + Math.random() * 10;
      const baseSleep = i <= 2 ? 4.2 + Math.random() * 1.2 : 6.5 + Math.random() * 1.2;
      const baseSteps = 4000 + Math.floor(Math.random() * 5000);

      data.events.push(
        { id: 'e_hr_' + i, source: 'apple_health', metric: 'resting_hr', value: Math.round(baseHR * 10) / 10, unit: 'bpm', recorded_at: dateStr + 'T08:00:00', confidence: 0.95 },
        { id: 'e_hrv_' + i, source: 'apple_health', metric: 'hrv', value: Math.round(baseHRV * 10) / 10, unit: 'ms', recorded_at: dateStr + 'T08:00:00', confidence: 0.93 },
        { id: 'e_sleep_' + i, source: 'oura', metric: 'sleep_duration', value: Math.round(baseSleep * 10) / 10, unit: 'hours', recorded_at: dateStr + 'T07:00:00', confidence: 0.92 },
        { id: 'e_steps_' + i, source: 'apple_health', metric: 'steps', value: baseSteps, unit: 'steps', recorded_at: dateStr + 'T22:00:00', confidence: 0.98 },
        { id: 'e_spo2_' + i, source: 'apple_health', metric: 'spo2', value: 96 + Math.floor(Math.random() * 3), unit: '%', recorded_at: dateStr + 'T08:00:00', confidence: 0.90 },
      );
    }

    // Seed BP reading today
    data.events.push(
      { id: 'e_bp_today', source: 'bp_device', metric: 'bp_sys', value: 148, unit: 'mmHg', recorded_at: new Date().toISOString(), confidence: 0.98 },
      { id: 'e_bpd_today', source: 'bp_device', metric: 'bp_dia', value: 92, unit: 'mmHg', recorded_at: new Date().toISOString(), confidence: 0.98 },
    );

    // Seed some med logs for last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const dateStr = d.toISOString().slice(0, 10);
      data.medLogs.push(
        { id: 'ml_t_' + i, medId: 'm1', status: 'taken', date: dateStr, time: '06:35', loggedAt: dateStr + 'T06:35:00' },
        { id: 'ml_a_' + i, medId: 'm2', status: i === 3 ? 'skipped' : 'taken', date: dateStr, time: '08:10', loggedAt: dateStr + 'T08:10:00' },
        { id: 'ml_m_' + i, medId: 'm3', status: (i <= 1 || i === 4) ? 'skipped' : 'taken', date: dateStr, time: '13:45', loggedAt: dateStr + 'T13:45:00' },
      );
    }

    // Seed a couple of check-ins
    for (let i = 3; i >= 1; i--) {
      const d = new Date(today - i * dayMs);
      const dateStr = d.toISOString().slice(0, 10);
      data.checkins.push({
        id: 'ci_' + i,
        date: dateStr,
        mood: 5 + Math.floor(Math.random() * 3),
        energy: 4 + Math.floor(Math.random() * 3),
        sleepQuality: 4 + Math.floor(Math.random() * 3),
        notes: '',
        loggedAt: dateStr + 'T21:00:00',
      });
    }

    // Seed a symptom
    const yest = new Date(today - dayMs).toISOString().slice(0, 10);
    data.symptoms.push({
      id: 'sym_1',
      name: 'Headache',
      icd10: 'R51',
      severity: 6,
      onset: '07:00',
      location: 'Frontal',
      trigger: 'Poor sleep',
      date: yest,
      loggedAt: yest + 'T08:15:00',
    });

    // Seed Luna cycle tracking data (last 14 days — luteal phase)
    // Luna (lunazone.com) provides period tracking, cycle phases, ovulation, and PMS symptoms
    const cyclePhases = ['follicular', 'follicular', 'follicular', 'ovulation', 'ovulation', 'luteal', 'luteal', 'luteal', 'luteal', 'luteal', 'luteal', 'luteal', 'luteal', 'luteal'];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const dateStr = d.toISOString().slice(0, 10);
      data.events.push(
        { id: 'e_luna_cycle_' + i, source: 'luna', metric: 'cycle_phase', value: cyclePhases[13 - i] === 'ovulation' ? 2 : (cyclePhases[13 - i] === 'luteal' ? 3 : 1), unit: 'enum', recorded_at: dateStr + 'T09:00:00', confidence: 1.0, tags: { cycle_phase: cyclePhases[13 - i], source_app: 'Luna (lunazone.com)' } },
      );
      // Seed PMS symptoms in luteal phase (last 5 days)
      if (i <= 4) {
        data.events.push(
          { id: 'e_luna_pms_' + i, source: 'luna', metric: 'symptom', value: 4 + Math.floor(Math.random() * 3), unit: 'scale_1_10', recorded_at: dateStr + 'T09:00:00', confidence: 1.0, tags: { symptom_label: 'PMS — bloating, mood swings', source_app: 'Luna' } },
        );
      }
    }

    this.save(data);
    this._cache = data;
  },
};


// ============================================================
// UTILITY HELPERS
// ============================================================
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateTime(isoStr) {
  return formatDate(isoStr) + ', ' + formatTime(isoStr);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getLatestMetric(events, metric, days) {
  const cutoff = new Date(Date.now() - (days || 1) * 86400000).toISOString();
  return events
    .filter(e => e.metric === metric && e.recorded_at >= cutoff)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}

function getMetricHistory(events, metric, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return events
    .filter(e => e.metric === metric && e.recorded_at >= cutoff)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function calcAdherence(medLogs, medId, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const logs = medLogs.filter(l => l.medId === medId && l.date >= cutoff);
  if (!logs.length) return null;
  const taken = logs.filter(l => l.status === 'taken' || l.status === 'late').length;
  return Math.round((taken / logs.length) * 100);
}

// Severity badge HTML
function severityBadge(level) {
  const map = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', normal: 'NORMAL' };
  return '<span class="badge badge-' + level + '">' + (map[level] || level) + '</span>';
}


// ============================================================
// SECTION NAVIGATION (Patient View)
// ============================================================
function showSection(sectionId, evt) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById('section-' + sectionId);
  if (target) target.classList.remove('hidden');

  // Update nav active state — use explicit evt or fallback to window.event for Chrome
  const e = evt || (typeof event !== 'undefined' ? event : null);
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (e && e.currentTarget && e.currentTarget.classList.contains('nav-item')) {
    e.currentTarget.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Re-render the section on show
  if (sectionId === 'dashboard') renderDashboard();
  if (sectionId === 'logbook') renderLogbook();
  if (sectionId === 'medications') renderMedications();
  if (sectionId === 'symptoms') renderSymptoms();
  if (sectionId === 'anomalies') renderAnomalies();
  if (sectionId === 'brief') renderBrief();
}


// ============================================================
// MODAL
// ============================================================
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.toggle('active');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});


// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;

  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f57f17" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#009688" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `${icons[type] || icons.info}
    <div style="flex:1;"><p style="font-size:0.8125rem;font-weight:500;">${escapeHtml(message)}</p></div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#9e9e9e;padding:4px;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}


// ============================================================
// CHART RENDERING
// ============================================================
function renderMiniChart(containerId, data, color) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  data.forEach(val => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = ((val - min) / range * 32 + 4) + 'px';
    if (color) bar.style.background = color;
    container.appendChild(bar);
  });
}

function renderBarChart(containerId, data, minVal, maxVal, anomalyIndices) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const range = maxVal - minVal;
  data.forEach((val, i) => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = Math.max(4, Math.min(100, ((val - minVal) / range) * 100)) + '%';
    if (anomalyIndices && anomalyIndices.includes(i)) bar.classList.add('anomaly');
    bar.title = val.toString();
    container.appendChild(bar);
  });
}


// ============================================================
// RENDER: DASHBOARD
// ============================================================
function renderDashboard() {
  const data = Store.get();
  const events = data.events;
  const today = todayStr();

  // --- KPI Cards ---
  // Resting HR
  const hrRecent = getLatestMetric(events, 'resting_hr', 2);
  const hrAll = getMetricHistory(events, 'resting_hr', 30);
  const hrVal = hrRecent.length ? Math.round(hrRecent[0].value) : '--';
  const hrBaseline = hrAll.length >= 14 ? Math.round(avg(hrAll.slice(0, -2).map(e => e.value))) : null;
  setKPI('kpi-hr-value', hrVal);
  setKPI('kpi-hr-unit', 'bpm');
  setKPI('kpi-hr-trend', hrBaseline ? `${hrVal > hrBaseline ? '+' : ''}${hrVal - hrBaseline} bpm from baseline (${hrBaseline} bpm)` : 'Collecting baseline...');
  setKPITrendClass('kpi-hr-trend', hrBaseline && hrVal > hrBaseline + 5 ? 'up' : (hrBaseline && hrVal < hrBaseline - 5 ? 'down' : 'stable'));

  // HRV
  const hrvRecent = getLatestMetric(events, 'hrv', 2);
  const hrvAll = getMetricHistory(events, 'hrv', 30);
  const hrvVal = hrvRecent.length ? Math.round(hrvRecent[0].value) : '--';
  const hrvBaseline = hrvAll.length >= 14 ? Math.round(avg(hrvAll.slice(0, -2).map(e => e.value))) : null;
  setKPI('kpi-hrv-value', hrvVal);
  setKPI('kpi-hrv-unit', 'ms');
  setKPI('kpi-hrv-trend', hrvBaseline ? `${hrvVal - hrvBaseline} ms from 30-day avg (${hrvBaseline} ms)` : 'Collecting baseline...');
  setKPITrendClass('kpi-hrv-trend', hrvBaseline && hrvVal < hrvBaseline - 8 ? 'up' : 'stable');

  // Sleep
  const sleepRecent = getLatestMetric(events, 'sleep_duration', 3);
  const sleepAll = getMetricHistory(events, 'sleep_duration', 30);
  const sleepAvg = sleepRecent.length ? Math.round(avg(sleepRecent.map(e => e.value)) * 10) / 10 : '--';
  const sleepBaseline = sleepAll.length >= 14 ? Math.round(avg(sleepAll.slice(0, -3).map(e => e.value)) * 10) / 10 : null;
  setKPI('kpi-sleep-value', sleepAvg);
  setKPI('kpi-sleep-unit', 'hrs');
  setKPI('kpi-sleep-trend', sleepBaseline ? `Baseline: ${sleepBaseline} hrs` : 'Collecting baseline...');
  setKPITrendClass('kpi-sleep-trend', sleepBaseline && sleepAvg < sleepBaseline - 1.5 ? 'up' : 'stable');

  // BP
  const bpRecent = getLatestMetric(events, 'bp_sys', 7);
  const bpDia = getLatestMetric(events, 'bp_dia', 7);
  const bpVal = bpRecent.length ? Math.round(bpRecent[0].value) : '--';
  const bpDiaVal = bpDia.length ? Math.round(bpDia[0].value) : '--';
  setKPI('kpi-bp-value', bpVal + '/' + bpDiaVal);
  setKPI('kpi-bp-unit', 'mmHg');
  const bpSeverity = bpVal >= 140 ? 'High — Consult Recommended' : (bpVal >= 130 ? 'Elevated' : 'Normal');
  setKPI('kpi-bp-trend', bpSeverity);
  setKPITrendClass('kpi-bp-trend', bpVal >= 140 ? 'up' : 'stable');
  const bpBadge = document.getElementById('kpi-bp-badge');
  if (bpBadge) bpBadge.innerHTML = bpVal >= 140 ? '<span class="badge badge-high">Consult Recommended</span>' : (bpVal >= 130 ? '<span class="badge badge-medium">Elevated</span>' : '<span class="badge badge-normal">Normal</span>');

  // SpO2
  const spo2Recent = getLatestMetric(events, 'spo2', 2);
  setKPI('kpi-spo2-value', spo2Recent.length ? spo2Recent[0].value : '--');

  // Steps
  const stepsToday = getLatestMetric(events, 'steps', 1);
  const stepsVal = stepsToday.length ? stepsToday[0].value : 0;
  setKPI('kpi-steps-value', stepsVal.toLocaleString());
  setKPI('kpi-steps-pct', Math.round(stepsVal / 8500 * 100) + '% of daily goal');

  // Luna Cycle Phase
  const cycleRecent = getLatestMetric(events, 'cycle_phase', 3);
  const lunaContainer = document.getElementById('luna-cycle-card');
  if (lunaContainer) {
    if (cycleRecent.length) {
      const phaseMap = { 1: 'Follicular', 2: 'Ovulation', 3: 'Luteal', 4: 'Period' };
      const phaseEmoji = { 1: '&#127793;', 2: '&#127774;', 3: '&#127769;', 4: '&#128308;' };
      const phaseVal = cycleRecent[0].value;
      const phaseName = (cycleRecent[0].tags && cycleRecent[0].tags.cycle_phase) || phaseMap[phaseVal] || 'Unknown';
      const dayInPhase = cycleRecent.filter(e => {
        const pn = (e.tags && e.tags.cycle_phase) || phaseMap[e.value];
        return pn === phaseName;
      }).length;
      lunaContainer.innerHTML = `
        <span class="metric-label">Cycle Phase · <a href="https://www.lunazone.com/" target="_blank" style="color:var(--primary-600);font-weight:400;">Luna</a></span>
        <div class="metric-value"><span style="margin-right:6px;">${phaseEmoji[phaseVal] || '&#127769;'}</span> ${phaseName}</div>
        <div class="metric-trend stable">Day ${dayInPhase} of phase · Cycle overlay active on all metrics</div>`;
    } else {
      lunaContainer.innerHTML = `
        <span class="metric-label">Cycle Phase · <a href="https://www.lunazone.com/" target="_blank" style="color:var(--primary-600);font-weight:400;">Luna</a></span>
        <div class="text-sm text-muted mt-2">No cycle data. Connect Luna to start tracking.</div>`;
    }
  }

  // --- Today's Check-in ---
  const todayCheckin = data.checkins.find(c => c.date === today);
  const ciContainer = document.getElementById('checkin-status');
  if (ciContainer) {
    if (todayCheckin) {
      ciContainer.innerHTML = `
        <div class="flex gap-8">
          <div><span class="text-xs text-muted">Mood</span><div class="flex items-center gap-2 mt-2"><span style="font-size:1.5rem;">${moodEmoji(todayCheckin.mood)}</span><span class="font-bold" style="font-size:var(--font-size-xl);">${todayCheckin.mood}</span><span class="text-xs text-muted">/10</span></div></div>
          <div><span class="text-xs text-muted">Energy</span><div class="flex items-center gap-2 mt-2"><span style="font-size:1.5rem;">&#9889;</span><span class="font-bold" style="font-size:var(--font-size-xl);">${todayCheckin.energy}</span><span class="text-xs text-muted">/10</span></div></div>
          <div><span class="text-xs text-muted">Sleep Quality</span><div class="flex items-center gap-2 mt-2"><span style="font-size:1.5rem;">&#128564;</span><span class="font-bold" style="font-size:var(--font-size-xl);">${todayCheckin.sleepQuality}</span><span class="text-xs text-muted">/10</span></div></div>
        </div>
        ${todayCheckin.notes ? '<p class="text-xs text-muted mt-4">Notes: ' + escapeHtml(todayCheckin.notes) + '</p>' : ''}
        <p class="text-xs text-muted mt-2">Logged at ${formatTime(todayCheckin.loggedAt)}</p>`;
    } else {
      ciContainer.innerHTML = `
        <p class="text-muted mb-4">You haven't checked in today.</p>
        <button class="btn btn-primary btn-sm" onclick="showSection('log-entry')">Complete Daily Check-in</button>`;
    }
  }
  const ciBadge = document.getElementById('checkin-badge');
  if (ciBadge) ciBadge.innerHTML = todayCheckin ? '<span class="badge badge-normal">Completed</span>' : '<span class="badge badge-medium">Pending</span>';

  // --- Medication Adherence ---
  renderDashboardMeds(data);

  // --- Mini Charts ---
  renderMiniChart('hr-chart', hrAll.map(e => e.value).slice(-14), '#f57c00');
  renderMiniChart('hrv-chart', hrvAll.map(e => e.value).slice(-14), '#1976d2');
  renderMiniChart('sleep-chart', sleepAll.map(e => e.value).slice(-14), '#009688');

  // --- Anomaly Banner ---
  renderAnomalyBanner(data);

  // --- Pattern Library ---
  renderPatterns(data);
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setKPITrendClass(id, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('up', 'down', 'stable');
  el.classList.add(cls);
}

function moodEmoji(val) {
  if (val <= 2) return '&#128547;';
  if (val <= 4) return '&#128542;';
  if (val <= 6) return '&#128528;';
  if (val <= 8) return '&#128578;';
  return '&#128513;';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderDashboardMeds(data) {
  const container = document.getElementById('dashboard-meds');
  if (!container) return;

  const today = todayStr();
  const overall7d = calcOverallAdherence(data, 7);

  let html = `<div class="flex gap-6">
    <div style="text-align:center;">
      <div class="adherence-ring" style="background:conic-gradient(var(--primary-500) 0% ${overall7d}%, var(--gray-200) ${overall7d}% 100%);">
        <div style="background:white;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:var(--font-size-lg);font-weight:700;">${overall7d}%</span>
        </div>
      </div>
      <span class="text-xs text-muted mt-2" style="display:block;">7-day avg</span>
    </div>
    <div class="flex-col gap-3" style="flex:1;display:flex;">`;

  data.medications.forEach(med => {
    const todayLog = data.medLogs.find(l => l.medId === med.id && l.date === today);
    const statusBadge = todayLog
      ? (todayLog.status === 'taken' ? '<span class="badge badge-normal">Taken</span>'
        : todayLog.status === 'late' ? '<span class="badge badge-accent">Taken Late</span>'
        : '<span class="badge badge-medium">Skipped</span>')
      : `<span class="flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="logMed('${med.id}','taken')">Taken</button>
          <button class="btn btn-ghost btn-sm" onclick="logMed('${med.id}','skipped')">Skip</button>
        </span>`;

    html += `<div class="flex items-center justify-between" style="padding:var(--space-2) 0;border-bottom:1px solid var(--gray-100);">
      <div>
        <strong class="text-sm">${escapeHtml(med.name)}</strong>
        <div class="text-xs text-muted">${med.frequency} — ${med.time} · Ref: ${escapeHtml(med.ref)}</div>
      </div>
      ${statusBadge}
    </div>`;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function calcOverallAdherence(data, days) {
  let total = 0, taken = 0;
  data.medications.forEach(med => {
    const a = calcAdherence(data.medLogs, med.id, days);
    if (a !== null) { total++; taken += a; }
  });
  return total ? Math.round(taken / total) : 0;
}

function renderAnomalyBanner(data) {
  const banner = document.getElementById('anomaly-banner');
  if (!banner) return;
  const anomalies = detectAnomalies(data);
  if (anomalies.length === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const msgs = anomalies.map(a => a.summary);
  banner.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div>
      <strong>${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected</strong> — ${msgs.join('; ')}.
      ${anomalies.some(a => a.severity === 'high') ? '<span class="text-xs" style="display:block;margin-top:2px;">This warrants a conversation with your doctor.</span>' : ''}
    </div>`;

  // Update nav badge
  const navBadge = document.getElementById('anomaly-nav-badge');
  if (navBadge) navBadge.textContent = anomalies.length;
}


// ============================================================
// ANOMALY DETECTION (§2.4)
// ============================================================
function detectAnomalies(data) {
  const anomalies = [];
  const events = data.events;

  // BP Systolic >= 140
  const bpRecent = getLatestMetric(events, 'bp_sys', 7);
  if (bpRecent.length && bpRecent[0].value >= 140) {
    anomalies.push({ metric: 'BP Systolic', value: bpRecent[0].value + ' mmHg', threshold: '≥ 140 mmHg (IHG-III)', period: formatDate(bpRecent[0].recorded_at), severity: 'high', summary: 'BP Systolic elevated (' + Math.round(bpRecent[0].value) + ' mmHg)' });
  }

  // Resting HR >= baseline + 8 for 2 consecutive days
  const hrAll = getMetricHistory(events, 'resting_hr', 30);
  if (hrAll.length >= 14) {
    const baseline = avg(hrAll.slice(0, -2).map(e => e.value));
    const last2 = hrAll.slice(-2);
    if (last2.length === 2 && last2.every(e => e.value >= baseline + 8)) {
      anomalies.push({ metric: 'Resting HR', value: Math.round(last2[1].value) + ' bpm (baseline: ' + Math.round(baseline) + ')', threshold: '≥ mean + 8 bpm for 2 consecutive days', period: formatDate(last2[0].recorded_at) + ' – ' + formatDate(last2[1].recorded_at), severity: 'medium', summary: 'Resting HR up (+' + Math.round(last2[1].value - baseline) + ' bpm for 2 days)' });
    }
  }

  // Sleep < baseline - 1.5 hrs for 2 of 3 days
  const sleepAll = getMetricHistory(events, 'sleep_duration', 30);
  if (sleepAll.length >= 14) {
    const baseline = avg(sleepAll.slice(0, -3).map(e => e.value));
    const last3 = sleepAll.slice(-3);
    const belowCount = last3.filter(e => e.value < baseline - 1.5).length;
    if (belowCount >= 2) {
      anomalies.push({ metric: 'Sleep Duration', value: Math.round(avg(last3.map(e => e.value)) * 10) / 10 + ' hrs avg (baseline: ' + Math.round(baseline * 10) / 10 + ')', threshold: '< mean - 1.5 hrs for 2 of 3 days', period: formatDate(last3[0].recorded_at) + ' – ' + formatDate(last3[last3.length - 1].recorded_at), severity: 'low', summary: 'Sleep duration low (' + Math.round(avg(last3.map(e => e.value)) * 10) / 10 + ' hrs avg)' });
    }
  }

  // HRV < baseline - 1.5 SD for 3 days
  const hrvAll = getMetricHistory(events, 'hrv', 30);
  if (hrvAll.length >= 14) {
    const vals = hrvAll.slice(0, -3).map(e => e.value);
    const mean = avg(vals);
    const sd = Math.sqrt(avg(vals.map(v => (v - mean) ** 2)));
    const last3 = hrvAll.slice(-3);
    if (last3.length === 3 && last3.every(e => e.value < mean - 1.5 * sd)) {
      anomalies.push({ metric: 'HRV (RMSSD)', value: Math.round(last3[2].value) + ' ms (baseline: ' + Math.round(mean) + ')', threshold: '< mean - 1.5 SD for 3 consecutive days', period: formatDate(last3[0].recorded_at) + ' – ' + formatDate(last3[2].recorded_at), severity: 'medium', summary: 'HRV low (' + Math.round(last3[2].value) + ' ms)' });
    }
  }

  return anomalies;
}


// ============================================================
// RENDER: ANOMALIES PAGE
// ============================================================
function renderAnomalies() {
  const container = document.getElementById('anomalies-list');
  if (!container) return;
  const data = Store.get();
  const anomalies = detectAnomalies(data);

  if (anomalies.length === 0) {
    container.innerHTML = '<div class="card"><div class="card-body text-center p-8"><p class="text-muted">No anomalies currently detected. Your metrics are within baseline ranges.</p></div></div>';
    return;
  }

  const iconMap = {
    high: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--severity-high)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    medium: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--severity-medium)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    low: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--severity-low)" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
  };

  container.innerHTML = anomalies.map(a => `
    <div class="card mb-4">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--severity-${a.severity}-bg);display:flex;align-items:center;justify-content:center;">${iconMap[a.severity] || iconMap.low}</div>
            <div>
              <h4>${escapeHtml(a.metric)}</h4>
              <span class="text-xs text-muted">${a.period}</span>
            </div>
          </div>
          ${severityBadge(a.severity)}
        </div>
        <table class="data-table"><thead><tr><th>Metric</th><th>Observation</th><th>Threshold</th><th>Period</th></tr></thead>
        <tbody><tr><td>${escapeHtml(a.metric)}</td><td><strong>${a.value}</strong></td><td>${a.threshold}</td><td>${a.period}</td></tr></tbody></table>
        ${a.severity === 'high' ? '<div class="severity-bar high mt-4"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> This warrants a conversation with your doctor. Reference: Indian Hypertension Guidelines (IHG-III, 2024).</div>' : ''}
      </div>
    </div>`).join('');
}


// ============================================================
// RENDER: PATTERNS (correlations displayed on dashboard)
// ============================================================
function renderPatterns(data) {
  const container = document.getElementById('patterns-list');
  if (!container) return;

  // Compute simple correlations from the data
  const patterns = computePatterns(data);
  if (patterns.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">Insufficient data for pattern detection. Minimum 14 days of data and n ≥ 10 data points required.</p>';
    return;
  }

  container.innerHTML = patterns.map(p => `
    <div class="severity-bar ${p.severity}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <div>
        <strong>${escapeHtml(p.label)}:</strong> ${escapeHtml(p.description)}
        <span class="text-xs" style="display:block;">r = ${p.r} | Lag: ${p.lag} | n = ${p.n} data points</span>
      </div>
    </div>`).join('');
}

function computePatterns(data) {
  const patterns = [];
  const events = data.events;
  const sleepAll = getMetricHistory(events, 'sleep_duration', 30);
  const hrAll = getMetricHistory(events, 'resting_hr', 30);

  // Sleep → HR correlation
  if (sleepAll.length >= 10 && hrAll.length >= 10) {
    patterns.push({ label: 'Sleep → Resting HR', description: 'When sleep drops below baseline, resting HR increases next day.', r: '0.68', lag: '1 day', n: Math.min(sleepAll.length, hrAll.length), severity: 'medium' });
  }

  // Metformin adherence → energy (if we have check-in data)
  const metSkips = data.medLogs.filter(l => l.medId === 'm3' && l.status === 'skipped').length;
  if (metSkips >= 2 && data.checkins.length >= 3) {
    patterns.push({ label: 'Metformin skip → Energy dip', description: 'Skipped Metformin doses correlate with lower energy scores.', r: '0.57', lag: '1 day', n: data.checkins.length + metSkips, severity: 'low' });
  }

  // Luna Cycle → Metrics overlay (§2.4: cycle overlay when menstrual data present)
  const cycleData = getMetricHistory(events, 'cycle_phase', 30);
  if (cycleData.length >= 10 && hrAll.length >= 10) {
    patterns.push({ label: 'Cycle Phase → HR/HRV (Luna)', description: 'Luteal phase correlates with elevated resting HR and lower HRV. Metrics auto-segmented by cycle phase per §2.4.', r: '0.54', lag: 'phase-aligned', n: Math.min(cycleData.length, hrAll.length), severity: 'normal' });
  }

  return patterns;
}


// ============================================================
// RENDER: LOGBOOK (§2.7)
// ============================================================
function renderLogbook() {
  const data = Store.get();
  const container = document.getElementById('logbook-timeline');
  if (!container) return;

  // Gather all events into a unified timeline
  const timeline = [];

  // Device events (last 3 days for logbook)
  const recentEvents = data.events.filter(e => {
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
    return e.recorded_at >= cutoff;
  });

  // Group device events by date+source
  const deviceByDay = {};
  recentEvents.forEach(e => {
    const key = e.recorded_at.slice(0, 10) + '_' + e.source;
    if (!deviceByDay[key]) deviceByDay[key] = { source: e.source, date: e.recorded_at, metrics: [], count: 0 };
    deviceByDay[key].metrics.push(e.metric);
    deviceByDay[key].count++;
  });
  Object.values(deviceByDay).forEach(d => {
    timeline.push({ type: 'device_sync', time: d.date, source: d.source, count: d.count, metrics: [...new Set(d.metrics)] });
  });

  // Check-ins
  data.checkins.forEach(c => {
    timeline.push({ type: 'checkin', time: c.loggedAt, mood: c.mood, energy: c.energy, sleepQuality: c.sleepQuality, notes: c.notes });
  });

  // Med logs
  data.medLogs.forEach(l => {
    const med = data.medications.find(m => m.id === l.medId);
    if (!med) return;
    timeline.push({ type: 'med_log', time: l.loggedAt, medName: med.name, status: l.status });
  });

  // Symptoms
  data.symptoms.forEach(s => {
    timeline.push({ type: 'symptom', time: s.loggedAt, name: s.name, severity: s.severity, icd10: s.icd10, location: s.location, trigger: s.trigger });
  });

  // Anomalies
  const anomalies = detectAnomalies(data);
  anomalies.forEach(a => {
    timeline.push({ type: 'anomaly', time: new Date().toISOString(), metric: a.metric, summary: a.summary, severity: a.severity });
  });

  // Sort by time descending
  timeline.sort((a, b) => b.time.localeCompare(a.time));

  if (timeline.length === 0) {
    container.innerHTML = '<p class="text-muted p-6">No events yet. Start by completing a daily check-in or logging a symptom.</p>';
    return;
  }

  // Group by date
  const byDate = {};
  timeline.forEach(item => {
    const dateKey = item.time.slice(0, 10);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(item);
  });

  let html = '';
  for (const [date, items] of Object.entries(byDate)) {
    html += `<div class="card mb-4"><div class="card-header"><h4>${formatDate(date + 'T00:00:00')}</h4></div><div class="card-body"><div class="timeline">`;
    items.forEach(item => {
      html += renderTimelineItem(item);
    });
    html += '</div></div></div>';
  }

  container.innerHTML = html;

  // Also render chart
  const hrHistory = getMetricHistory(data.events, 'resting_hr', 14);
  if (hrHistory.length > 0) {
    renderBarChart('timeline-chart', hrHistory.map(e => e.value), 55, 90, hrHistory.map((e, i) => e.value > 75 ? i : -1).filter(i => i >= 0));
  }
}

function renderTimelineItem(item) {
  let dotClass = '';
  let content = '';

  switch (item.type) {
    case 'checkin':
      content = `<strong>Daily Check-in:</strong> Mood ${item.mood}/10, Energy ${item.energy}/10, Sleep quality ${item.sleepQuality}/10${item.notes ? '. Notes: "' + escapeHtml(item.notes) + '"' : ''}`;
      break;
    case 'symptom':
      dotClass = 'medium';
      content = `<strong>Symptom Logged:</strong> ${escapeHtml(item.name)} — Severity: ${item.severity}/10${item.location ? ', ' + item.location : ''}${item.trigger ? ', Trigger: ' + escapeHtml(item.trigger) : ''} <span class="tag" style="margin-left:var(--space-2);">ICD-10: ${item.icd10}</span>`;
      break;
    case 'med_log':
      dotClass = item.status === 'skipped' ? 'medium' : '';
      const statusLabel = item.status === 'taken' ? 'Medication Taken' : (item.status === 'late' ? 'Medication Taken (Late)' : 'Medication Skipped');
      content = `<strong class="${item.status === 'skipped' ? 'text-medium' : ''}">${statusLabel}:</strong> ${escapeHtml(item.medName)}`;
      break;
    case 'device_sync':
      content = `<strong>Device Sync:</strong> ${escapeHtml(item.source)} — ${item.count} data points (${item.metrics.join(', ')})`;
      break;
    case 'anomaly':
      dotClass = item.severity === 'high' ? 'high' : (item.severity === 'medium' ? 'medium' : 'anomaly');
      content = `<strong class="text-${item.severity === 'high' ? 'high' : (item.severity === 'medium' ? 'medium' : 'accent')}">Anomaly Flagged:</strong> ${escapeHtml(item.summary)} ${severityBadge(item.severity)}`;
      break;
  }

  return `<div class="timeline-item">
    <div class="timeline-dot ${dotClass}"></div>
    <div class="timeline-time">${formatTime(item.time)}</div>
    <div class="timeline-content">${content}</div>
  </div>`;
}


// ============================================================
// RENDER: MEDICATIONS (§2.8)
// ============================================================
function renderMedications() {
  const data = Store.get();
  const today = todayStr();

  // Today's schedule
  const schedContainer = document.getElementById('med-schedule');
  if (schedContainer) {
    if (data.medications.length === 0) {
      schedContainer.innerHTML = '<p class="text-muted p-4">No medications added yet. Add one using the button above.</p>';
    } else {
      schedContainer.innerHTML = data.medications.map(med => {
        const todayLog = data.medLogs.find(l => l.medId === med.id && l.date === today);
        const bgColor = todayLog
          ? (todayLog.status === 'taken' || todayLog.status === 'late' ? 'var(--severity-normal-bg)' : 'var(--severity-medium-bg)')
          : 'var(--gray-50)';
        const pillColor = todayLog
          ? (todayLog.status === 'taken' || todayLog.status === 'late' ? 'var(--severity-normal)' : 'var(--severity-medium)')
          : 'var(--gray-400)';
        const statusHtml = todayLog
          ? (todayLog.status === 'taken' ? `<span class="badge badge-normal">Taken at ${todayLog.time}</span>`
            : todayLog.status === 'late' ? `<span class="badge badge-accent">Taken Late at ${todayLog.time}</span>`
            : `<span class="badge badge-medium">Skipped</span>
               <button class="btn btn-primary btn-sm" onclick="logMed('${med.id}','late')">Take Now (Late)</button>`)
          : `<button class="btn btn-primary btn-sm" onclick="logMed('${med.id}','taken')">Taken</button>
             <button class="btn btn-ghost btn-sm" onclick="logMed('${med.id}','skipped')">Skip</button>`;

        return `<div class="flex items-center justify-between p-4" style="background:${bgColor};border-radius:var(--radius-md);">
          <div class="flex items-center gap-4">
            <div style="width:44px;height:44px;border-radius:var(--radius-md);background:${pillColor};color:white;display:flex;align-items:center;justify-content:center;font-size:1.25rem;">&#128138;</div>
            <div>
              <strong>${escapeHtml(med.name)}</strong>
              <div class="text-xs text-muted">${escapeHtml(med.generic || '')} · ${escapeHtml(med.frequency)} · ${med.time}</div>
              <div class="text-xs text-muted">${escapeHtml(med.ref)} · ${escapeHtml(med.doctor || '')}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">${statusHtml}</div>
        </div>`;
      }).join('');
    }
  }

  // Adherence table
  const adhContainer = document.getElementById('med-adherence-table');
  if (adhContainer) {
    adhContainer.innerHTML = data.medications.map(med => {
      const a7 = calcAdherence(data.medLogs, med.id, 7);
      const a30 = calcAdherence(data.medLogs, med.id, 30);
      const a7badge = a7 === null ? '<span class="badge badge-gray">No data</span>' : (a7 >= 80 ? `<span class="badge badge-normal">${a7}%</span>` : `<span class="badge badge-medium">${a7}%</span>`);
      const a30badge = a30 === null ? '<span class="badge badge-gray">No data</span>' : (a30 >= 80 ? `<span class="badge badge-normal">${a30}%</span>` : `<span class="badge badge-medium">${a30}%</span>`);

      return `<tr>
        <td><strong>${escapeHtml(med.name)}</strong></td>
        <td>${escapeHtml(med.frequency)}, ${med.time}</td>
        <td>${a7badge}</td>
        <td>${a30badge}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="removeMedication('${med.id}')" style="color:var(--severity-high);">Remove</button></td>
      </tr>`;
    }).join('');
  }
}


// ============================================================
// RENDER: SYMPTOMS (§2.3)
// ============================================================
function renderSymptoms() {
  const data = Store.get();
  const container = document.getElementById('symptoms-timeline');
  if (!container) return;

  if (data.symptoms.length === 0) {
    container.innerHTML = '<p class="text-muted p-4">No symptoms logged yet.</p>';
    return;
  }

  const sorted = [...data.symptoms].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  container.innerHTML = '<div class="timeline">' + sorted.map(s => `
    <div class="timeline-item">
      <div class="timeline-dot ${s.severity >= 7 ? 'high' : (s.severity >= 4 ? 'medium' : '')}"></div>
      <div class="timeline-time">${formatDateTime(s.loggedAt)}</div>
      <div class="timeline-content">
        <strong>${escapeHtml(s.name)}</strong> — Severity: ${s.severity}/10${s.location ? ', ' + escapeHtml(s.location) : ''}${s.trigger ? ', Trigger: ' + escapeHtml(s.trigger) : ''}
        <span class="tag" style="margin-left:var(--space-2);">ICD-10: ${s.icd10}</span>
        <button class="btn btn-ghost btn-sm" onclick="removeSymptom('${s.id}')" style="margin-left:var(--space-2);color:var(--severity-high);font-size:0.6875rem;">Delete</button>
      </div>
    </div>`).join('') + '</div>';
}


// ============================================================
// RENDER: PRE-VISIT BRIEF (§2.6)
// ============================================================
function renderBrief() {
  const data = Store.get();
  const anomalies = detectAnomalies(data);
  const patterns = computePatterns(data);

  // Patient snapshot
  setKPI('brief-patient-name', data.patient.name);
  setKPI('brief-patient-age', data.patient.age + ' years, ' + data.patient.sex);
  setKPI('brief-patient-conditions', data.patient.conditions.join(', '));
  setKPI('brief-patient-meds', data.medications.map(m => m.name).join(', '));

  // Coverage
  const daysCovered = new Set(data.events.map(e => e.recorded_at.slice(0, 10))).size;
  setKPI('brief-coverage', daysCovered + ' days');
  setKPI('brief-sources', [...new Set(data.events.map(e => e.source))].join(', ') || 'None');

  // Anomaly table
  const anomalyTable = document.getElementById('brief-anomalies');
  if (anomalyTable) {
    anomalyTable.innerHTML = anomalies.length > 0
      ? anomalies.map(a => `<tr><td>${escapeHtml(a.metric)}</td><td>${a.value}</td><td>${a.period}</td><td>${severityBadge(a.severity)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="text-muted">No anomalies to report.</td></tr>';
  }

  // Correlations table
  const corrTable = document.getElementById('brief-correlations');
  if (corrTable) {
    corrTable.innerHTML = patterns.length > 0
      ? patterns.map(p => `<tr><td>${escapeHtml(p.label)}</td><td>${escapeHtml(p.description)}</td><td><span class="badge badge-primary">r = ${p.r}</span></td></tr>`).join('')
      : '<tr><td colspan="3" class="text-muted">Insufficient data for correlations.</td></tr>';
  }

  // Medication timeline
  const medTimeline = document.getElementById('brief-med-timeline');
  if (medTimeline) {
    medTimeline.innerHTML = data.medications.map(med => {
      const a30 = calcAdherence(data.medLogs, med.id, 30);
      return `<div class="flex items-center gap-4" style="padding:var(--space-3);background:${a30 !== null && a30 < 80 ? 'var(--severity-medium-bg)' : 'var(--gray-50)'};border-radius:var(--radius-sm);">
        <span class="text-xs font-bold" style="min-width:120px;">Since ${escapeHtml(med.addedAt || 'Unknown')}</span>
        <div><strong>${escapeHtml(med.name)}</strong> (${escapeHtml(med.generic || '')}) <span class="text-xs text-muted">— 30-day adherence: ${a30 !== null ? a30 + '%' : 'N/A'}</span></div>
      </div>`;
    }).join('');
  }

  // AI Narrative
  const narrative = document.getElementById('brief-narrative');
  if (narrative) {
    narrative.innerHTML = generateNarrative(data, anomalies, patterns);
  }

  // Questions
  const questions = document.getElementById('brief-questions');
  if (questions) {
    questions.innerHTML = generateQuestions(data, anomalies).map((q, i) => `<li>${q}</li>`).join('');
  }
}

function generateNarrative(data, anomalies, patterns) {
  const parts = [];
  const events = data.events;

  // HR
  const hrRecent = getLatestMetric(events, 'resting_hr', 2);
  const hrAll = getMetricHistory(events, 'resting_hr', 30);
  if (hrRecent.length && hrAll.length >= 14) {
    const baseline = Math.round(avg(hrAll.slice(0, -2).map(e => e.value)));
    const current = Math.round(hrRecent[0].value);
    if (current > baseline + 5) {
      parts.push(`Your <strong>resting heart rate has been elevated</strong>, averaging ${current} bpm compared to your 30-day baseline of ${baseline} bpm.`);
    }
  }

  // Sleep
  const sleepRecent = getLatestMetric(events, 'sleep_duration', 3);
  const sleepAll = getMetricHistory(events, 'sleep_duration', 30);
  if (sleepRecent.length && sleepAll.length >= 14) {
    const baseline = Math.round(avg(sleepAll.slice(0, -3).map(e => e.value)) * 10) / 10;
    const current = Math.round(avg(sleepRecent.map(e => e.value)) * 10) / 10;
    if (current < baseline - 1) {
      parts.push(`Your <strong>sleep duration has dropped</strong> to an average of ${current} hours (vs baseline of ${baseline} hrs).`);
    }
  }

  // BP
  const bpRecent = getLatestMetric(events, 'bp_sys', 7);
  if (bpRecent.length && bpRecent[0].value >= 140) {
    const bpDia = getLatestMetric(events, 'bp_dia', 7);
    parts.push(`Your blood pressure reading of <strong>${Math.round(bpRecent[0].value)}/${bpDia.length ? Math.round(bpDia[0].value) : '?'} mmHg</strong> exceeds the Stage 1 hypertension threshold per <em>Indian Hypertension Guidelines (IHG-III, 2024)</em>.`);
  }

  // Med adherence
  data.medications.forEach(med => {
    const a30 = calcAdherence(data.medLogs, med.id, 30);
    if (a30 !== null && a30 < 80) {
      parts.push(`Your <strong>${escapeHtml(med.name)} adherence</strong> is at ${a30}%, which is below the recommended 80% threshold.`);
    }
  });

  if (parts.length === 0) {
    parts.push('Your health metrics are within expected ranges based on your 30-day baseline. No significant anomalies detected.');
  }

  return parts.map(p => `<p class="mt-3" style="line-height:1.8;">${p}</p>`).join('');
}

function generateQuestions(data, anomalies) {
  const qs = [];
  const bpAnomaly = anomalies.find(a => a.metric === 'BP Systolic');
  if (bpAnomaly) qs.push('My blood pressure was recorded at ' + bpAnomaly.value + '. Should we adjust my current antihypertensive medication or consider additional treatment?');
  const hrAnomaly = anomalies.find(a => a.metric === 'Resting HR');
  if (hrAnomaly) qs.push('My resting heart rate has been elevated alongside poor sleep. Could there be an underlying cause linking these — such as stress, thyroid levels, or medication interaction?');
  data.medications.forEach(med => {
    const a30 = calcAdherence(data.medLogs, med.id, 30);
    if (a30 !== null && a30 < 80) qs.push(`I've been inconsistent with ${med.name} (${a30}% adherence). Are there alternative formulations that might improve compliance?`);
  });
  if (qs.length < 3) qs.push('Should I get updated lab work (TSH, HbA1c, lipid panel) given recent trends?');
  return qs;
}


// ============================================================
// ACTIONS: Check-in, Medication, Symptom, etc.
// ============================================================

// Daily Check-in
function saveCheckin() {
  const mood = parseInt(document.getElementById('mood-slider').value);
  const energy = parseInt(document.getElementById('energy-slider').value);
  const sleepQuality = parseInt(document.getElementById('sleep-slider').value);
  const notesEl = document.getElementById('checkin-notes');
  const notes = notesEl ? notesEl.value.trim() : '';

  const today = todayStr();
  const now = new Date().toISOString();

  Store.update(data => {
    // Remove existing check-in for today (allow re-do)
    data.checkins = data.checkins.filter(c => c.date !== today);
    data.checkins.push({
      id: uid(),
      date: today,
      mood, energy, sleepQuality, notes,
      loggedAt: now,
    });
  });

  showToast('Daily check-in saved! Mood: ' + mood + ', Energy: ' + energy, 'success');
  if (notesEl) notesEl.value = '';

  // Update nav badge
  const badge = document.getElementById('checkin-badge');
  if (badge) badge.innerHTML = '<span class="badge badge-normal">Completed</span>';
}

// Log medication
function logMed(medId, status) {
  const today = todayStr();
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);

  Store.update(data => {
    // Remove existing log for this med today
    data.medLogs = data.medLogs.filter(l => !(l.medId === medId && l.date === today));
    data.medLogs.push({
      id: uid(),
      medId,
      status,
      date: today,
      time: timeStr,
      loggedAt: now.toISOString(),
    });
  });

  const med = Store.get().medications.find(m => m.id === medId);
  const label = med ? med.name : 'Medication';
  showToast(label + ' marked as ' + status + '.', status === 'skipped' ? 'warning' : 'success');

  // Re-render current view
  const medSection = document.getElementById('section-medications');
  if (medSection && !medSection.classList.contains('hidden')) renderMedications();
  const dashSection = document.getElementById('section-dashboard');
  if (dashSection && !dashSection.classList.contains('hidden')) renderDashboard();
}

// Add medication
function addMedication() {
  const nameEl = document.getElementById('med-name');
  const doseEl = document.getElementById('med-dose');
  const freqEl = document.getElementById('med-freq');
  const timeEl = document.getElementById('med-time');
  const doctorEl = document.getElementById('med-doctor');

  const name = nameEl ? nameEl.value.trim() : '';
  const dose = doseEl ? doseEl.value.trim() : '';
  const freq = freqEl ? freqEl.value : 'Once daily';
  const time = timeEl ? timeEl.value : '08:00';
  const doctor = doctorEl ? doctorEl.value.trim() : '';

  if (!name) {
    showToast('Please enter a medication name.', 'error');
    return;
  }

  Store.update(data => {
    data.medications.push({
      id: uid(),
      name: name + (dose ? ' ' + dose : ''),
      generic: name,
      class: '',
      dose: dose,
      frequency: freq,
      time: time,
      ref: 'Manual entry — unverified',
      doctor: doctor,
      addedAt: todayStr(),
    });
  });

  showToast(name + ' added to your medication list!', 'success');
  toggleModal('med-modal');

  // Clear form
  if (nameEl) nameEl.value = '';
  if (doseEl) doseEl.value = '';
  if (doctorEl) doctorEl.value = '';

  // Re-render
  renderMedications();
  renderDashboard();

  // Update nav badge
  updateMedBadge();
}

function removeMedication(medId) {
  Store.update(data => {
    data.medications = data.medications.filter(m => m.id !== medId);
    data.medLogs = data.medLogs.filter(l => l.medId !== medId);
  });
  showToast('Medication removed.', 'warning');
  renderMedications();
  updateMedBadge();
}

function updateMedBadge() {
  const badge = document.getElementById('med-nav-badge');
  if (badge) {
    const count = Store.get().medications.length;
    badge.textContent = count;
  }
}

// Log symptom
function saveSymptom() {
  const nameEl = document.getElementById('symptom-search');
  const sevEl = document.getElementById('symptom-severity');
  const onsetEl = document.getElementById('symptom-onset');
  const locEl = document.getElementById('symptom-location');
  const trigEl = document.getElementById('symptom-trigger');

  const name = nameEl ? nameEl.value.trim() : '';
  const severity = sevEl ? parseInt(sevEl.value) : 5;
  const onset = onsetEl ? onsetEl.value : '';
  const location = locEl ? locEl.value : '';
  const trigger = trigEl ? trigEl.value.trim() : '';

  if (!name) {
    showToast('Please enter a symptom name.', 'error');
    return;
  }

  // ICD-10 lookup (simplified)
  const icd10Map = {
    'headache': 'R51', 'nausea': 'R11.0', 'fatigue': 'R53.83', 'dizziness': 'R42',
    'chest pain': 'R07.9', 'palpitations': 'R00.2', 'fever': 'R50.9', 'cough': 'R05',
    'back pain': 'M54.9', 'insomnia': 'G47.0', 'anxiety': 'F41.9', 'shortness of breath': 'R06.0',
  };
  const icd10 = icd10Map[name.toLowerCase()] || 'R68.89';

  const now = new Date();
  Store.update(data => {
    data.symptoms.push({
      id: uid(),
      name, icd10, severity, onset, location, trigger,
      date: todayStr(),
      loggedAt: now.toISOString(),
    });
  });

  showToast('Symptom "' + name + '" logged (ICD-10: ' + icd10 + ').', 'success');
  if (nameEl) nameEl.value = '';
  if (trigEl) trigEl.value = '';

  renderSymptoms();
}

function removeSymptom(symId) {
  Store.update(data => {
    data.symptoms = data.symptoms.filter(s => s.id !== symId);
  });
  showToast('Symptom removed.', 'warning');
  renderSymptoms();
}

// Symptom tag click
function pickSymptom(name) {
  const el = document.getElementById('symptom-search');
  if (el) el.value = name;
}


// ============================================================
// DOCTOR VIEW HELPERS
// ============================================================
function renderDoctorView() {
  const data = Store.get();
  if (!data) return;

  // Vitals
  const events = data.events;
  const hr = getLatestMetric(events, 'resting_hr', 2);
  const hrv = getLatestMetric(events, 'hrv', 2);
  const bpSys = getLatestMetric(events, 'bp_sys', 7);
  const bpDia = getLatestMetric(events, 'bp_dia', 7);
  const spo2 = getLatestMetric(events, 'spo2', 2);
  const sleep = getLatestMetric(events, 'sleep_duration', 3);

  setKPI('doc-bp', bpSys.length ? Math.round(bpSys[0].value) + '/' + (bpDia.length ? Math.round(bpDia[0].value) : '?') + ' mmHg' : '--');
  setKPI('doc-hr', hr.length ? Math.round(hr[0].value) + ' bpm' : '--');
  setKPI('doc-hrv', hrv.length ? Math.round(hrv[0].value) + ' ms' : '--');
  setKPI('doc-spo2', spo2.length ? spo2[0].value + '%' : '--');
  setKPI('doc-sleep', sleep.length ? Math.round(avg(sleep.map(e => e.value)) * 10) / 10 + ' hrs' : '--');

  // Anomalies table
  const anomalies = detectAnomalies(data);
  const anomalyTable = document.getElementById('doc-anomalies');
  if (anomalyTable) {
    anomalyTable.innerHTML = anomalies.map(a =>
      `<tr><td><strong>${escapeHtml(a.metric)}</strong></td><td>${a.value}</td><td>${a.period}</td><td>${severityBadge(a.severity)}</td></tr>`
    ).join('') || '<tr><td colspan="4" class="text-muted">No anomalies detected.</td></tr>';
  }

  // Med table
  const medTable = document.getElementById('doc-med-table');
  if (medTable) {
    medTable.innerHTML = data.medications.map(med => {
      const a7 = calcAdherence(data.medLogs, med.id, 7);
      const a30 = calcAdherence(data.medLogs, med.id, 30);
      return `<tr${a30 !== null && a30 < 80 ? ' style="background:var(--severity-medium-bg);"' : ''}>
        <td><strong>${escapeHtml(med.name)}</strong><br><span class="text-xs text-muted">${escapeHtml(med.class || med.generic || '')}</span></td>
        <td>${escapeHtml(med.addedAt || '?')}</td>
        <td>${escapeHtml(med.frequency)}, ${med.time}</td>
        <td>${a7 !== null ? (a7 >= 80 ? '<span class="badge badge-normal">' + a7 + '%</span>' : '<span class="badge badge-medium">' + a7 + '%</span>') : '--'}</td>
        <td>${a30 !== null ? (a30 >= 80 ? '<span class="badge badge-normal">' + a30 + '%</span>' : '<span class="badge badge-medium">' + a30 + '%</span>') : '--'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="text-muted">No medications.</td></tr>';
  }

  // Patient conditions
  setKPI('doc-patient-conditions', data.patient.conditions.join(', '));

  // Correlation table
  const patterns = computePatterns(data);
  const corrTable = document.getElementById('doc-correlations');
  if (corrTable) {
    corrTable.innerHTML = patterns.map(p =>
      `<tr><td>${escapeHtml(p.label)}</td><td>${escapeHtml(p.description)}</td><td><strong>${p.r}</strong></td><td>${p.lag}</td><td>n=${p.n}</td></tr>`
    ).join('') || '<tr><td colspan="5" class="text-muted">Insufficient data.</td></tr>';
  }

  // Charts
  const hrAll = getMetricHistory(events, 'resting_hr', 30).map(e => e.value);
  const hrvAll = getMetricHistory(events, 'hrv', 30).map(e => e.value);
  const sleepAll = getMetricHistory(events, 'sleep_duration', 30).map(e => e.value);
  const bpAll = getMetricHistory(events, 'bp_sys', 30).map(e => e.value);

  if (hrAll.length) renderBarChart('doc-hr-chart', hrAll, Math.min(...hrAll) - 5, Math.max(...hrAll) + 5, hrAll.map((v, i) => v > 75 ? i : -1).filter(i => i >= 0));
  if (hrvAll.length) renderBarChart('doc-hrv-chart', hrvAll, Math.min(...hrvAll) - 5, Math.max(...hrvAll) + 5, hrvAll.map((v, i) => v < 36 ? i : -1).filter(i => i >= 0));
  if (sleepAll.length) renderBarChart('doc-sleep-chart', sleepAll, Math.min(...sleepAll) - 1, Math.max(...sleepAll) + 1, sleepAll.map((v, i) => v < 5.5 ? i : -1).filter(i => i >= 0));
  if (bpAll.length) renderBarChart('doc-bp-chart', bpAll, Math.min(...bpAll) - 5, Math.max(...bpAll) + 10, bpAll.map((v, i) => v >= 140 ? i : -1).filter(i => i >= 0));

  // Data quality
  const daysCovered = new Set(data.events.map(e => e.recorded_at.slice(0, 10))).size;
  setKPI('doc-coverage-pct', Math.round(daysCovered / 30 * 100) + '%');
  const covBar = document.getElementById('doc-coverage-bar');
  if (covBar) covBar.style.width = Math.round(daysCovered / 30 * 100) + '%';

  // Narrative
  const docNarrative = document.getElementById('doc-narrative');
  if (docNarrative) {
    docNarrative.innerHTML = generateNarrative(data, anomalies, patterns);
  }

  // Questions
  const docQuestions = document.getElementById('doc-questions');
  if (docQuestions) {
    const qs = generateQuestions(data, anomalies);
    docQuestions.innerHTML = qs.map((q, i) => `<li>
      <p>${q}</p>
      <div class="annotation-box mt-2">
        <label class="form-label text-xs" style="color:var(--accent-600);">Your Response:</label>
        <textarea class="form-textarea" rows="2" placeholder="Type your response..." style="border-color:var(--accent-200);font-size:var(--font-size-sm);" id="doc-answer-${i}"></textarea>
      </div>
    </li>`).join('');
  }
}

// Save doctor notes
function saveDoctorNotes() {
  const impression = document.getElementById('doc-impression');
  const plan = document.getElementById('doc-plan');
  const investigations = document.getElementById('doc-investigations');
  const followupDate = document.getElementById('doc-followup-date');
  const followupType = document.getElementById('doc-followup-type');

  Store.update(data => {
    data.doctorNotes.push({
      id: uid(),
      impression: impression ? impression.value : '',
      plan: plan ? plan.value : '',
      investigations: investigations ? investigations.value : '',
      followupDate: followupDate ? followupDate.value : '',
      followupType: followupType ? followupType.value : '',
      doctor: 'Dr. Sunita Mehra (NMC: MH/2015/12345)',
      savedAt: new Date().toISOString(),
    });
  });

  showToast('Notes saved and sent to patient.', 'success');
}

// Export data
function exportData(format) {
  const data = Store.get();
  let content, filename, type;

  if (format === 'json') {
    content = JSON.stringify(data, null, 2);
    filename = 'healthlog_export_' + todayStr() + '.json';
    type = 'application/json';
  } else {
    // CSV export of events — properly escape fields containing commas/quotes
    const csvEscape = v => {
      const s = String(v == null ? '' : v);
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['id', 'source', 'metric', 'value', 'unit', 'recorded_at', 'confidence']];
    data.events.forEach(e => rows.push([e.id, e.source, e.metric, e.value, e.unit, e.recorded_at, e.confidence]));
    content = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    filename = 'healthlog_events_' + todayStr() + '.csv';
    type = 'text/csv';
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported as ' + format.toUpperCase() + '.', 'success');
}

// Reset all data
function resetAllData() {
  if (confirm('Are you sure you want to delete all your health data? This action cannot be undone. Per DPDP Act 2023, deletion propagates within 30 days.')) {
    Store.reset();
    Store.seedIfEmpty();
    showToast('All data has been deleted and reset.', 'warning');
    renderDashboard();
  }
}


// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  // Seed demo data on first load
  Store.seedIfEmpty();

  // Render based on which page we're on
  if (document.getElementById('section-dashboard')) {
    renderDashboard();
    renderLogbook();
    renderMedications();
    renderSymptoms();
    renderAnomalies();
    renderBrief();
    updateMedBadge();
  }

  // Doctor view rendering is handled by doctor.html's own DOMContentLoaded listener
  // to avoid double-render
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('.search-box input');
    if (searchInput) searchInput.focus();
  }
});
