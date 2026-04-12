/**
 * HealthLog — Shared Application Logic
 * Health Intelligence Platform | v1.0
 * Ref: HealthLog_TechSpec.docx
 *
 * Handles: navigation, charts, modals, toasts, mock data rendering
 */

// ===== SECTION NAVIGATION (Patient View) =====
function showSection(sectionId) {
  // Hide all sections
  document.querySelectorAll('.page-section').forEach(section => {
    section.classList.add('hidden');
  });

  // Show target section
  const target = document.getElementById('section-' + sectionId);
  if (target) {
    target.classList.remove('hidden');
  }

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  if (event && event.currentTarget && event.currentTarget.classList.contains('nav-item')) {
    event.currentTarget.classList.add('active');
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== MODAL TOGGLE =====
function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.toggle('active');
  }
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Close modal on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
  }
});

// ===== TOAST NOTIFICATIONS =====
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

  toast.innerHTML = (icons[type] || icons.info) +
    '<div style="flex:1;"><p style="font-size:0.8125rem;font-weight:500;">' + message + '</p></div>' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#9e9e9e;padding:4px;">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';

  container.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(function() {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(function() { toast.remove(); }, 300);
    }
  }, 4000);
}

// ===== MINI CHART RENDERING (Patient Dashboard) =====
function renderMiniChart(containerId, data, color) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const max = Math.max.apply(null, data);
  const min = Math.min.apply(null, data);
  const range = max - min || 1;

  data.forEach(function(val) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const height = ((val - min) / range) * 32 + 4;
    bar.style.height = height + 'px';
    if (color) bar.style.background = color;
    container.appendChild(bar);
  });
}

// ===== TIMELINE CHART RENDERING =====
function renderTimelineChart(containerId, data, minVal, maxVal, anomalyIndices) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  var range = maxVal - minVal;

  data.forEach(function(val, i) {
    var bar = document.createElement('div');
    bar.className = 'chart-bar';
    var height = ((val - minVal) / range) * 100;
    bar.style.height = Math.max(4, Math.min(100, height)) + '%';

    if (anomalyIndices && anomalyIndices.indexOf(i) !== -1) {
      bar.classList.add('anomaly');
    }

    bar.title = val.toString();
    container.appendChild(bar);
  });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
  // --- Patient Dashboard Mini Charts ---
  // Resting HR: last 14 days (baseline ~69, recent spike to 78)
  var hrData = [68, 70, 69, 71, 68, 69, 72, 70, 69, 71, 68, 72, 76, 78];
  renderMiniChart('hr-chart', hrData, '#f57c00');

  // HRV: last 14 days (baseline ~46, dropping to 34)
  var hrvData = [48, 45, 47, 44, 46, 49, 43, 47, 45, 42, 40, 38, 36, 34];
  renderMiniChart('hrv-chart', hrvData, '#1976d2');

  // Sleep: last 14 days (baseline ~7.1, dropping to 4.8)
  var sleepData = [7.2, 6.8, 7.5, 7.0, 7.3, 7.1, 7.4, 6.9, 7.2, 7.0, 5.8, 5.2, 4.5, 4.8];
  renderMiniChart('sleep-chart', sleepData, '#009688');

  // --- Logbook Timeline Chart ---
  // Mixed HR data for 14 days
  var timelineData = [68, 70, 69, 71, 68, 69, 72, 70, 69, 71, 68, 72, 76, 78];
  renderTimelineChart('timeline-chart', timelineData, 60, 85, [12, 13]);

  // --- Mobile sidebar toggle ---
  var menuToggle = document.querySelector('.menu-toggle');
  var sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
    });
  }
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function(e) {
  // Ctrl/Cmd + K: Focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var searchInput = document.querySelector('.search-box input');
    if (searchInput) searchInput.focus();
  }
});
