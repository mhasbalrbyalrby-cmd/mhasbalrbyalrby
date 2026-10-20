import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import type { Shift, ShiftStatus } from '../types/database';
import Modal from '../components/Modal';
import {
  Clock, Plus, Loader2, AlertCircle, Play, Square, XCircle,
} from 'lucide-react';

const SHIFT_WRITES_ENABLED = false; // Keep writes disabled until isolated database tests pass.

export default function ShiftsPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingAmount, setClosingAmount] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data } = await supabase.from('shifts').select('*').eq('tenant_id', tid).order('created_at', { ascending: false });
    setShifts((data as Shift[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setOpeningAmount(0);
    setError('');
    setModalOpen(true);
  }

  async function handleOpen() {
    if (!SHIFT_WRITES_ENABLED) { setError(lang === 'ar' ? 'فتح الورديات معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Opening shifts is temporarily disabled until isolated database tests pass.'); return; }
    if (!profile?.tenant_id || !profile.id) return;
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('shifts').insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        start_time: new Date().toISOString(),
        opening_amount: Number(openingAmount) || 0,
        status: 'open',
      });
      if (e) throw e;
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally { setSaving(false); }
  }

  function openClose(shift: Shift) {
    setClosingShift(shift);
    setClosingAmount(0);
    setCloseNotes('');
    setError('');
  }

  async function handleClose() {
    if (!SHIFT_WRITES_ENABLED) { setError(lang === 'ar' ? 'إغلاق الورديات معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Closing shifts is temporarily disabled until isolated database tests pass.'); return; }
    if (!closingShift || !profile) return;
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('shifts').update({
        end_time: new Date().toISOString(),
        closing_amount: Number(closingAmount) || 0,
        status: 'closed',
        notes: closeNotes.trim() || null,
        closed_by: profile.id,
      }).eq('id', closingShift.id);
      if (e) throw e;
      setClosingShift(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally { setSaving(false); }
  }

  async function cancelShift(shift: Shift) {
    if (!SHIFT_WRITES_ENABLED) { setError(lang === 'ar' ? 'إلغاء الورديات معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Cancelling shifts is temporarily disabled until isolated database tests pass.'); return; }
    if (!confirm(lang === 'ar' ? 'إلغاء الوردية؟' : 'Cancel shift?')) return;
    const { error } = await supabase.from('shifts').update({ status: 'cancelled', end_time: new Date().toISOString() }).eq('id', shift.id);
    if (!error) loadData();
  }

  const statusColors: Record<ShiftStatus, string> = {
    open: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    closed: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
    cancelled: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  const hasOpenShift = shifts.some((s) => s.status === 'open');

  return (
    <div className="space-y-6">
      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{lang === 'ar' ? 'وضع القراءة فقط: تم تعطيل فتح الورديات وإغلاقها وإلغائها مؤقتاً حتى نجاح اختبارات قاعدة تطوير معزولة.' : 'Read-only mode: opening, closing, and cancelling shifts are disabled until isolated database tests pass.'}</div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><Clock className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.shifts')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إدارة ورديات العمل' : 'Work shift management'}</p>
          </div>
        </div>
        <button onClick={openCreate} disabled={hasOpenShift || !SHIFT_WRITES_ENABLED} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'فتح وردية' : 'Open Shift'}
        </button>
      </div>

      {hasOpenShift && (
        <div className="card border-success-300 bg-success-50 dark:bg-success-900/20">
          <div className="flex items-center gap-2 text-success-700 dark:text-success-400">
            <Play className="w-5 h-5" />
            <span className="font-medium">{lang === 'ar' ? 'يوجد وردية مفتوحة حاليًا' : 'There is an open shift currently'}</span>
          </div>
        </div>
      )}

      {shifts.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{t('common.no_data')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((shift) => (
            <div key={shift.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[shift.status]}`}>{shift.status}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{new Date(shift.start_time).toLocaleString(lang === 'ar' ? 'ar' : 'en')}</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'افتتاح' : 'Opening'}</span>
                  <span className="font-medium text-[var(--color-text)]">{shift.opening_amount.toFixed(2)}</span>
                </div>
                {shift.closing_amount !== null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'إغلاق' : 'Closing'}</span>
                    <span className="font-medium text-[var(--color-text)]">{shift.closing_amount.toFixed(2)}</span>
                  </div>
                )}
                {shift.end_time && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'نهاية' : 'End'}</span>
                    <span className="text-[var(--color-text-muted)]">{new Date(shift.end_time).toLocaleString(lang === 'ar' ? 'ar' : 'en')}</span>
                  </div>
                )}
                {shift.notes && <div className="text-xs text-[var(--color-text-muted)] pt-1">{shift.notes}</div>}
              </div>
              {shift.status === 'open' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                  <button onClick={() => openClose(shift)} disabled={!SHIFT_WRITES_ENABLED} className="btn-secondary text-sm flex items-center gap-1 text-success-600">
                    <Square className="w-3.5 h-3.5" />{lang === 'ar' ? 'إغلاق' : 'Close'}
                  </button>
                  <button onClick={() => cancelShift(shift)} disabled={!SHIFT_WRITES_ENABLED} className="btn-secondary text-sm flex items-center gap-1 text-error-500">
                    <XCircle className="w-3.5 h-3.5" />{t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'فتح وردية' : 'Open Shift'}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'مبلغ الافتتاح' : 'Opening Amount'}</label>
            <input type="number" step="0.01" value={openingAmount || ''} onChange={(e) => setOpeningAmount(Number(e.target.value))} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleOpen} disabled={saving || !SHIFT_WRITES_ENABLED} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{lang === 'ar' ? 'فتح' : 'Open'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!closingShift} onClose={() => setClosingShift(null)} title={lang === 'ar' ? 'إغلاق الوردية' : 'Close Shift'}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'مبلغ الإغلاق' : 'Closing Amount'}</label>
            <input type="number" step="0.01" value={closingAmount || ''} onChange={(e) => setClosingAmount(Number(e.target.value))} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.notes')}</label>
            <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className="input-field min-h-16" rows={2} />
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setClosingShift(null)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleClose} disabled={saving || !SHIFT_WRITES_ENABLED} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{lang === 'ar' ? 'إغلاق' : 'Close'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
