// components/EditRoomModal.js
// Alzeto Dashboard — Full Edit Modal
// Tabs: Usage Correction | Quota Settings | Anniversary Date | Change History

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n ?? 0);

const calcOverageBill = (usage, quota) => {
  const overE = Math.max((usage.used_electricity ?? 0) - (quota.base_electricity ?? 0), 0);
  const overL = Math.max((usage.used_laundry ?? 0) - (quota.base_laundry ?? 0), 0);
  const overW = Math.max((usage.used_gallons ?? 0) - (quota.base_gallons ?? 0), 0);
  return (
    overE * (quota.price_electricity ?? 0) +
    overL * (quota.price_laundry ?? 0) +
    overW * (quota.price_gallons ?? 0)
  );
};

const pct = (used, quota) => (quota > 0 ? Math.min(Math.round((used / quota) * 100), 100) : 0);

const barColor = (p) => {
  if (p >= 100) return '#E24B4A';
  if (p >= 80) return '#EF9F27';
  return '#1D9E75';
};

function UsageBar({ used, quota, color }) {
  const p = pct(used ?? 0, quota ?? 0);
  const c = color ?? barColor(p);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--color-bg-track)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 30, textAlign: 'right' }}>{p}%</span>
    </div>
  );
}

// ─── Change History Row ──────────────────────────────────────────────────────

function HistoryRow({ entry }) {
  const typeLabels = { correction: 'Usage correction', quota: 'Quota change', date: 'Date update', payment: 'Bill paid' };
  const typeColors = { correction: '#378ADD', quota: '#1D9E75', date: '#EF9F27', payment: '#E24B4A' };
  return (
    <div style={styles.histRow}>
      <div style={{ ...styles.histDot, background: typeColors[entry.type] ?? '#888' }} />
      <div style={{ flex: 1 }}>
        <div style={styles.histLabel}>{typeLabels[entry.type] ?? entry.type}</div>
        <div style={styles.histDetail}>{entry.detail}</div>
      </div>
      <div style={styles.histTime}>{new Date(entry.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  );
}

// ─── Confirm Overlay ─────────────────────────────────────────────────────────

function ConfirmOverlay({ message, onConfirm, onCancel }) {
  return (
    <div style={styles.confirmBg}>
      <div style={styles.confirmBox}>
        <div style={styles.confirmIcon}>⚠</div>
        <div style={styles.confirmMsg}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onCancel}>Cancel</button>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onConfirm}>Confirm save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function EditRoomModal({ room, onClose, onSaved }) {
  const [tab, setTab] = useState('usage');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Local editable state
  const [usage, setUsage] = useState({
    used_electricity: room.used_electricity ?? 0,
    used_laundry: room.used_laundry ?? 0,
    used_gallons: room.used_gallons ?? 0,
  });

  const [quota, setQuota] = useState({
    base_electricity: room.base_electricity ?? 0,
    base_laundry: room.base_laundry ?? 0,
    base_gallons: room.base_gallons ?? 0,
    price_electricity: room.price_electricity ?? 0,
    price_laundry: room.price_laundry ?? 0,
    price_gallons: room.price_gallons ?? 0,
  });

  const [checkinDate, setCheckinDate] = useState(room.checkin_date ?? '');

  // Live preview of remaining & bill
  const remaining = {
    electricity: Math.max((quota.base_electricity ?? 0) - (usage.used_electricity ?? 0), 0),
    laundry: Math.max((quota.base_laundry ?? 0) - (usage.used_laundry ?? 0), 0),
    gallons: Math.max((quota.base_gallons ?? 0) - (usage.used_gallons ?? 0), 0),
  };
  const liveOverage = calcOverageBill(usage, quota);

  // ── Load history ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!room.room_id) return;
    setHistLoading(true);
    try {
      const { data, error } = await supabase
        .from('change_log')
        .select('*')
        .eq('room_id', room.room_id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!error && data) setHistory(data);
    } catch (_) {}
    setHistLoading(false);
  }, [room.room_id]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── Save helpers ─────────────────────────────────────────────────────────────
  const flashSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const withConfirm = (message, action) => {
    setPendingAction(() => action);
    setShowConfirm(message);
  };

  // ── Save Usage Correction ─────────────────────────────────────────────────────
  const saveUsage = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from('current_usage')
        .update({
          used_electricity: Number(usage.used_electricity),
          used_laundry: Number(usage.used_laundry),
          used_gallons: Number(usage.used_gallons),
        })
        .eq('room_id', room.room_id);
      if (e1) throw e1;

      // Log the change
      await supabase.from('change_log').insert({
        room_id: room.room_id,
        type: 'correction',
        detail: `Electricity: ${room.used_electricity} → ${usage.used_electricity} kWh | Laundry: ${room.used_laundry} → ${usage.used_laundry} kg | Water: ${room.used_gallons} → ${usage.used_gallons} gal`,
        admin_note: 'Manual correction via admin panel',
      });

      flashSuccess('Usage values updated successfully');
      onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Failed to save usage');
    }
    setSaving(false);
  };

  // ── Save Quota Settings ───────────────────────────────────────────────────────
  const saveQuota = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from('quota_settings')
        .update({
          base_electricity: Number(quota.base_electricity),
          base_laundry: Number(quota.base_laundry),
          base_gallons: Number(quota.base_gallons),
          price_electricity: Number(quota.price_electricity),
          price_laundry: Number(quota.price_laundry),
          price_gallons: Number(quota.price_gallons),
        })
        .eq('room_id', room.room_id);
      if (e1) throw e1;

      await supabase.from('change_log').insert({
        room_id: room.room_id,
        type: 'quota',
        detail: `Electricity: ${room.base_electricity} → ${quota.base_electricity} kWh | Laundry: ${room.base_laundry} → ${quota.base_laundry} kg | Water: ${room.base_gallons} → ${quota.base_gallons} gal`,
      });

      flashSuccess('Quota settings saved — remaining balances recalculated');
      onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Failed to save quota');
    }
    setSaving(false);
  };

  // ── Save Anniversary Date ──────────────────────────────────────────────────────
  const saveDate = async () => {
    if (!checkinDate) { setError('Please select a valid date'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from('rooms')
        .update({ checkin_date: checkinDate })
        .eq('id', room.room_id);
      if (e1) throw e1;

      await supabase.from('change_log').insert({
        room_id: room.room_id,
        type: 'date',
        detail: `Check-in date changed from ${room.checkin_date ?? 'none'} → ${checkinDate}`,
      });

      flashSuccess(`Anniversary date updated to ${checkinDate} — resets will occur on day ${new Date(checkinDate).getDate()} each month`);
      onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Failed to save date');
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'usage',   label: 'Usage' },
    { id: 'quota',   label: 'Quota' },
    { id: 'date',    label: 'Date' },
    { id: 'history', label: 'History' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div style={styles.modal} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.headerRoom}>Room {room.room_number}</div>
            <div style={styles.headerGuest}>{room.guest_name}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Live preview strip */}
        <div style={styles.previewStrip}>
          {[
            { label: 'Remaining electricity', val: `${remaining.electricity.toFixed(1)} kWh`, color: barColor(pct(usage.used_electricity, quota.base_electricity)) },
            { label: 'Remaining laundry',     val: `${remaining.laundry.toFixed(1)} kg`,      color: barColor(pct(usage.used_laundry, quota.base_laundry)) },
            { label: 'Remaining water',       val: `${remaining.gallons.toFixed(1)} gal`,      color: barColor(pct(usage.used_gallons, quota.base_gallons)) },
            { label: 'Live overage bill',     val: fmt(liveOverage),                           color: liveOverage > 0 ? '#E24B4A' : '#1D9E75' },
          ].map(({ label, val, color }) => (
            <div key={label} style={styles.previewItem}>
              <div style={styles.previewLabel}>{label}</div>
              <div style={{ ...styles.previewVal, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={styles.tabBar}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {error   && <div style={styles.alertError}>{error}</div>}
        {success && <div style={styles.alertSuccess}>{success}</div>}

        {/* Tab content */}
        <div style={styles.body}>

          {/* ── USAGE CORRECTION ── */}
          {tab === 'usage' && (
            <div>
              <div style={styles.tabHint}>
                Override current usage values to correct input errors. Original values are shown for reference. Overage bill recalculates instantly.
              </div>
              {[
                { key: 'used_electricity', label: 'Electricity used',  unit: 'kWh', quota: quota.base_electricity, color: '#1D9E75', orig: room.used_electricity ?? 0 },
                { key: 'used_laundry',     label: 'Laundry used',      unit: 'kg',  quota: quota.base_laundry,     color: '#378ADD', orig: room.used_laundry ?? 0 },
                { key: 'used_gallons',     label: 'Water used',        unit: 'gal', quota: quota.base_gallons,     color: '#EF9F27', orig: room.used_gallons ?? 0 },
              ].map(({ key, label, unit, quota: q, color, orig }) => (
                <div key={key} style={styles.fieldBlock}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <label style={styles.fieldLabel}>{label}</label>
                    <span style={styles.origVal}>was {orig} {unit}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      style={styles.input}
                      value={usage[key]}
                      onChange={e => setUsage(u => ({ ...u, [key]: e.target.value }))}
                    />
                    <span style={styles.unitLabel}>{unit}</span>
                    <span style={styles.quotaHint}>/ {q} {unit} quota</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <UsageBar used={Number(usage[key])} quota={q} color={color} />
                  </div>
                </div>
              ))}
              <div style={styles.footer}>
                <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Cancel</button>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  disabled={saving}
                  onClick={() => withConfirm(
                    `Save corrected usage for Room ${room.room_number}? This will override the current values and be logged in change history.`,
                    saveUsage
                  )}
                >
                  {saving ? 'Saving…' : 'Save corrections'}
                </button>
              </div>
            </div>
          )}

          {/* ── QUOTA SETTINGS ── */}
          {tab === 'quota' && (
            <div>
              <div style={styles.tabHint}>
                Change negotiated monthly quotas and overage pricing. Remaining balance updates immediately in the preview above.
              </div>
              {[
                { baseKey: 'base_electricity', priceKey: 'price_electricity', label: 'Electricity', baseUnit: 'kWh/mo', priceUnit: 'IDR/kWh' },
                { baseKey: 'base_laundry',     priceKey: 'price_laundry',     label: 'Laundry',     baseUnit: 'kg/mo',  priceUnit: 'IDR/kg'  },
                { baseKey: 'base_gallons',     priceKey: 'price_gallons',     label: 'Water',       baseUnit: 'gal/mo', priceUnit: 'IDR/gal' },
              ].map(({ baseKey, priceKey, label, baseUnit, priceUnit }) => (
                <div key={baseKey} style={styles.fieldBlock}>
                  <div style={styles.fieldLabel}>{label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                    <div>
                      <div style={styles.subLabel}>Monthly quota ({baseUnit})</div>
                      <input
                        type="number" min="0" step="1" style={styles.input}
                        value={quota[baseKey]}
                        onChange={e => setQuota(q => ({ ...q, [baseKey]: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div style={styles.subLabel}>Overage price ({priceUnit})</div>
                      <input
                        type="number" min="0" step="100" style={styles.input}
                        value={quota[priceKey]}
                        onChange={e => setQuota(q => ({ ...q, [priceKey]: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div style={styles.footer}>
                <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Cancel</button>
                <button
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                  disabled={saving}
                  onClick={() => withConfirm(
                    `Update quota settings for Room ${room.room_number}? New remaining balances will take effect immediately.`,
                    saveQuota
                  )}
                >
                  {saving ? 'Saving…' : 'Save quota'}
                </button>
              </div>
            </div>
          )}

          {/* ── ANNIVERSARY DATE ── */}
          {tab === 'date' && (
            <div>
              <div style={styles.tabHint}>
                Correct the check-in date. The day of the month determines when monthly quotas reset (anniversary reset). Changing this affects all future resets.
              </div>
              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>Check-in / Anniversary date</label>
                <input
                  type="date"
                  style={{ ...styles.input, marginTop: 8 }}
                  value={checkinDate}
                  onChange={e => setCheckinDate(e.target.value)}
                />
                {checkinDate && (
                  <div style={styles.dateHint}>
                    Monthly reset will occur on day <strong>{new Date(checkinDate).getDate()}</strong> of every month.
                  </div>
                )}
              </div>
              <div style={styles.footer}>
                <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onClose}>Cancel</button>
                <button
                  style={{ ...styles.btn, ...styles.btnWarning }}
                  disabled={saving}
                  onClick={() => withConfirm(
                    `Change anniversary date to ${checkinDate}? Future monthly resets for Room ${room.room_number} will use this date.`,
                    saveDate
                  )}
                >
                  {saving ? 'Saving…' : 'Update date'}
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div>
              <div style={styles.tabHint}>
                All manual changes and resets for this room, newest first.
              </div>
              {histLoading && <div style={styles.loadingMsg}>Loading history…</div>}
              {!histLoading && history.length === 0 && (
                <div style={styles.emptyMsg}>No change history yet for this room.</div>
              )}
              <div style={styles.histList}>
                {history.map((h, i) => <HistoryRow key={h.id ?? i} entry={h} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm overlay */}
      {showConfirm && (
        <ConfirmOverlay
          message={showConfirm}
          onCancel={() => { setShowConfirm(false); setPendingAction(null); }}
          onConfirm={() => {
            setShowConfirm(false);
            if (pendingAction) pendingAction();
            setPendingAction(null);
          }}
        />
      )}
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
  },
  modal: {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%)',
    width: 'min(580px, 95vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'var(--color-background-primary, #fff)',
    border: '0.5px solid rgba(0,0,0,0.12)',
    borderRadius: 16,
    zIndex: 201,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 20px 0',
  },
  headerRoom: { fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary, #111)' },
  headerGuest: { fontSize: 13, color: 'var(--color-text-secondary, #666)', marginTop: 2 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 16, cursor: 'pointer',
    color: 'var(--color-text-secondary, #666)', lineHeight: 1, padding: 4,
  },
  previewStrip: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 1, background: 'rgba(0,0,0,0.06)',
    margin: '14px 20px 0', borderRadius: 10, overflow: 'hidden',
  },
  previewItem: {
    background: 'var(--color-background-primary, #fff)',
    padding: '10px 12px',
  },
  previewLabel: { fontSize: 10, color: 'var(--color-text-secondary, #888)', marginBottom: 3, lineHeight: 1.3 },
  previewVal: { fontSize: 13, fontWeight: 600 },
  tabBar: {
    display: 'flex', gap: 0, margin: '14px 20px 0',
    borderBottom: '1px solid rgba(0,0,0,0.08)',
  },
  tabBtn: {
    padding: '8px 16px', fontSize: 13, border: 'none', background: 'none',
    cursor: 'pointer', color: 'var(--color-text-secondary, #666)',
    borderBottom: '2px solid transparent', marginBottom: -1, fontFamily: 'inherit',
  },
  tabBtnActive: {
    color: '#1D9E75', borderBottomColor: '#1D9E75', fontWeight: 600,
  },
  body: { padding: '16px 20px 20px' },
  tabHint: {
    fontSize: 12, color: 'var(--color-text-secondary, #888)',
    background: 'rgba(29,158,117,0.07)', borderRadius: 8,
    padding: '8px 12px', marginBottom: 16, lineHeight: 1.6,
  },
  fieldBlock: {
    background: 'rgba(0,0,0,0.025)', borderRadius: 10,
    padding: '12px 14px', marginBottom: 10,
    border: '0.5px solid rgba(0,0,0,0.06)',
  },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #111)' },
  subLabel: { fontSize: 11, color: 'var(--color-text-secondary, #888)', marginBottom: 4 },
  origVal: { fontSize: 11, color: 'var(--color-text-secondary, #aaa)' },
  input: {
    width: '100%', padding: '8px 10px', fontSize: 14,
    border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
    background: 'var(--color-background-primary, #fff)',
    color: 'var(--color-text-primary, #111)',
    fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  },
  unitLabel: { fontSize: 13, color: 'var(--color-text-secondary, #888)', whiteSpace: 'nowrap' },
  quotaHint: { fontSize: 11, color: 'var(--color-text-secondary, #aaa)', whiteSpace: 'nowrap' },
  dateHint: {
    marginTop: 10, fontSize: 12, color: '#1D9E75',
    background: 'rgba(29,158,117,0.08)', borderRadius: 6, padding: '6px 10px',
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16,
    paddingTop: 14, borderTop: '0.5px solid rgba(0,0,0,0.08)',
  },
  btn: {
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: 'none', fontFamily: 'inherit',
  },
  btnPrimary: { background: '#1D9E75', color: '#fff' },
  btnSecondary: { background: 'rgba(0,0,0,0.06)', color: 'var(--color-text-primary, #333)' },
  btnWarning: { background: '#EF9F27', color: '#fff' },
  alertError: {
    margin: '8px 20px 0', padding: '8px 12px', fontSize: 12,
    background: '#FCEBEB', color: '#A32D2D', borderRadius: 8,
    border: '0.5px solid #F09595',
  },
  alertSuccess: {
    margin: '8px 20px 0', padding: '8px 12px', fontSize: 12,
    background: '#E1F5EE', color: '#0F6E56', borderRadius: 8,
    border: '0.5px solid #5DCAA5',
  },
  histList: { display: 'flex', flexDirection: 'column', gap: 0 },
  histRow: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
  },
  histDot: {
    width: 8, height: 8, borderRadius: '50%',
    marginTop: 4, flexShrink: 0,
  },
  histLabel: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #111)' },
  histDetail: { fontSize: 11, color: 'var(--color-text-secondary, #888)', marginTop: 2, lineHeight: 1.5 },
  histTime: { fontSize: 11, color: 'var(--color-text-secondary, #aaa)', whiteSpace: 'nowrap', flexShrink: 0 },
  loadingMsg: { fontSize: 13, color: 'var(--color-text-secondary, #888)', padding: '16px 0', textAlign: 'center' },
  emptyMsg: { fontSize: 13, color: 'var(--color-text-secondary, #888)', padding: '24px 0', textAlign: 'center' },
  confirmBg: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  confirmBox: {
    background: 'var(--color-background-primary, #fff)',
    borderRadius: 14, padding: '24px', width: 'min(380px, 90vw)',
    border: '0.5px solid rgba(0,0,0,0.12)',
  },
  confirmIcon: { fontSize: 22, marginBottom: 8 },
  confirmMsg: { fontSize: 13, color: 'var(--color-text-primary, #333)', lineHeight: 1.6 },
};
