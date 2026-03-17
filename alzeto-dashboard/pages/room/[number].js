import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function GuestView() {
  const router = useRouter()
  const { number } = router.query
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!number) return
    const fetchRoomData = async () => {
      const { data: roomData, error } = await supabase
        .from('room_dashboard')
        .select('*')
        .eq('room_number', number)
        .single()

      if (roomData) setData(roomData)
      setLoading(false)
    }
    fetchRoomData()
  }, [number])

  if (loading) return <div className="p-10 text-center">Loading Alzeto Dashboard...</div>
  if (!data || data.status === 'empty') return <div className="p-10 text-center">Room not found or currently vacant.</div>

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-slate-900 p-8 text-white text-center">
          <h1 className="text-2xl font-bold tracking-tight">ALZETO</h1>
          <p className="opacity-70 text-sm uppercase tracking-widest mt-1">Guest Quota</p>
          <div className="mt-4 text-4xl font-light">Room {data.room_number}</div>
          <p className="mt-2 text-slate-400 italic">Welcome, {data.guest_name}</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Progress Section */}
          <QuotaRow label="Electricity" remaining={data.remaining_electricity} base={data.base_electricity} unit="kWh" color="bg-yellow-400" />
          <QuotaRow label="Laundry" remaining={data.remaining_laundry} base={data.base_laundry} unit="kg" color="bg-blue-500" />
          <QuotaRow label="Water Gallon" remaining={data.remaining_gallons} base={data.base_gallons} unit="pcs" color="bg-teal-500" />

          <div className="pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500 uppercase tracking-tighter font-semibold">Extra Charge (Overage)</p>
            <p className="text-3xl font-bold text-red-600 mt-1">Rp {new Intl.NumberFormat('id-ID').format(data.unpaid_extra_bill + data.current_overage_charge)}</p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Next Refresh Date</p>
            <p className="text-lg font-medium text-slate-700">{new Date(data.next_reset_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuotaRow({ label, remaining, base, unit, color }) {
  const percent = Math.max(0, Math.min(100, (remaining / base) * 100))
  return (
    <div>
      <div className="flex justify-between mb-2 text-sm font-semibold text-slate-600 uppercase tracking-tight">
        <span>{label}</span>
        <span>{remaining} / {base} {unit}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all duration-1000 ${color}`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  )
}