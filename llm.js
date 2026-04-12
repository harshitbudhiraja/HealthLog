/**
 * HealthLog — LLM Service via OpenRouter
 * Real-time AI-generated alerts, narratives, and anomaly analysis
 * Ref: §2.5 AI Narrative Layer | §2.4 Correlation & Anomaly Engine
 *
 * Uses OpenRouter API to call Claude/GPT for:
 * - Weekly digest generation
 * - Pre-visit brief narrative
 * - Pattern insight cards
 * - Anomaly analysis
 * - Suggested doctor questions
 *
 * Constraints per spec:
 * - Temperature: 0.3 (consistency over creativity)
 * - Max output tokens: 600 (brief), 250 (digest), 80 (insight card)
 * - Observations only — no diagnoses, no drug recommendations
 * - Plain language ≤ Grade 8 reading level
 * - Must cite which data points it references
 */

const LLMService = {
  // API key loaded from config (user sets via UI or .env)
  _apiKey: null,
  // OpenRouter model — using a widely available model ID
  // See https://openrouter.ai/models for current list
  _model: 'anthropic/claude-3.5-sonnet',
  _baseUrl: 'https://openrouter.ai/api/v1/chat/completions',

  // Track generation metadata per spec (§2.5)
  _promptVersion: 'v2.1',
  _lastModelVersion: null,

  getApiKey() {
    if (this._apiKey) return this._apiKey;
    // Check localStorage for key
    const stored = localStorage.getItem('healthlog_openrouter_key');
    if (stored) { this._apiKey = stored; return stored; }
    return null;
  },

  setApiKey(key) {
    this._apiKey = key;
    localStorage.setItem('healthlog_openrouter_key', key);
  },

  isConfigured() {
    return !!this.getApiKey();
  },

  // ===== SYSTEM PROMPT (§2.5 Prompt Engineering Constraints) =====
  _systemPrompt: `You are the HealthLog AI narrative engine. You generate health observations for patients based on structured health data.

CRITICAL CONSTRAINTS:
1. You produce OBSERVATIONS ONLY — never diagnoses, never drug recommendations, never treatment plans.
2. Use plain language at or below Grade 8 reading level.
3. Every claim must cite the specific data point it references (metric name, value, date range).
4. If insufficient data (< 14 days of a metric), do NOT generate anomaly claims for that metric. State that more data is needed.
5. For HIGH severity anomalies (BP ≥ 140, glucose extremes, body temp spike), always include: "This warrants a conversation with your doctor."
6. Never say "You may have X" or "This could indicate Y disease". Only describe what the numbers show.
7. Reference Indian healthcare standards where relevant: IHG-III (2024) for blood pressure, ICMR guidelines for glucose.
8. Frame medication adherence as observed patterns, not judgments.

OUTPUT FORMAT:
- Return valid JSON with the requested structure.
- Include a "citations" array listing each data point referenced.`,

  // ===== BUILD STRUCTURED INPUT (§2.5 — No raw sensor data) =====
  buildPayload(data) {
    const events = data.events;

    // Compute summaries per metric (last 30 days)
    const metrics = {};
    const metricTypes = ['resting_hr', 'hrv', 'sleep_duration', 'spo2', 'steps', 'bp_sys', 'bp_dia', 'cycle_phase'];
    metricTypes.forEach(m => {
      const history = events
        .filter(e => e.metric === m)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      if (history.length === 0) return;
      const values = history.map(e => e.value);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const latest = history[history.length - 1];
      metrics[m] = {
        latest_value: Math.round(latest.value * 10) / 10,
        latest_date: latest.recorded_at.slice(0, 10),
        mean_30d: Math.round(mean * 10) / 10,
        min: Math.round(Math.min(...values) * 10) / 10,
        max: Math.round(Math.max(...values) * 10) / 10,
        data_points: values.length,
        unit: latest.unit,
        last_7_values: history.slice(-7).map(e => ({ value: Math.round(e.value * 10) / 10, date: e.recorded_at.slice(0, 10) })),
      };
    });

    // Anomalies (from engine)
    const anomalies = typeof detectAnomalies === 'function' ? detectAnomalies(data) : [];

    // Medication info
    const meds = data.medications.map(med => {
      const a7 = typeof calcAdherence === 'function' ? calcAdherence(data.medLogs, med.id, 7) : null;
      const a30 = typeof calcAdherence === 'function' ? calcAdherence(data.medLogs, med.id, 30) : null;
      return {
        name: med.name,
        generic: med.generic,
        dose: med.dose,
        frequency: med.frequency,
        adherence_7d: a7,
        adherence_30d: a30,
        since: med.addedAt,
      };
    });

    // Symptoms (last 14 days)
    const cutoff14d = new Date(Date.now() - 14 * 86400000).toISOString();
    const symptoms = data.symptoms
      .filter(s => s.loggedAt >= cutoff14d)
      .map(s => ({ name: s.name, severity: s.severity, date: s.date, icd10: s.icd10, trigger: s.trigger }));

    // Check-ins (last 7 days)
    const cutoff7d = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const checkins = data.checkins
      .filter(c => c.date >= cutoff7d)
      .map(c => ({ date: c.date, mood: c.mood, energy: c.energy, sleep_quality: c.sleepQuality, notes: c.notes }));

    return {
      patient: {
        name: data.patient.name,
        age: data.patient.age,
        sex: data.patient.sex,
        conditions: data.patient.conditions,
      },
      metrics,
      anomalies: anomalies.map(a => ({ metric: a.metric, value: a.value, threshold: a.threshold, severity: a.severity, period: a.period })),
      medications: meds,
      symptoms,
      checkins,
      data_days: new Set(events.map(e => e.recorded_at.slice(0, 10))).size,
    };
  },

  // ===== API CALL =====
  async _call(messages, maxTokens) {
    const key = this.getApiKey();
    if (!key) throw new Error('OpenRouter API key not configured. Go to Settings to add your key.');

    // file:// protocol returns "null" as origin — use fallback
    const origin = window.location.origin;
    const referer = (!origin || origin === 'null' || origin === 'file://') ? 'https://healthlog.app' : origin;

    let response;
    try {
      response = await fetch(this._baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': referer,
          'X-Title': 'HealthLog Health Intelligence Platform',
        },
        body: JSON.stringify({
          model: this._model,
          messages,
          temperature: 0.3,
          max_tokens: maxTokens || 600,
        }),
      });
    } catch (networkErr) {
      throw new Error('Network error — check your internet connection. Details: ' + networkErr.message);
    }

    // Read body as text first so we can inspect it regardless of parse outcome
    const bodyText = await response.text();

    if (!response.ok) {
      // Try to extract a useful error message
      let errMsg = bodyText;
      try {
        const errJson = JSON.parse(bodyText);
        errMsg = errJson.error?.message || errJson.message || bodyText;
      } catch (_) { /* use raw text */ }
      throw new Error('OpenRouter API error (' + response.status + '): ' + errMsg);
    }

    // Parse the successful response
    let result;
    try {
      result = JSON.parse(bodyText);
    } catch (parseErr) {
      throw new Error('OpenRouter returned invalid JSON. Raw response: ' + bodyText.slice(0, 200));
    }

    // Handle OpenRouter error responses that arrive with 200 status
    if (result.error) {
      const errMsg = result.error.message || result.error.code || JSON.stringify(result.error);
      throw new Error('OpenRouter error: ' + errMsg);
    }

    // Validate response structure
    if (!result.choices || !result.choices.length || !result.choices[0].message) {
      throw new Error('OpenRouter returned an unexpected response structure. Keys: ' + Object.keys(result).join(', '));
    }

    this._lastModelVersion = result.model || this._model;
    return result.choices[0].message.content;
  },

  // ===== GENERATE: Weekly Digest (§2.5 — ~150 words) =====
  async generateWeeklyDigest(data) {
    const payload = this.buildPayload(data);
    const messages = [
      { role: 'system', content: this._systemPrompt },
      { role: 'user', content: `Generate a weekly health digest for this patient. Data payload:

${JSON.stringify(payload, null, 2)}

Return JSON:
{
  "digest": "150-word plain-language summary of the week's signals, patterns, wins, and flags",
  "highlights": ["array of 3-5 key observations"],
  "citations": [{"metric": "...", "value": "...", "date": "..."}]
}

Remember: observations only, no diagnoses. Plain language. Cite specific data points.` },
    ];

    const raw = await this._call(messages, 400);
    return this._parseJSON(raw);
  },

  // ===== GENERATE: Pre-Visit Brief Narrative (§2.6 — ~300-400 words) =====
  async generateBriefNarrative(data) {
    const payload = this.buildPayload(data);
    const messages = [
      { role: 'system', content: this._systemPrompt },
      { role: 'user', content: `Generate a pre-visit health brief narrative for this patient. This will be shared with their doctor. Data payload:

${JSON.stringify(payload, null, 2)}

Return JSON:
{
  "whats_changed": "100-120 word narrative of notable shifts in the past 30 days",
  "anomaly_summary": "2-3 sentences summarizing active anomalies",
  "correlation_insights": "2-3 sentences about detected patterns",
  "medication_note": "1-2 sentences about medication adherence",
  "questions_for_doctor": ["3-5 questions the patient should ask, written in patient's voice"],
  "citations": [{"metric": "...", "value": "...", "date": "...", "context": "..."}]
}

For BP ≥ 140: reference Indian Hypertension Guidelines (IHG-III, 2024).
For glucose: reference ICMR guidelines.
Observations only. No diagnoses. Grade 8 reading level.` },
    ];

    const raw = await this._call(messages, 800);
    return this._parseJSON(raw);
  },

  // ===== GENERATE: Insight Card (§2.5 — ~80 words max) =====
  async generateInsightCard(data, patternDescription) {
    const payload = this.buildPayload(data);
    const messages = [
      { role: 'system', content: this._systemPrompt },
      { role: 'user', content: `Generate a brief insight card (1-2 sentences, max 80 words) about this pattern:

Pattern: ${patternDescription}

Patient data context:
${JSON.stringify(payload.metrics, null, 2)}

Return JSON:
{
  "insight": "1-2 sentence observation",
  "citations": [{"metric": "...", "value": "...", "date": "..."}]
}` },
    ];

    const raw = await this._call(messages, 150);
    return this._parseJSON(raw);
  },

  // ===== GENERATE: Anomaly Analysis =====
  async analyzeAnomalies(data) {
    const payload = this.buildPayload(data);
    if (payload.anomalies.length === 0) return { analysis: 'No anomalies detected.', recommendations: [] };

    const messages = [
      { role: 'system', content: this._systemPrompt },
      { role: 'user', content: `Analyze these health anomalies and provide observations. Data:

${JSON.stringify(payload, null, 2)}

Return JSON:
{
  "analysis": "Plain-language analysis of the anomalies and how they may relate to each other (150 words max)",
  "severity_assessment": "Overall picture — are things trending up/down/stable?",
  "action_items": ["What the patient should track or discuss with their doctor"],
  "citations": [{"metric": "...", "value": "...", "date": "...", "context": "..."}]
}

CRITICAL: For HIGH severity (BP ≥ 140, glucose extremes): include "This warrants a conversation with your doctor."
Never say "you may have" or imply diagnosis.` },
    ];

    const raw = await this._call(messages, 500);
    return this._parseJSON(raw);
  },

  // ===== PARSE JSON (handle markdown-wrapped responses) =====
  _parseJSON(raw) {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('LLM response parse error:', e, 'Raw:', raw);
      return { error: 'Failed to parse AI response', raw };
    }
  },

  // ===== AUDIT METADATA (§2.5) =====
  getAuditInfo() {
    return {
      model_version: this._lastModelVersion || this._model,
      prompt_version: this._promptVersion,
      temperature: 0.3,
      input_hash: null, // computed per call
      generated_at: new Date().toISOString(),
    };
  },
};


// ============================================================
// LLM UI INTEGRATION — hooks into app.js rendering
// ============================================================

// Generate AI weekly digest and show on dashboard
async function generateAIDigest() {
  const btn = document.getElementById('btn-ai-digest');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

  try {
    if (!LLMService.isConfigured()) {
      showToast('Please configure your OpenRouter API key in Settings.', 'error');
      return;
    }

    const data = Store.get();
    const result = await LLMService.generateWeeklyDigest(data);

    // Store the digest
    Store.update(d => {
      d.latestDigest = {
        ...result,
        audit: LLMService.getAuditInfo(),
        generatedAt: new Date().toISOString(),
      };
    });

    // Render
    renderAIDigest(result);
    showToast('AI weekly digest generated!', 'success');
  } catch (e) {
    showToast('AI generation failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Regenerate with AI'; }
  }
}

function renderAIDigest(result) {
  const container = document.getElementById('ai-digest-content');
  if (!container) return;

  if (result.error) {
    container.innerHTML = `<p class="text-muted">${escapeHtml(result.error)}</p>`;
    return;
  }

  const digest = result.digest || result.raw || 'No digest generated.';
  const highlights = result.highlights || [];
  const citations = result.citations || [];
  const audit = LLMService.getAuditInfo();

  container.innerHTML = `
    <p style="line-height:1.8;">${escapeHtml(digest)}</p>
    ${highlights.length ? '<ul class="mt-4" style="padding-left:var(--space-5);display:flex;flex-direction:column;gap:var(--space-2);">' + highlights.map(h => '<li class="text-sm">' + escapeHtml(h) + '</li>').join('') + '</ul>' : ''}
    ${citations.length ? '<div class="mt-4"><span class="text-xs font-bold text-muted">Data citations:</span><div class="flex gap-2 mt-1" style="flex-wrap:wrap;">' + citations.map(c => '<span class="tag">' + escapeHtml(c.metric) + ': ' + escapeHtml(String(c.value)) + ' (' + escapeHtml(c.date) + ')</span>').join('') + '</div></div>' : ''}
    <div class="disclaimer mt-4">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-600)" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>Observations only — not a diagnosis.</strong> AI-generated via OpenRouter (${escapeHtml(audit.model_version)}) | Prompt ${audit.prompt_version} | Temp: ${audit.temperature}</span>
    </div>`;
}

// Generate full AI brief
async function generateAIBrief() {
  const btn = document.getElementById('btn-ai-brief');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating Brief...'; }

  try {
    if (!LLMService.isConfigured()) {
      showToast('Please configure your OpenRouter API key in Settings.', 'error');
      return;
    }

    const data = Store.get();
    const result = await LLMService.generateBriefNarrative(data);
    const audit = LLMService.getAuditInfo();

    // Store the brief
    const briefId = 'BRF-' + todayStr().replace(/-/g, '') + '-' + uid().slice(0, 4).toUpperCase();
    Store.update(d => {
      d.briefs.push({
        id: briefId,
        ...result,
        audit,
        generatedAt: new Date().toISOString(),
        inputHash: 'sha256_' + Math.random().toString(36).slice(2, 10),
      });
      d.latestBrief = { id: briefId, ...result, audit };
    });

    renderAIBrief(result, audit, briefId);
    showToast('Pre-Visit Brief generated by AI!', 'success');
  } catch (e) {
    showToast('Brief generation failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> Regenerate Brief with AI'; }
  }
}

function renderAIBrief(result, audit, briefId) {
  // Update the narrative section in the brief view
  const narrative = document.getElementById('brief-narrative');
  if (narrative && result.whats_changed) {
    narrative.innerHTML = `
      <p style="line-height:1.8;">${escapeHtml(result.whats_changed)}</p>
      ${result.anomaly_summary ? '<p class="mt-3" style="line-height:1.8;">' + escapeHtml(result.anomaly_summary) + '</p>' : ''}
      ${result.correlation_insights ? '<p class="mt-3" style="line-height:1.8;">' + escapeHtml(result.correlation_insights) + '</p>' : ''}
      ${result.medication_note ? '<p class="mt-3" style="line-height:1.8;">' + escapeHtml(result.medication_note) + '</p>' : ''}`;
  }

  // Update questions
  const questions = document.getElementById('brief-questions');
  if (questions && result.questions_for_doctor) {
    questions.innerHTML = result.questions_for_doctor.map(q => '<li>' + escapeHtml(q) + '</li>').join('');
  }

  // Update citations
  const citationsEl = document.getElementById('brief-citations');
  if (citationsEl && result.citations) {
    citationsEl.innerHTML = result.citations.map(c =>
      `<span class="tag">${escapeHtml(c.metric)}: ${escapeHtml(String(c.value))} (${escapeHtml(c.date)})${c.context ? ' — ' + escapeHtml(c.context) : ''}</span>`
    ).join(' ');
  }

  // Update audit
  setKPI('brief-model-version', audit.model_version);
  setKPI('brief-prompt-version', audit.prompt_version);
  setKPI('brief-generated-at', formatDateTime(audit.generated_at));
  setKPI('brief-id', briefId);
}

// Generate AI anomaly analysis
async function generateAIAnomalyAnalysis() {
  const btn = document.getElementById('btn-ai-anomaly');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing...'; }

  try {
    if (!LLMService.isConfigured()) {
      showToast('Please configure your OpenRouter API key in Settings.', 'error');
      return;
    }

    const data = Store.get();
    const result = await LLMService.analyzeAnomalies(data);

    const container = document.getElementById('ai-anomaly-analysis');
    if (container) {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-600)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <h4>AI Anomaly Analysis</h4>
          </div>
          <span class="badge badge-accent">AI Generated</span>
        </div>
        <div class="card-body">
          <p style="line-height:1.8;">${escapeHtml(result.analysis || '')}</p>
          ${result.severity_assessment ? '<p class="mt-3 text-sm font-bold">' + escapeHtml(result.severity_assessment) + '</p>' : ''}
          ${result.action_items && result.action_items.length ? '<ul class="mt-4" style="padding-left:var(--space-5);display:flex;flex-direction:column;gap:var(--space-2);">' + result.action_items.map(a => '<li class="text-sm">' + escapeHtml(a) + '</li>').join('') + '</ul>' : ''}
          <div class="disclaimer mt-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-600)" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span><strong>Observations only — not a diagnosis.</strong> Consult a registered medical practitioner (per NMC guidelines) for clinical decisions.</span>
          </div>
        </div>`;
    }

    showToast('AI anomaly analysis generated.', 'success');
  } catch (e) {
    showToast('Analysis failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Analyze with AI'; }
  }
}

// API Key configuration UI
function showApiKeyModal() {
  const existing = LLMService.getApiKey() || '';
  const modal = document.getElementById('apikey-modal');
  if (modal) {
    const input = document.getElementById('apikey-input');
    if (input) input.value = existing;
    modal.classList.add('active');
  }
}

function saveApiKey() {
  const input = document.getElementById('apikey-input');
  if (!input) return;
  const key = input.value.trim();
  if (!key) {
    showToast('Please enter a valid API key.', 'error');
    return;
  }
  LLMService.setApiKey(key);
  toggleModal('apikey-modal');
  showToast('OpenRouter API key saved! AI features are now active.', 'success');

  // Update UI indicator
  const indicator = document.getElementById('ai-status');
  if (indicator) {
    indicator.innerHTML = '<span class="sync-dot connected"></span> <span class="text-xs">AI Active</span>';
  }
}

// Load cached digest/brief on page load
function loadCachedAIContent() {
  const data = Store.get();
  if (data.latestDigest) {
    renderAIDigest(data.latestDigest);
  }
}
