import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDualDate } from '@/lib/hijri';
import { exportToCSV } from '@/lib/csv';
import { Fuel, Plus, Loader2, AlertCircle, Download, Car, Zap } from 'lucide-react';
import Modal from '@/components/Modal';

interface Vehicle {
  id: string;
  tenant_id: string;
  plate_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string | null;
  tank_capacity: number | null;
  is_active: boolean;
  created_at: string;
}

interface FuelTransaction {
  id: string;
  tenant_id: string;
  vehicle_id: string | null;
  date: string;
  liters: number;
  price_per_liter: number;
  total_cost: number;
  odometer: number | null;
  station: string | null;
  notes: string | null;
  created_at: string;
}

export default function FuelPage() {
  const { lang } = useI18n();
  const { profile } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'transactions' | 'vehicles'>('transactions');
  const [vehicleModal, setVehicleModal] = useState(false);
  const [fuelModal, setFuelModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vForm, setVForm] = useState({ plate_number: '', make: '', model: '', year: 0, fuel_type: 'diesel', tank_capacity: 0 });
  const [fForm, setFForm] = useState({ vehicle_id: '', date: new Date().toISOString().slice(0, 10), liters: 0, price_per_liter: 0, odometer: 0, station: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: v }, { data: f }] = await Promise.all([
      supabase.from('vehicles').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
      supabase.from('fuel_transactions').select('*').eq('tenant_id', tid).order('date', { ascending: false }).limit(200),
    ]);
    setVehicles((v as Vehicle[]) ?? []);
    setTransactions((f as FuelTransaction[]) ?? []);
    setLoading(false);
  }

  const ar = lang === 'ar';
  const fuelTotal = fForm.liters * fForm.price_per_liter;

  async function saveVehicle() {
    if (!profile?.tenant_id) return;
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('vehicles').insert({
        tenant_id: profile.tenant_id,
        plate_number: vForm.plate_number.trim() || null,
        make: vForm.make.trim() || null,
        model: vForm.model.trim() || null,
        year: Number(vForm.year) || null,
        fuel_type: vForm.fuel_type,
        tank_capacity: Number(vForm.tank_capacity) || null,
        is_active: true,
      });
      if (e) throw e;
      setVehicleModal(false);
      loadData();
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error')); }
    finally { setSaving(false); }
  }

  async function saveFuel() {
    if (!profile?.tenant_id) return;
    if (fForm.liters <= 0) { setError(ar ? 'الكمية يجب أن تكون أكبر من صفر' : 'Liters must be > 0'); return; }
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('fuel_transactions').insert({
        tenant_id: profile.tenant_id,
        vehicle_id: fForm.vehicle_id || null,
        date: fForm.date,
        liters: Number(fForm.liters),
        price_per_liter: Number(fForm.price_per_liter),
        total_cost: fuelTotal,
        odometer: Number(fForm.odometer) || null,
        station: fForm.station.trim() || null,
        notes: fForm.notes.trim() || null,
      });
      if (e) throw e;
      setFuelModal(false);
      loadData();
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error')); }
    finally { setSaving(false); }
  }

  function handleExport() {
    const headers = ar ? ['التاريخ', 'المركبة', 'اللترات', 'السعر/لتر', 'التكلفة', 'العدّاد', 'المحطة'] : ['Date', 'Vehicle', 'Liters', 'Price/L', 'Total', 'Odometer', 'Station'];
    const rows = transactions.map((f) => {
      const v = vehicles.find((v) => v.id === f.vehicle_id);
      return [f.date, v?.plate_number ?? '—', f.liters, f.price_per_liter, f.total_cost, f.odometer ?? '—', f.station ?? '—'];
    });
    exportToCSV(ar ? 'الوقود' : 'fuel', headers, rows);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning-600 flex items-center justify-center"><Fuel className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{ar ? 'الوقود والمركبات' : 'Fuel & Fleet'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'إدارة استهلاك الوقود والمركبات' : 'Fuel consumption and vehicle management'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={transactions.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{ar ? 'تصدير' : 'Export'}</button>
          <button onClick={() => { setVForm({ plate_number: '', make: '', model: '', year: 0, fuel_type: 'diesel', tank_capacity: 0 }); setError(''); setVehicleModal(true); }} className="btn-secondary flex items-center gap-2"><Car className="w-4 h-4" />{ar ? 'مركبة' : 'Vehicle'}</button>
          <button onClick={() => { setFForm({ vehicle_id: '', date: new Date().toISOString().slice(0, 10), liters: 0, price_per_liter: 0, odometer: 0, station: '', notes: '' }); setError(''); setFuelModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{ar ? 'تعبئة' : 'Refuel'}</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button onClick={() => setTab('transactions')} className={`nav-item !rounded-lg ${tab === 'transactions' ? 'nav-item-active' : ''}`}><Zap className="w-4 h-4" />{ar ? 'المعاملات' : 'Transactions'}</button>
        <button onClick={() => setTab('vehicles')} className={`nav-item !rounded-lg ${tab === 'vehicles' ? 'nav-item-active' : ''}`}><Car className="w-4 h-4" />{ar ? 'المركبات' : 'Vehicles'}</button>
      </div>

      {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}

      {tab === 'transactions' ? (
        transactions.length === 0 ? (
          <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا توجد معاملات وقود' : 'No fuel transactions'}</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{ar ? 'التاريخ' : 'Date'}</th>
                <th className="text-start py-2 px-3 font-medium">{ar ? 'المركبة' : 'Vehicle'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'لتر' : 'Liters'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'سعر/لتر' : 'Price/L'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'التكلفة' : 'Total'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'العدّاد' : 'Odometer'}</th>
                <th className="text-start py-2 px-3 font-medium">{ar ? 'المحطة' : 'Station'}</th>
              </tr></thead>
              <tbody>
                {transactions.map((f) => {
                  const v = vehicles.find((v) => v.id === f.vehicle_id);
                  return (
                    <tr key={f.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{formatDualDate(f.date, lang)}</td>
                      <td className="py-2 px-3 text-[var(--color-text)]">{v?.plate_number ?? '—'}</td>
                      <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{f.liters.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{f.price_per_liter.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end font-bold text-[var(--color-text)]">{f.total_cost.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{f.odometer ?? '—'}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{f.station ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        vehicles.length === 0 ? (
          <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا توجد مركبات' : 'No vehicles'}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map((v) => {
              const totalFuel = transactions.filter((f) => f.vehicle_id === v.id).reduce((s, f) => s + f.total_cost, 0);
              return (
                <div key={v.id} className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <Car className="w-5 h-5 text-primary-500" />
                    <span className="font-bold text-[var(--color-text)]">{v.plate_number ?? '—'}</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'الموديل' : 'Model'}</span><span className="text-[var(--color-text)]">{v.make} {v.model} {v.year}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'نوع الوقود' : 'Fuel Type'}</span><span className="text-[var(--color-text)]">{v.fuel_type}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'سعة الخزان' : 'Tank'}</span><span className="text-[var(--color-text)]">{v.tank_capacity ?? '—'}L</span></div>
                    <div className="flex justify-between pt-1 border-t border-[var(--color-border)]"><span className="text-[var(--color-text-muted)]">{ar ? 'إجمالي التكلفة' : 'Total Cost'}</span><span className="font-bold text-warning-600">{totalFuel.toFixed(2)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <Modal open={vehicleModal} onClose={() => setVehicleModal(false)} title={ar ? 'مركبة جديدة' : 'New Vehicle'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'رقم اللوحة' : 'Plate Number'}</label><input type="text" value={vForm.plate_number} onChange={(e) => setVForm({ ...vForm, plate_number: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الماركة' : 'Make'}</label><input type="text" value={vForm.make} onChange={(e) => setVForm({ ...vForm, make: e.target.value })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الموديل' : 'Model'}</label><input type="text" value={vForm.model} onChange={(e) => setVForm({ ...vForm, model: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'السنة' : 'Year'}</label><input type="number" value={vForm.year || ''} onChange={(e) => setVForm({ ...vForm, year: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'نوع الوقود' : 'Fuel Type'}</label><select value={vForm.fuel_type} onChange={(e) => setVForm({ ...vForm, fuel_type: e.target.value })} className="input-field"><option value="diesel">{ar ? 'ديزل' : 'Diesel'}</option><option value="petrol">{ar ? 'بنزين' : 'Petrol'}</option><option value="gas">{ar ? 'غاز' : 'Gas'}</option></select></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'سعة الخزان' : 'Tank Capacity'}</label><input type="number" value={vForm.tank_capacity || ''} onChange={(e) => setVForm({ ...vForm, tank_capacity: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setVehicleModal(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={saveVehicle} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>

      <Modal open={fuelModal} onClose={() => setFuelModal(false)} title={ar ? 'تعبئة وقود' : 'Fuel Transaction'}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'المركبة' : 'Vehicle'}</label><select value={fForm.vehicle_id} onChange={(e) => setFForm({ ...fForm, vehicle_id: e.target.value })} className="input-field"><option value="">{ar ? 'اختر' : 'Select'}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number} - {v.make} {v.model}</option>)}</select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'التاريخ' : 'Date'}</label><input type="date" value={fForm.date} onChange={(e) => setFForm({ ...fForm, date: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'لتر' : 'Liters'}</label><input type="number" step="0.01" value={fForm.liters || ''} onChange={(e) => setFForm({ ...fForm, liters: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'سعر/لتر' : 'Price/L'}</label><input type="number" step="0.01" value={fForm.price_per_liter || ''} onChange={(e) => setFForm({ ...fForm, price_per_liter: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--color-bg)] flex justify-between"><span className="text-sm font-medium text-[var(--color-text-muted)]">{ar ? 'التكلفة الإجمالية' : 'Total Cost'}</span><span className="font-bold text-warning-600">{fuelTotal.toFixed(2)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'العدّاد' : 'Odometer'}</label><input type="number" value={fForm.odometer || ''} onChange={(e) => setFForm({ ...fForm, odometer: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'المحطة' : 'Station'}</label><input type="text" value={fForm.station} onChange={(e) => setFForm({ ...fForm, station: e.target.value })} className="input-field" /></div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setFuelModal(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={saveFuel} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
