// components/EditRoomModal.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n ?? 0);

const pct = (used, quota) => (quota > 0 ? Math.min(Math.round((used / quota) * 100), 100) : 0);
const barColor = (p) => p >= 100 ? '#E24B4A' : p >= 80 ? '#EF9F27' : '#1D9E75';

function UsageBar({ used, quota, color }) {
  const p = pct(used ?? 0, quota ?? 0);
  const c = color ?? barColor(p);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#aaa', minWidth: 30, textAlign: 'right' }}>{p}%</span>
    </div>
  );
}

function HistoryRow({ entry }) {
  const labels = { correction: 'Usage correction', quota: 'Quota change', date: 'Date update', payment: 'Bill paid', checkin: 'Check-in', checkout: 'Check-out', reset: 'Anniversary reset', usage_add: 'Usage added' };
  const colors = { correction: '#378ADD', quota: '#1D9E75', date: '#EF9F27', payment: '#E24B4A', checkin: '#1D9E75', checkout: '#888', reset: '#534AB7', usage_add: '#378ADD' };
  return (
    <div style={ST.histRow}>
      <div style={{ ...ST.histDot, background: colors[entry.type] ?? '#888' }} />
      <div style={{ flex: 1 }}>
        <div style={ST.histLabel}>{labels[entry.type] ?? entry.type}</div>
        <div style={ST.histDetail}>{entry.detail}</div>
      </div>
      <div style={ST.histTime}>
        {new Date(entry.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

function ConfirmOverlay({ message, onConfirm, onCancel }) {
  return (
    <div style={ST.confirmBg}>
      <div style={ST.confirmBox}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>⚠</div>
        <div style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={{ ...ST.btn, ...ST.btnSecondary }} onClick={onCancel}>Cancel</button>
          <button style={{ ...ST.btn, ...ST.btnPrimary }} onClick={onConfirm}>Confirm save</button>
        </div>
      </div>
    </div>
  );
}

export default function EditRoomModal({ room, onClose, onSaved }) {
  const [tab, setTab]                 = useState('usage');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [history, setHistory]         = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Editable draft state — uses view column names (what the frontend receives)
  const [usage, setUsage] = useState({
    used_electricity: room.used_electricity ?? 0,
    used_laundry:     room.used_laundry     ?? 0,
    used_gallons:     room.used_gallons      ?? 0,
  });
  const [quota, setQuota] = useState({
    base_electricity:  room.base_electricity  ?? 0,
    base_laundry:      room.base_laundry      ?? 0,
    base_gallons:      room.base_gallons       ?? 0,
    price_electricity: room.price_electricity ?? 0,
    price_laundry:     room.price_laundry     ?? 0,
    price_gallons:     room.price_gallons      ?? 0,
  });
  const [checkinDate, setCheckinDate] = useState(room.check_in_date ?? '');

  // Live preview
  const remE = Math.max((quota.base_electricity ?? 0) - (usage.used_electricity ?? 0), 0);
  const remL = Math.max((quota.base_laundry     ?? 0) - (usage.used_laundry     ?? 0), 0);
  const remW = Math.max((quota.base_gallons      ?? 0) - (usage.used_gallons     ?? 0), 0);
  const liveOverage =
    Math.max((usage.used_electricity??0) - (quota.base_electricity??0), 0) * (quota.price_electricity??0) +
    Math.max((usage.used_laundry??0)     - (quota.base_laundry??0),     0) * (quota.price_laundry??0)     +
    Math.max((usage.used_gallons??0)     - (quota.base_gallons??0),     0) * (quota.price_gallons??0);

  // Load history
  const loadHistory = useCallback(async () => {
    if (!room.room_id) return;
    setHistLoading(true);
    const { data } = await supabase
      .from('change_log')
      .select('*')
      .eq('room_id', room.room_id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (data) setHistory(data);
    setHistLoading(false);
  }, [room.room_id]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  const flashSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };
  const withConfirm  = (msg, fn) => { setPendingAction(() => fn); setShowConfirm(msg); };

  // ── Save Usage (calls update_usage RPC — writes directly to rooms table)
  const saveUsage = async () => {
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('update_usage', {
        p_room_id:     room.room_id,
        p_electricity: Number(usage.used_electricity),
        p_laundry:     Number(usage.used_laundry),
        p_water:       Number(usage.used_gallons),
      });
      if (e) throw e;
      flashSuccess('Usage values corrected successfully.');
      onSaved?.();
    } catch (e) { setError(e.message ?? 'Failed to save'); }
    setSaving(false);
  };

  // ── Save Quota (calls update_quota RPC — writes directly to rooms table)
  const saveQuota = async () => {
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('update_quota', {
        p_room_id:       room.room_id,
        p_electricity:   Number(quota.base_electricity),
        p_laundry:       Number(quota.base_laundry),
        p_water:         Number(quota.base_gallons),
        p_price_elec:    Number(quota.price_electricity),
        p_price_laundry: Number(quota.price_laundry),
        p_price_water:   Number(quota.price_gallons),
      });
      if (e) throw e;
      flashSuccess('Quota settings saved — remaining balances recalculated.');
      onSaved?.();
    } catch (e) { setError(e.message ?? 'Failed to save'); }
    setSaving(false);
  };

  // ── Save Date (writes directly to rooms table)
  const saveDate = async () => {
    if (!checkinDate) { setError('Please select a valid date.'); return; }
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase
        .from('rooms')
        .update({ check_in_date: checkinDate })
        .eq('id', room.room_id);
      if (e) throw e;

      // Log it
      await supabase.from('change_log').insert({
        room_id: room.room_id,
        type: 'date',
        detail: `Check-in date changed from ${room.check_in_date ?? 'none'} → ${checkinDate}`,
      });

      flashSuccess(`Anniversary date updated to ${checkinDate}.`);
      onSaved?.();
    } catch (e) { setError(e.message ?? 'Failed to save'); }
    setSaving(false);
  };

  // ── Mark Bill Paid
  const markPaid = async () => {
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('mark_bill_paid', { p_room_id: room.room_id });
      if (e) throw e;
      flashSuccess('Bill marked as paid.');
      onSaved?.();
    } catch (e) { setError(e.message ?? 'Failed to mark paid'); }
    setSaving(false);
  };

  const tabs = [
    { id: 'usage',   label: 'Usage'   },
    { id: 'quota',   label: 'Quota'   },
    { id: 'date',    label: 'Date'    },
    { id: 'history', label: 'History' },
  ];

  return (
    <>
      <div style={ST.backdrop} onClick={onClose} />
      <div style={ST.modal}>
        {/* Header */}
        <div style={ST.header}>
          <div>
            <div style={ST.headerRoom}>Room {room.room_number}</div>
            <div style={ST.headerGuest}>{room.guest_name}</div>
          </div>
          <button style={ST.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Live preview strip */}
        <div style={ST.previewStrip}>
          {[
            { label: 'Remaining electricity', val: `${remE.toFixed(1)} kWh`, color: barColor(pct(usage.used_electricity, quota.base_electricity)) },
            { label: 'Remaining laundry',     val: `${remL.toFixed(1)} kg`,  color: barColor(pct(usage.used_laundry,     quota.base_laundry))     },
            { label: 'Remaining water',       val: `${remW.toFixed(1)} gal`, color: barColor(pct(usage.used_gallons,     quota.base_gallons))      },
            { label: 'Live overage bill',     val: fmt(liveOverage),         color: liveOverage > 0 ? '#A32D2D' : '#1D9E75' },
          ].map(({ label, val, color }) => (
            <div key={label} style={ST.previewItem}>
              <div style={ST.previewLabel}>{label}</div>
              <div style={{ ...ST.previewVal, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={ST.tabBar}>
          {tabs.map(t => (
            <button key={t.id}
              style={{ ...ST.tabBtn, ...(tab === t.id ? ST.tabBtnActive : {}) }}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {error   && <div style={ST.alertError}>{error}</div>}
        {success && <div style={ST.alertSuccess}>{success}</div>}

        <div style={ST.body}>

          {/* ── USAGE TAB ── */}
          {tab === 'usage' && (
            <div>
              <div style={ST.tabHint}>Override usage values to correct input errors. The original values are shown for reference.</div>
              {[
                { key: 'used_electricity', label: 'Electricity used', unit: 'kWh', quota: quota.base_electricity, orig: room.used_electricity ?? 0, color: '#1D9E75' },
                { key: 'used_laundry',     label: 'Laundry used',     unit: 'kg',  quota: quota.base_laundry,     orig: room.used_laundry     ?? 0, color: '#378ADD' },
                { key: 'used_gallons',     label: 'Water used',       unit: 'gal', quota: quota.base_gallons,     orig: room.used_gallons     ?? 0, color: '#EF9F27' },
              ].map(({ key, label, unit, quota: q, orig, color }) => (
                <div key={key} style={ST.fieldBlock}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={ST.fieldLabel}>{label}</span>
                    <span style={ST.origVal}>was {orig} {unit}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" min="0" step="0.1" style={{ ...ST.input, maxWidth: 120 }}
                      value={usage[key]}
                      onChange={e => setUsage(u => ({ ...u, [key]: e.target.value }))} />
                    <span style={ST.unitLabel}>{unit}</span>
                    <span style={ST.quotaHint}>/ {q} {unit} quota</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <UsageBar used={Number(usage[key])} quota={q} color={color} />
                  </div>
                </div>
              ))}

              {/* Unpaid bill + Mark Paid */}
              {(room.unpaid_extra_bill ?? 0) > 0 && (
                <div style={{ ...ST.fieldBlock, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={ST.fieldLabel}>Unpaid extra bill</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#A32D2D', marginTop: 4 }}>{fmt(room.unpaid_extra_bill)}</div>
                  </div>
                  <button style={{ ...ST.btn, background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #F09595' }}
                    onClick={() => withConfirm(`Mark the bill of ${fmt(room.unpaid_extra_bill)} for Room ${room.room_number} as paid?`, markPaid)}>
                    Mark paid
                  </button>
                </div>
              )}

              <div style={ST.footer}>
                <button style={{ ...ST.btn, ...ST.btnSecondary }} onClick={onClose}>Cancel</button>
                <button style={{ ...ST.btn, ...ST.btnPrimary }} disabled={saving}
                  onClick={() => withConfirm(`Save corrected usage for Room ${room.room_number}? This will be logged in history.`, saveUsage)}>
                  {saving ? 'Saving…' : 'Save corrections'}
                </button>
              </div>
            </div>
          )}

          {/* ── QUOTA TAB ── */}
          {tab === 'quota' && (
            <div>
              <div style={ST.tabHint}>Change negotiated monthly quotas and overage pricing. Remaining balance updates instantly in the preview above.</div>
              {[
                { bk: 'base_electricity', pk: 'price_electricity', label: 'Electricity', bu: 'kWh/mo', pu: 'IDR/kWh' },
                { bk: 'base_laundry',     pk: 'price_laundry',     label: 'Laundry',     bu: 'kg/mo',  pu: 'IDR/kg'  },
                { bk: 'base_gallons',     pk: 'price_gallons',     label: 'Water',       bu: 'gal/mo', pu: 'IDR/gal' },
              ].map(({ bk, pk, label, bu, pu }) => (
                <div key={bk} style={ST.fieldBlock}>
                  <div style={{ ...ST.fieldLabel, marginBottom: 8 }}>{label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={ST.subLabel}>Monthly quota ({bu})</div>
                      <input type="number" min="0" step="1" style={ST.input}
                        value={quota[bk]}
                        onChange={e => setQuota(q => ({ ...q, [bk]: e.target.value }))} />
                    </div>
                    <div>
                      <div style={ST.subLabel}>Overage price ({pu})</div>
                      <input type="number" min="0" step="100" style={ST.input}
                        value={quota[pk]}
                        onChange={e => setQuota(q => ({ ...q, [pk]: e.target.value }))} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={ST.footer}>
                <button style={{ ...ST.btn, ...ST.btnSecondary }} onClick={onClose}>Cancel</button>
                <button style={{ ...ST.btn, ...ST.btnPrimary }} disabled={saving}
                  onClick={() => withConfirm(`Update quota settings for Room ${room.room_number}? New remaining balances take effect immediately.`, saveQuota)}>
                  {saving ? 'Saving…' : 'Save quota'}
                </button>
              </div>
            </div>
          )}

          {/* ── DATE TAB ── */}
          {tab === 'date' && (
            <div>
              <div style={ST.tabHint}>Correct the check-in date. The day of the month determines when monthly quotas reset. Changing this affects all future resets.</div>
              <div style={ST.fieldBlock}>
                <label style={ST.fieldLabel}>Check-in / Anniversary date</label>
                <input type="date" style={{ ...ST.input, marginTop: 8 }}
                  value={checkinDate} onChange={e => setCheckinDate(e.target.value)} />
                {checkinDate && (
                  <div style={ST.dateHint}>
                    Monthly reset will occur on day <strong>{new Date(checkinDate).getDate()}</strong> of every month.
                  </div>
                )}
              </div>
              <div style={ST.footer}>
                <button style={{ ...ST.btn, ...ST.btnSecondary }} onClick={onClose}>Cancel</button>
                <button style={{ ...ST.btn, ...ST.btnWarning }} disabled={saving}
                  onClick={() => withConfirm(`Change anniversary date to ${checkinDate} for Room ${room.room_number}? Future resets will use this date.`, saveDate)}>
                  {saving ? 'Saving…' : 'Update date'}
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === 'history' && (
            <div>
              <div style={ST.tabHint}>All manual changes and resets for this room, newest first.</div>
              {histLoading && <div style={ST.loadingMsg}>Loading history…</div>}
              {!histLoading && history.length === 0 && <div style={ST.emptyMsg}>No change history yet for this room.</div>}
              <div>
                {history.map((h, i) => <HistoryRow key={h.id ?? i} entry={h} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmOverlay
          message={showConfirm}
          onCancel={() => { setShowConfirm(false); setPendingAction(null); }}
          onConfirm={() => { setShowConfirm(false); if (pendingAction) pendingAction(); setPendingAction(null); }}
        />
      )}
    </>
  );
}

const ST = {
  backdrop:{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:200 },
  modal:{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(580px,95vw)',maxHeight:'90vh',overflowY:'auto',background:'#fff',border:'0.5px solid rgba(0,0,0,0.12)',borderRadius:16,zIndex:201,display:'flex',flexDirection:'column' },
  header:{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'20px 20px 0' },
  headerRoom:{ fontSize:17,fontWeight:600,color:'#111' },
  headerGuest:{ fontSize:13,color:'#666',marginTop:2 },
  closeBtn:{ background:'none',border:'none',fontSize:16,cursor:'pointer',color:'#888',lineHeight:1,padding:4 },
  previewStrip:{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'rgba(0,0,0,0.06)',margin:'14px 20px 0',borderRadius:10,overflow:'hidden' },
  previewItem:{ background:'#fff',padding:'10px 12px' },
  previewLabel:{ fontSize:10,color:'#888',marginBottom:3,lineHeight:1.3 },
  previewVal:{ fontSize:13,fontWeight:600 },
  tabBar:{ display:'flex',margin:'14px 20px 0',borderBottom:'1px solid rgba(0,0,0,0.08)' },
  tabBtn:{ padding:'8px 16px',fontSize:13,border:'none',background:'none',cursor:'pointer',color:'#666',borderBottom:'2px solid transparent',marginBottom:-1,fontFamily:'inherit' },
  tabBtnActive:{ color:'#1D9E75',borderBottomColor:'#1D9E75',fontWeight:600 },
  body:{ padding:'16px 20px 20px' },
  tabHint:{ fontSize:12,color:'#888',background:'rgba(29,158,117,0.07)',borderRadius:8,padding:'8px 12px',marginBottom:16,lineHeight:1.6 },
  fieldBlock:{ background:'rgba(0,0,0,0.025)',borderRadius:10,padding:'12px 14px',marginBottom:10,border:'0.5px solid rgba(0,0,0,0.06)' },
  fieldLabel:{ fontSize:13,fontWeight:600,color:'#111' },
  subLabel:{ fontSize:11,color:'#888',marginBottom:4 },
  origVal:{ fontSize:11,color:'#aaa' },
  input:{ width:'100%',padding:'8px 10px',fontSize:14,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:8,background:'#fff',color:'#111',fontFamily:'inherit',outline:'none',boxSizing:'border-box' },
  unitLabel:{ fontSize:13,color:'#888',whiteSpace:'nowrap' },
  quotaHint:{ fontSize:11,color:'#aaa',whiteSpace:'nowrap' },
  dateHint:{ marginTop:10,fontSize:12,color:'#1D9E75',background:'rgba(29,158,117,0.08)',borderRadius:6,padding:'6px 10px' },
  footer:{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:16,paddingTop:14,borderTop:'0.5px solid rgba(0,0,0,0.08)' },
  btn:{ padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:'inherit' },
  btnPrimary:{ background:'#1D9E75',color:'#fff' },
  btnSecondary:{ background:'rgba(0,0,0,0.06)',color:'#333' },
  btnWarning:{ background:'#EF9F27',color:'#fff' },
  alertError:{ margin:'8px 20px 0',padding:'8px 12px',fontSize:12,background:'#FCEBEB',color:'#A32D2D',borderRadius:8,border:'0.5px solid #F09595' },
  alertSuccess:{ margin:'8px 20px 0',padding:'8px 12px',fontSize:12,background:'#E1F5EE',color:'#0F6E56',borderRadius:8,border:'0.5px solid #5DCAA5' },
  histRow:{ display:'flex',gap:12,alignItems:'flex-start',padding:'10px 0',borderBottom:'0.5px solid rgba(0,0,0,0.06)' },
  histDot:{ width:8,height:8,borderRadius:'50%',marginTop:4,flexShrink:0 },
  histLabel:{ fontSize:12,fontWeight:600,color:'#111' },
  histDetail:{ fontSize:11,color:'#888',marginTop:2,lineHeight:1.5 },
  histTime:{ fontSize:11,color:'#aaa',whiteSpace:'nowrap',flexShrink:0 },
  loadingMsg:{ fontSize:13,color:'#888',padding:'16px 0',textAlign:'center' },
  emptyMsg:{ fontSize:13,color:'#888',padding:'24px 0',textAlign:'center' },
  confirmBg:{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center' },
  confirmBox:{ background:'#fff',borderRadius:14,padding:'24px',width:'min(380px,90vw)',border:'0.5px solid rgba(0,0,0,0.12)' },
};
