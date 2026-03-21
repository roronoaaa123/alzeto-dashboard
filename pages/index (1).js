// pages/index.js
import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import EditRoomModal from '../components/EditRoomModal';

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n ?? 0);

const pct = (used, quota) =>
  quota > 0 ? Math.min(Math.round(((used ?? 0) / quota) * 100), 100) : 0;

const barColor = (p) => {
  if (p >= 100) return '#E24B4A';
  if (p >= 80)  return '#EF9F27';
  return '#1D9E75';
};

const nextResetDate = (checkinDate) => {
  if (!checkinDate) return null;
  const day = new Date(checkinDate).getDate();
  const today = new Date();
  let d = new Date(today.getFullYear(), today.getMonth(), day);
  if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return d;
};

function MiniBar({ used, quota, color }) {
  const p = pct(used, quota);
  const c = color ?? barColor(p);
  return (
    <div style={S.miniBarWrap}>
      <div style={{ ...S.miniBarFill, width: `${p}%`, background: c }} />
    </div>
  );
}

// ─── Check-in Modal ───────────────────────────────────────────────────────────

function CheckinModal({ room, onClose, onSaved }) {
  const [form, setForm] = useState({
    guest_name: '', check_in_date: '',
    electricity_quota: '', laundry_quota: '', water_quota: '',
    electricity_price: '', laundry_price: '', water_price: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError('Guest name is required.'); return; }
    if (!form.check_in_date)     { setError('Check-in date is required.'); return; }
    setSaving(true); setError(null);
    try {
      const { error: e } = await supabase.rpc('checkin_guest', {
        p_room_id:       room.room_id,
        p_guest_name:    form.guest_name.trim(),
        p_check_in_date: form.check_in_date,
        p_elec_quota:    Number(form.electricity_quota)  || 0,
        p_laundry_quota: Number(form.laundry_quota)      || 0,
        p_water_quota:   Number(form.water_quota)        || 0,
        p_elec_price:    Number(form.electricity_price)  || 0,
        p_laundry_price: Number(form.laundry_price)      || 0,
        p_water_price:   Number(form.water_price)        || 0,
      });
      if (e) throw e;
      onSaved?.(); onClose();
    } catch (e) { setError(e.message ?? 'Failed to check in guest'); }
    setSaving(false);
  };

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.smModal}>
        <div style={S.smHeader}>
          <span style={S.smTitle}>Check in — Room {room.room_number}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 0 16px' }}>
          <div style={S.ciSection}>Guest information</div>
          <div style={S.ciRow}>
            <div style={S.ciField}>
              <div style={S.ciLabel}>Guest name *</div>
              <input style={S.ciInput} placeholder="e.g. Sari Dewi"
                value={form.guest_name} onChange={e => set('guest_name', e.target.value)} />
            </div>
            <div style={S.ciField}>
              <div style={S.ciLabel}>Check-in date *</div>
              <input style={S.ciInput} type="date"
                value={form.check_in_date} onChange={e => set('check_in_date', e.target.value)} />
            </div>
          </div>
          {form.check_in_date && (
            <div style={S.ciHint}>
              Quota resets every month on day <strong>{new Date(form.check_in_date).getDate()}</strong>
            </div>
          )}
          <div style={{ ...S.ciSection, marginTop: 14 }}>Monthly quotas &amp; overage prices</div>
          {[
            { key: 'electricity', label: 'Electricity', qUnit: 'kWh/mo', pUnit: 'IDR/kWh' },
            { key: 'laundry',     label: 'Laundry',     qUnit: 'kg/mo',  pUnit: 'IDR/kg'  },
            { key: 'water',       label: 'Water',        qUnit: 'gal/mo', pUnit: 'IDR/gal' },
          ].map(({ key, label, qUnit, pUnit }) => (
            <div key={key} style={S.ciRow}>
              <div style={S.ciField}>
                <div style={S.ciLabel}>{label} quota ({qUnit})</div>
                <input style={S.ciInput} type="number" min="0" placeholder="0"
                  value={form[`${key}_quota`]} onChange={e => set(`${key}_quota`, e.target.value)} />
              </div>
              <div style={S.ciField}>
                <div style={S.ciLabel}>Overage price ({pUnit})</div>
                <input style={S.ciInput} type="number" min="0" placeholder="0"
                  value={form[`${key}_price`]} onChange={e => set(`${key}_price`, e.target.value)} />
              </div>
            </div>
          ))}
          {error && <div style={S.errMsg}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={onClose}>Cancel</button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={handleSave} disabled={saving}>
              {saving ? 'Checking in…' : 'Confirm check-in'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Add Usage Modal ──────────────────────────────────────────────────────────

function AddUsageModal({ room, onClose, onSaved }) {
  const [amounts, setAmounts] = useState({ electricity: '', laundry: '', gallon: '' });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const setAmt = (key, val) => setAmounts(a => ({ ...a, [key]: val }));

  const handleSave = async () => {
    const entries = Object.entries(amounts).filter(([, v]) => v !== '' && Number(v) > 0);
    if (!entries.length) { setError('Enter at least one value to add.'); return; }
    setSaving(true); setError(null);
    try {
      for (const [type, val] of entries) {
        const { error: e } = await supabase.rpc('add_usage', {
          p_room_id: room.room_id,
          p_type:    type,
          p_amount:  Number(val),
        });
        if (e) throw e;
      }
      onSaved?.(); onClose();
    } catch (e) { setError(e.message ?? 'Failed to save usage'); }
    setSaving(false);
  };

  const fields = [
    { key: 'electricity', label: 'Electricity', unit: 'kWh', used: room.used_electricity, quota: room.base_electricity, color: '#1D9E75' },
    { key: 'laundry',     label: 'Laundry',     unit: 'kg',  used: room.used_laundry,     quota: room.base_laundry,     color: '#378ADD' },
    { key: 'gallon',      label: 'Water',        unit: 'gal', used: room.used_gallons,     quota: room.base_gallons,     color: '#EF9F27' },
  ];

  return (
    <>
      <div style={S.backdrop} onClick={onClose} />
      <div style={S.smModal}>
        <div style={S.smHeader}>
          <span style={S.smTitle}>Add usage — Room {room.room_number}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '0 0 16px' }}>
          <div style={S.smGuest}>{room.guest_name}</div>
          {fields.map(({ key, label, unit, used, quota, color }) => (
            <div key={key} style={S.addRow}>
              <div style={{ flex: 1 }}>
                <div style={S.addRowLabel}>{label}</div>
                <MiniBar used={used} quota={quota} color={color} />
                <div style={S.addRowMeta}>{used ?? 0} / {quota ?? 0} {unit}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button style={S.quickBtn} onClick={() => setAmt(key, String((Number(amounts[key] || 0) + 1).toFixed(1)))}>+1</button>
                <button style={S.quickBtn} onClick={() => setAmt(key, String((Number(amounts[key] || 0) + 5).toFixed(1)))}>+5</button>
                <input type="number" min="0" step="0.1" placeholder="0"
                  style={S.smInput} value={amounts[key]}
                  onChange={e => setAmt(key, e.target.value)} />
                <span style={S.unitTag}>{unit}</span>
              </div>
            </div>
          ))}
          {error && <div style={S.errMsg}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button style={{ ...S.btn, ...S.btnSecondary }} onClick={onClose}>Cancel</button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save usage'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={S.statCard}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statVal}>{value}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AlzetoDashboard() {
  const [rooms, setRooms]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editRoom, setEditRoom]         = useState(null);
  const [addRoom, setAddRoom]           = useState(null);
  const [checkinRoom, setCheckinRoom]   = useState(null);
  const [toast, setToast]               = useState(null);
  const [sortKey, setSortKey]           = useState('room_number');
  const [sortDir, setSortDir]           = useState('asc');
  const toastTimer = useRef(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('room_dashboard')
      .select('*')
      .order('room_number', { ascending: true });
    if (error) showToast('Failed to load rooms: ' + error.message, 'error');
    else setRooms(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const showToast = (msg, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = rooms
    .filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.room_number?.includes(q) || (r.guest_name ?? '').toLowerCase().includes(q);
      const matchStatus =
        statusFilter === 'all'    ? true :
        statusFilter === 'active' ? r.status === 'active' :
        statusFilter === 'empty'  ? r.status === 'empty' :
        statusFilter === 'bill'   ? (r.unpaid_extra_bill ?? 0) > 0 :
        statusFilter === 'alert'  ? pct(r.used_electricity, r.base_electricity) >= 80 ||
                                    pct(r.used_laundry, r.base_laundry) >= 80 ||
                                    pct(r.used_gallons, r.base_gallons) >= 80
                                  : true;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? '';
      return typeof av === 'number' ? (av - bv) * mul : av.toString().localeCompare(bv.toString()) * mul;
    });

  const activeCount = rooms.filter(r => r.status === 'active').length;
  const emptyCount  = rooms.filter(r => r.status === 'empty').length;
  const billCount   = rooms.filter(r => (r.unpaid_extra_bill ?? 0) > 0).length;
  const totalBill   = rooms.reduce((s, r) => s + (r.unpaid_extra_bill ?? 0), 0);

  const SortIcon = ({ col }) => (
    <span style={{ opacity: sortKey === col ? 1 : 0.3, fontSize: 10, marginLeft: 3 }}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
    </span>
  );

  return (
    <>
      <Head>
        <title>Alzeto Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>
      <div style={S.root}>
        <aside style={S.sidebar}>
          <div style={S.logo}><span style={S.logoAccent}>Al</span>zeto</div>
          <nav style={S.nav}>
            {[['Rooms','⊞',true],['Guest View','⊙',false],['Resets','↺',false],['Settings','⚙',false]].map(([label,icon,active]) => (
              <button key={label} style={{ ...S.navItem, ...(active ? S.navActive : {}) }}>
                <span style={S.navIcon}>{icon}</span><span>{label}</span>
              </button>
            ))}
          </nav>
          <div style={S.sidebarFooter}>
            <div style={S.sidebarBadge}>{activeCount} occupied</div>
            <div style={S.sidebarBadge2}>{emptyCount} available</div>
          </div>
        </aside>

        <main style={S.main}>
          <div style={S.topbar}>
            <div>
              <div style={S.pageTitle}>Room management</div>
              <div style={S.pageSub}>Quota tracking for {rooms.length} rooms</div>
            </div>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={fetchRooms}>↺ Refresh</button>
          </div>

          <div style={S.statsRow}>
            <StatCard label="Occupied"     value={activeCount}   sub={`of ${rooms.length} rooms`} />
            <StatCard label="Available"    value={emptyCount}    sub="rooms empty" />
            <StatCard label="Has bill"     value={billCount}     sub="rooms with overage" />
            <StatCard label="Total unpaid" value={fmt(totalBill)} sub="across all rooms" />
          </div>

          <div style={S.filterRow}>
            <input style={{ ...S.input, maxWidth: 220 }} placeholder="Search room or guest…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select style={{ ...S.input, ...S.select }} value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All rooms</option>
              <option value="active">Active only</option>
              <option value="empty">Empty only</option>
              <option value="bill">Has unpaid bill</option>
              <option value="alert">Usage ≥ 80%</option>
            </select>
            <span style={S.filterCount}>{filtered.length} room{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={S.tableWrap}>
            {loading ? <div style={S.loadingMsg}>Loading rooms…</div> : (
              <table style={S.table}>
                <thead>
                  <tr>
                    {[
                      ['room_number','Room'],['guest_name','Guest'],['check_in_date','Check-in'],
                      ['used_electricity','Electricity'],['used_laundry','Laundry'],['used_gallons','Water'],
                      ['unpaid_extra_bill','Bill'],
                    ].map(([key, label]) => (
                      <th key={key} style={{ ...S.th, ...S.thSortable }} onClick={() => handleSort(key)}>
                        {label}<SortIcon col={key} />
                      </th>
                    ))}
                    <th style={S.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((room, i) => {
                    const isEmpty = room.status === 'empty';
                    const hasBill = (room.unpaid_extra_bill ?? 0) > 0;
                    const pe = pct(room.used_electricity, room.base_electricity);
                    const pl = pct(room.used_laundry,     room.base_laundry);
                    const pw = pct(room.used_gallons,     room.base_gallons);
                    const resetDate = nextResetDate(room.check_in_date);
                    return (
                      <tr key={room.room_id} style={{ ...S.tr, background: i%2!==0?'rgba(0,0,0,0.018)':'transparent', opacity: isEmpty?0.6:1 }}>
                        <td style={S.td}><span style={S.roomNum}>{room.room_number}</span></td>
                        <td style={S.td}>
                          {isEmpty ? <span style={S.emptyLabel}>—</span> : (
                            <div>
                              <div style={S.guestName}>{room.guest_name}</div>
                              <span style={hasBill ? S.badgeBill : S.badgeActive}>{hasBill ? 'has bill' : 'active'}</span>
                            </div>
                          )}
                        </td>
                        <td style={S.td}>
                          {room.check_in_date ? (
                            <div>
                              <div style={S.dateVal}>{room.check_in_date}</div>
                              {resetDate && <div style={S.resetLabel}>reset {resetDate.toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</div>}
                            </div>
                          ) : <span style={S.emptyLabel}>—</span>}
                        </td>
                        <td style={S.td}>
                          {!isEmpty ? <div><div style={S.usageNum}><span style={{color:barColor(pe),fontWeight:600}}>{room.used_electricity??0}</span><span style={S.quotaOf}> / {room.base_electricity??0} kWh</span></div><MiniBar used={room.used_electricity} quota={room.base_electricity}/></div> : <span style={S.emptyLabel}>—</span>}
                        </td>
                        <td style={S.td}>
                          {!isEmpty ? <div><div style={S.usageNum}><span style={{color:barColor(pl),fontWeight:600}}>{room.used_laundry??0}</span><span style={S.quotaOf}> / {room.base_laundry??0} kg</span></div><MiniBar used={room.used_laundry} quota={room.base_laundry} color="#378ADD"/></div> : <span style={S.emptyLabel}>—</span>}
                        </td>
                        <td style={S.td}>
                          {!isEmpty ? <div><div style={S.usageNum}><span style={{color:barColor(pw),fontWeight:600}}>{room.used_gallons??0}</span><span style={S.quotaOf}> / {room.base_gallons??0} gal</span></div><MiniBar used={room.used_gallons} quota={room.base_gallons} color="#EF9F27"/></div> : <span style={S.emptyLabel}>—</span>}
                        </td>
                        <td style={S.td}>
                          {hasBill ? <span style={S.billVal}>{fmt(room.unpaid_extra_bill)}</span> : <span style={S.noBill}>—</span>}
                        </td>
                        <td style={{...S.td,...S.actionsCell}}>
                          {isEmpty ? (
                            <button style={{...S.actionBtn,...S.actionBtnCheckin}} onClick={()=>setCheckinRoom(room)}>Check in</button>
                          ) : (
                            <>
                              <button style={S.actionBtn} onClick={()=>setAddRoom(room)}>+ Usage</button>
                              <button style={{...S.actionBtn,...S.actionBtnEdit}} onClick={()=>setEditRoom(room)}>✎ Edit</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {checkinRoom && <CheckinModal room={checkinRoom} onClose={()=>setCheckinRoom(null)} onSaved={()=>{fetchRooms();showToast(`Guest checked into Room ${checkinRoom.room_number}`);setCheckinRoom(null);}} />}
      {addRoom    && <AddUsageModal room={addRoom}    onClose={()=>setAddRoom(null)}    onSaved={()=>{fetchRooms();showToast(`Usage updated for Room ${addRoom.room_number}`);setAddRoom(null);}} />}
      {editRoom   && <EditRoomModal room={editRoom}   onClose={()=>setEditRoom(null)}   onSaved={()=>{fetchRooms();showToast(`Room ${editRoom.room_number} saved`);}} />}

      {toast && <div style={{...S.toast,...(toast.type==='error'?S.toastError:S.toastSuccess)}}>{toast.msg}</div>}
    </>
  );
}

const S = {
  root:{display:'flex',minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",background:'#F6F5F2',color:'#111'},
  sidebar:{width:200,background:'#111',color:'#fff',display:'flex',flexDirection:'column',padding:'24px 0',position:'sticky',top:0,height:'100vh',flexShrink:0},
  logo:{fontSize:20,fontWeight:600,padding:'0 20px 24px',letterSpacing:'-0.5px'},
  logoAccent:{color:'#1D9E75'},
  nav:{display:'flex',flexDirection:'column',gap:2,flex:1},
  navItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 20px',background:'none',border:'none',color:'rgba(255,255,255,0.55)',fontSize:13,cursor:'pointer',textAlign:'left',fontFamily:"'DM Sans',sans-serif",borderRadius:0},
  navActive:{color:'#fff',background:'rgba(29,158,117,0.18)'},
  navIcon:{fontSize:14,opacity:0.8},
  sidebarFooter:{padding:'16px 20px',borderTop:'1px solid rgba(255,255,255,0.08)'},
  sidebarBadge:{fontSize:11,color:'#1D9E75',marginBottom:4},
  sidebarBadge2:{fontSize:11,color:'rgba(255,255,255,0.4)'},
  main:{flex:1,padding:'28px 32px',overflowX:'auto'},
  topbar:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24},
  pageTitle:{fontSize:22,fontWeight:600,letterSpacing:'-0.5px',marginBottom:2},
  pageSub:{fontSize:13,color:'#888'},
  statsRow:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:22},
  statCard:{background:'#fff',borderRadius:12,padding:'14px 16px',border:'0.5px solid rgba(0,0,0,0.08)'},
  statLabel:{fontSize:11,color:'#888',marginBottom:4,textTransform:'uppercase',letterSpacing:0.5},
  statVal:{fontSize:22,fontWeight:600,letterSpacing:'-0.5px'},
  statSub:{fontSize:11,color:'#aaa',marginTop:2},
  filterRow:{display:'flex',alignItems:'center',gap:10,marginBottom:14},
  filterCount:{fontSize:12,color:'#888',marginLeft:4},
  input:{padding:'7px 12px',fontSize:13,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:8,background:'#fff',color:'#111',fontFamily:"'DM Sans',sans-serif",outline:'none'},
  select:{cursor:'pointer'},
  tableWrap:{background:'#fff',borderRadius:14,border:'0.5px solid rgba(0,0,0,0.08)',overflow:'hidden'},
  table:{width:'100%',borderCollapse:'collapse',fontSize:13},
  th:{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#888',background:'#FAFAFA',borderBottom:'0.5px solid rgba(0,0,0,0.08)',textTransform:'uppercase',letterSpacing:0.5,userSelect:'none',whiteSpace:'nowrap'},
  thSortable:{cursor:'pointer'},
  tr:{transition:'background 0.1s'},
  td:{padding:'10px 14px',borderBottom:'0.5px solid rgba(0,0,0,0.05)',verticalAlign:'middle'},
  actionsCell:{whiteSpace:'nowrap'},
  roomNum:{fontFamily:'monospace',fontSize:13,fontWeight:600},
  guestName:{fontWeight:500,marginBottom:3},
  emptyLabel:{color:'#ccc'},
  dateVal:{fontSize:12},
  resetLabel:{fontSize:11,color:'#aaa',marginTop:1},
  usageNum:{fontSize:12,marginBottom:4},
  quotaOf:{fontWeight:400,color:'#aaa'},
  billVal:{fontWeight:600,color:'#A32D2D',fontSize:12},
  noBill:{color:'#ccc'},
  badgeActive:{display:'inline-block',fontSize:10,padding:'1px 7px',background:'#E1F5EE',color:'#0F6E56',borderRadius:20},
  badgeBill:{display:'inline-block',fontSize:10,padding:'1px 7px',background:'#FCEBEB',color:'#A32D2D',borderRadius:20},
  miniBarWrap:{height:4,background:'rgba(0,0,0,0.07)',borderRadius:2,overflow:'hidden'},
  miniBarFill:{height:'100%',borderRadius:2,transition:'width 0.3s'},
  actionBtn:{padding:'5px 11px',fontSize:12,fontWeight:500,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:7,cursor:'pointer',background:'transparent',color:'#333',fontFamily:"'DM Sans',sans-serif",marginRight:5},
  actionBtnEdit:{background:'rgba(29,158,117,0.08)',borderColor:'#9FE1CB',color:'#0F6E56'},
  actionBtnCheckin:{background:'rgba(55,138,221,0.08)',borderColor:'#B5D4F4',color:'#185FA5'},
  btn:{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:"'DM Sans',sans-serif"},
  btnPrimary:{background:'#1D9E75',color:'#fff'},
  btnSecondary:{background:'rgba(0,0,0,0.06)',color:'#333',border:'0.5px solid rgba(0,0,0,0.12)'},
  backdrop:{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:200},
  smModal:{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(480px,94vw)',background:'#fff',borderRadius:16,padding:'20px 20px 0',zIndex:201,border:'0.5px solid rgba(0,0,0,0.1)',maxHeight:'90vh',overflowY:'auto'},
  smHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4},
  smTitle:{fontSize:15,fontWeight:600},
  smGuest:{fontSize:12,color:'#888',marginBottom:14},
  closeBtn:{background:'none',border:'none',fontSize:16,cursor:'pointer',color:'#888',lineHeight:1},
  addRow:{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'0.5px solid rgba(0,0,0,0.06)'},
  addRowLabel:{fontSize:13,fontWeight:500,marginBottom:4},
  addRowMeta:{fontSize:11,color:'#aaa',marginTop:3},
  quickBtn:{padding:'4px 8px',fontSize:11,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:6,cursor:'pointer',background:'rgba(0,0,0,0.04)',color:'#555',fontFamily:"'DM Sans',sans-serif"},
  smInput:{width:70,padding:'6px 8px',fontSize:13,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:7,background:'#fff',color:'#111',fontFamily:"'DM Sans',sans-serif",outline:'none'},
  unitTag:{fontSize:11,color:'#aaa',minWidth:22},
  errMsg:{marginTop:10,padding:'6px 10px',fontSize:12,background:'#FCEBEB',color:'#A32D2D',borderRadius:7},
  loadingMsg:{padding:'40px',textAlign:'center',color:'#aaa',fontSize:14},
  toast:{position:'fixed',bottom:24,right:24,padding:'10px 18px',borderRadius:10,fontSize:13,zIndex:999,maxWidth:340},
  toastSuccess:{background:'#111',color:'#fff',borderLeft:'3px solid #1D9E75'},
  toastError:{background:'#111',color:'#fff',borderLeft:'3px solid #E24B4A'},
  ciSection:{fontSize:11,fontWeight:600,color:'#888',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8,marginTop:4},
  ciRow:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10},
  ciField:{display:'flex',flexDirection:'column',gap:4},
  ciLabel:{fontSize:11,color:'#888'},
  ciInput:{padding:'7px 10px',fontSize:13,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:7,background:'#fff',color:'#111',fontFamily:"'DM Sans',sans-serif",outline:'none'},
  ciHint:{fontSize:11,color:'#1D9E75',background:'rgba(29,158,117,0.08)',borderRadius:6,padding:'5px 10px',marginBottom:4},
};
