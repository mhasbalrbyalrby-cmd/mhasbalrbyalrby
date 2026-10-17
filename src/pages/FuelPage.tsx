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
  plate_number: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  vehicle_type: string;
  fuel_type: string;
  current_odometer: number;
  status: string;
  is_active: boolean;
  created_at: string;
}

interface FuelTransaction {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  transaction_date: string;
  odometer: number;
  fuel_type: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  station_name: string | null;
  notes: string | null;
  posted_to_journal: boolean;
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

  const [vForm, setVForm] = useState({ plate_number: '', make: '', model: '', model_year: 0, fuel_type: 'diesel', current_odometer: 0 });
  const [fForm, setFForm] = useState({ vehicle_id: '', date: new Date().toISOString().slice(0, 10), liters: 0, price_per_liter: 0, odometer: 0, station: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    try {
      const [{ data: v, error: vehiclesError }, { data: f, error: fuelError }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
        supabase.from('fuel_transactions').select('*').eq('tenant_id', tid).order('transaction_date', { ascending: false }).limit(200),
      ]);
      if (vehiclesError) throw vehiclesError;
      if (fuelError) throw fuelError;
      setVehicles((v as Vehicle[]) ?? []);
      setTransactions((f as FuelTransaction[]) ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر تحميل بيانات الأسطول' : 'Unable to load fleet data'));
    } finally {
      setLoading(false);
    }
  }

  const ar = lang === 'ar';
  const fuelTotal = fForm.liters * fForm.price_per_liter;

  async function saveVehicle() {
    if (!profile?.tenant_id) return;
    if (!vForm.plate_number.trim()) { setError(ar ? 'رقم اللوحة مطلوب' : 'Plate number is required'); return; }
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('vehicles').insert({
        tenant_id: profile.tenant_id,
        plate_number: vForm.plate_number.trim(),
        make: vForm.make.trim() || null,
        model: vForm.model.trim() || null,
        model_year: Number(vForm.model_year) || null,
        vehicle_type: 'car',
        fuel_type: vForm.fuel_type,
        current_odometer: Math.max(0, Number(vForm.current_odometer) || 0),
        status: 'active',
        is_active: true,
        created_by: profile.id,
      });
      if (e) throw e;
      setVehicleModal(false);
      loadData();
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error')); }
    finally { setSaving(false); }
  }

  async function saveFuel() {
    if (!profile?.tenant_id) return;
    if (!fForm.vehicle_id) { setError(ar ? 'اختر المركبة أولًا' : 'Select a vehicle first'); return; }
    if (fForm.liters <= 0) { setError(ar ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be greater than zero'); return; }
    if (fForm.price_per_liter < 0 || fForm.odometer < 0) { setError(ar ? 'تحقق من السعر وقراءة العداد' : 'Check price and odometer values'); return; }
    const selectedVehicle = vehicles.find((v) => v.id === fForm.vehicle_id);
    if (!selectedVehicle) { setError(ar ? 'المركبة المحددة غير موجودة' : 'Selected vehicle was not found'); return; }
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('fuel_transactions').insert({
        tenant_id: profile.tenant_id,
        vehicle_id: selectedVehicle.id,
        transaction_date: new Date(`${fForm.date}T12:00:00`).toISOString(),
        odometer: Number(fForm.odometer),
        fuel_type: selectedVehicle.fuel_type,
        quantity: Number(fForm.liters),
        unit_price: Number(fForm.price_per_liter),
        total_amount: fuelTotal,
        currency: 'YER',
        station_name: fForm.station.trim() || null,
        notes: fForm.notes.trim() || null,
        created_by: profile.id,
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
      return [f.transaction_date, v?.plate_number ?? '—', f.quantity, f.unit_price, f.total_amount, f.odometer, f.station_name ?? '—'];
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
          <button onClick={() => { setVForm({ plate_number: '', make: '', model: '', model_year: 0, fuel_type: 'diesel', current_odometer: 0 }); setError(''); setVehicleModal(true); }} className="btn-secondary flex items-center gap-2"><Car className="w-4 h-4" />{ar ? 'مركبة' : 'Vehicle'}</button>
          <button onClick={() => { setFForm({ vehicle_id: '', date: new Date().toISOString().slice(0, 10), liters: 0, price_per_liter: 0, odometer: 0, station: '', notes: '' }); setError(''); setFuelModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{ar ? 'تعبئة' : 'Refuel'}</button>
        </div>
      </div>

      <div className="rounded-lg border border-warning-300 bg-warning-50 dark:bg-warning-900/20 px-4 py-3 text-sm text-warning-800 dark:text-warning-200">
        {ar
          ? 'تنبيه: تُحفظ معاملات الوقود كسجلات تشغيلية فقط حاليًا؛ لم يُستكمل ترحيلها إلى القيود المحاسبية بعد. لا تعتمد عليها في التقارير المالية حتى اكتمال الربط.'
          : 'Notice: fuel entries are currently stored as operational records only; journal posting is not implemented yet. Do not rely on them in financial reports until accounting integration is completed.'}
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
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{formatDualDate(f.transaction_date, lang)}</td>
                      <td className="py-2 px-3 text-[var(--color-text)]">{v?.plate_number ?? '—'}</td>
                      <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{f.quantity.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{f.unit_price.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end font-bold text-[var(--color-text)]">{f.total_amount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{f.odometer}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{f.station_name ?? '—'}</td>
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
              const totalFuel = transactions.filter((f) => f.vehicle_id === v.id).reduce((s, f) => s + f.total_amount, 0);
              return (
                <div key={v.id} className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <Car className="w-5 h-5 text-primary-500" />
                    <span className="font-bold text-[var(--color-text)]">{v.plate_number ?? '—'}</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'الموديل' : 'Model'}</span><span className="text-[var(--color-text)]">{v.make} {v.model} {v.model_year}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'نوع الوقود' : 'Fuel Type'}</span><span className="text-[var(--color-text)]">{v.fuel_type}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">{ar ? 'قراءة العداد' : 'Odometer'}</span><span className="text-[var(--color-text)]">{Number(v.current_odometer ?? 0).toLocaleString()}</span></div>
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
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'السنة' : 'Year'}</label><input type="number" value={vForm.model_year || ''} onChange={(e) => setVForm({ ...vForm, model_year: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'نوع الوقود' : 'Fuel Type'}</label><select value={vForm.fuel_type} onChange={(e) => setVForm({ ...vForm, fuel_type: e.target.value })} className="input-field"><option value="diesel">{ar ? 'ديزل' : 'Diesel'}</option><option value="petrol">{ar ? 'بنزين' : 'Petrol'}</option><option value="gas">{ar ? 'غاز' : 'Gas'}</option></select></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'قراءة العداد الحالية' : 'Current Odometer'}</label><input type="number" min="0" value={vForm.current_odometer || ''} onChange={(e) => setVForm({ ...vForm, current_odometer: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setVehicleModal(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={saveVehicle} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>

      <Modal open={fuelModal} onClose={() => setFuelModal(false)} title={ar ? 'تعبئة وقود' : 'Fuel Transaction'}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'المركبة' : 'Vehicle'}</label><select required value={fForm.vehicle_id} onChange={(e) => setFForm({ ...fForm, vehicle_id: e.target.value })} className="input-field"><option value="">{ar ? 'اختر' : 'Select'}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number} - {v.make} {v.model}</option>)}</select></div>
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
