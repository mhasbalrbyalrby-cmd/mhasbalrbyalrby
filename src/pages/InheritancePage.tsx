import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Estate, Heir, PartnerFamily } from '@/types/database';
import { formatDualDate } from '@/lib/hijri';
import { exportToCSV } from '@/lib/csv';
import { ScrollText, Plus, Loader2, AlertCircle, Download, Trash2, Users, UserPlus, Heart, Pencil } from 'lucide-react';
import Modal from '@/components/Modal';

const INHERITANCE_WRITES_ENABLED = false; // Keep writes disabled until isolated database tests pass.

export default function InheritancePage() {
  const { lang } = useI18n();
  const { profile } = useAuth();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [heirs, setHeirs] = useState<Heir[]>([]);
  const [partners, setPartners] = useState<PartnerFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<'estates' | 'family'>('estates');
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEstate, setSelectedEstate] = useState<Estate | null>(null);
  const [saving, setSaving] = useState(false);
  const [heirModalOpen, setHeirModalOpen] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerFamily | null>(null);
  const [partnerSaving, setPartnerSaving] = useState(false);

  const [form, setForm] = useState({ deceased_name: '', date_of_death: '', total_assets: 0, total_liabilities: 0, notes: '' });
  const [heirForm, setHeirForm] = useState({ heir_name: '', relationship: '', share_fraction: '' });
  const [partnerForm, setPartnerForm] = useState({
    person_name: '', person_name_ar: '', relationship: '', gender: '', birth_date: '',
    national_id: '', phone: '', notes: '', is_deceased: false, date_of_death: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: e }, { data: h }, { data: pf }] = await Promise.all([
      supabase.from('estates').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
      supabase.from('heirs').select('*').eq('tenant_id', tid).order('created_at'),
      supabase.from('partners_family').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
    ]);
    setEstates((e as Estate[]) ?? []);
    setHeirs((h as Heir[]) ?? []);
    setPartners((pf as PartnerFamily[]) ?? []);
    setLoading(false);
  }

  const ar = lang === 'ar';
  const netEstate = Number(form.total_assets) - Number(form.total_liabilities);

  async function handleSave() {
    if (!INHERITANCE_WRITES_ENABLED) { setError(ar ? 'الكتابة معطلة مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Writes are temporarily disabled until isolated database tests pass.'); return; }
    if (!profile?.tenant_id || !form.deceased_name.trim() || !form.date_of_death) return;
    setSaving(true); setError('');
    try {
      const { error: e } = await supabase.from('estates').insert({
        tenant_id: profile.tenant_id,
        deceased_name: form.deceased_name.trim(),
        date_of_death: form.date_of_death,
        total_assets: Number(form.total_assets) || 0,
        total_liabilities: Number(form.total_liabilities) || 0,
        net_estate: netEstate,
        notes: form.notes.trim() || null,
      });
      if (e) throw e;
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error'));
    } finally { setSaving(false); }
  }

  async function addHeir() {
    if (!INHERITANCE_WRITES_ENABLED) { setError(ar ? 'إضافة الورثة معطلة مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Adding heirs is temporarily disabled until isolated database tests pass.'); return; }
    if (!selectedEstate || !profile?.tenant_id) return;
    if (!heirForm.heir_name.trim() || !heirForm.share_fraction.trim()) return;
    const fraction = parseFloat(heirForm.share_fraction);
    const amount = isNaN(fraction) ? 0 : selectedEstate.net_estate * fraction;
    const { error: e } = await supabase.from('heirs').insert({
      estate_id: selectedEstate.id,
      tenant_id: profile.tenant_id,
      heir_name: heirForm.heir_name.trim(),
      relationship: heirForm.relationship.trim(),
      share_fraction: heirForm.share_fraction.trim(),
      calculated_amount: amount,
      is_distributed: false,
    });
    if (e) { setError(e.message); return; }
    setHeirForm({ heir_name: '', relationship: '', share_fraction: '' });
    setHeirModalOpen(false);
    loadData();
  }

  async function deleteEstate(e: Estate) {
    if (!INHERITANCE_WRITES_ENABLED) { setError(ar ? 'الحذف معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Deletion is temporarily disabled until isolated database tests pass.'); return; }
    if (!confirm(ar ? 'حذف التركة والورثة المرتبطين؟' : 'Delete estate and related heirs?')) return;
    await supabase.from('heirs').delete().eq('estate_id', e.id);
    await supabase.from('estates').delete().eq('id', e.id);
    loadData();
  }

  function openCreatePartner() {
    setEditingPartner(null);
    setPartnerForm({ person_name: '', person_name_ar: '', relationship: '', gender: '', birth_date: '', national_id: '', phone: '', notes: '', is_deceased: false, date_of_death: '' });
    setError('');
    setPartnerModalOpen(true);
  }

  function openEditPartner(p: PartnerFamily) {
    setEditingPartner(p);
    setPartnerForm({
      person_name: p.person_name, person_name_ar: p.person_name_ar ?? '', relationship: p.relationship ?? '',
      gender: p.gender ?? '', birth_date: p.birth_date ?? '', national_id: p.national_id ?? '',
      phone: p.phone ?? '', notes: p.notes ?? '', is_deceased: p.is_deceased, date_of_death: p.date_of_death ?? '',
    });
    setError('');
    setPartnerModalOpen(true);
  }

  async function handlePartnerSave() {
    if (!INHERITANCE_WRITES_ENABLED) { setError(ar ? 'الحفظ معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Saving is temporarily disabled until isolated database tests pass.'); return; }
    if (!profile?.tenant_id || !partnerForm.person_name.trim()) return;
    setPartnerSaving(true); setError('');
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        person_name: partnerForm.person_name.trim(),
        person_name_ar: partnerForm.person_name_ar.trim() || null,
        relationship: partnerForm.relationship.trim() || null,
        gender: partnerForm.gender || null,
        birth_date: partnerForm.birth_date || null,
        national_id: partnerForm.national_id.trim() || null,
        phone: partnerForm.phone.trim() || null,
        notes: partnerForm.notes.trim() || null,
        is_deceased: partnerForm.is_deceased,
        date_of_death: partnerForm.is_deceased ? (partnerForm.date_of_death || null) : null,
      };
      if (editingPartner) {
        const { error: e } = await supabase.from('partners_family').update(payload).eq('id', editingPartner.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('partners_family').insert({ ...payload, created_by: profile.id });
        if (e) throw e;
      }
      setPartnerModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error'));
    } finally { setPartnerSaving(false); }
  }

  async function deletePartner(p: PartnerFamily) {
    if (!INHERITANCE_WRITES_ENABLED) { setError(ar ? 'الحذف معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Deletion is temporarily disabled until isolated database tests pass.'); return; }
    if (!confirm(ar ? 'حذف هذا السجل؟' : 'Delete this record?')) return;
    const { error: e } = await supabase.from('partners_family').delete().eq('id', p.id);
    if (e) { setError(e.message); return; }
    loadData();
  }

  function handleExport() {
    if (pageTab === 'estates') {
      const headers = ar ? ['المتوفى', 'تاريخ الوفاة', 'إجمالي الأصول', 'إجمالي الخصوم', 'صافي التركة'] : ['Deceased', 'Death Date', 'Total Assets', 'Total Liabilities', 'Net Estate'];
      const rows = estates.map((e) => [e.deceased_name, e.date_of_death, e.total_assets, e.total_liabilities, e.net_estate]);
      exportToCSV(ar ? 'الميراث' : 'estates', headers, rows);
    } else {
      const headers = ar ? ['الاسم', 'صلة القرابة', 'الجنس', 'تاريخ الميلاد', 'متوفى', 'تاريخ الوفاة'] : ['Name', 'Relationship', 'Gender', 'Birth Date', 'Deceased', 'Death Date'];
      const rows = partners.map((p) => [p.person_name, p.relationship ?? '', p.gender ?? '', p.birth_date ?? '', p.is_deceased ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No'), p.date_of_death ?? '']);
      exportToCSV(ar ? 'الشركاء-والأسرة' : 'partners-family', headers, rows);
    }
  }

  const estateHeirs = (eid: string) => heirs.filter((h) => h.estate_id === eid);

  const relationshipOptions = ar
    ? ['شريك', 'ابن', 'ابنة', 'زوج', 'زوجة', 'أب', 'أم', 'أخ', 'أخت', 'حفيد', 'حفيدة', 'أخرى']
    : ['Partner', 'Son', 'Daughter', 'Husband', 'Wife', 'Father', 'Mother', 'Brother', 'Sister', 'Grandson', 'Granddaughter', 'Other'];

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center"><ScrollText className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{ar ? 'الميراث والتركات' : 'Inheritance & Estates'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'سجل الشركاء والأسرة وحساب التركات' : 'Partners/family registry and estate distribution'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={pageTab === 'estates' ? estates.length === 0 : partners.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{ar ? 'تصدير' : 'Export'}</button>
          {pageTab === 'estates' ? (
            <button onClick={() => { setForm({ deceased_name: '', date_of_death: '', total_assets: 0, total_liabilities: 0, notes: '' }); setError(''); setModalOpen(true); }} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{ar ? 'تركة جديدة' : 'New Estate'}</button>
          ) : (
            <button onClick={openCreatePartner} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-primary flex items-center gap-2"><UserPlus className="w-4 h-4" />{ar ? 'إضافة شخص' : 'Add Person'}</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button onClick={() => setPageTab('estates')} className={`nav-item !rounded-lg ${pageTab === 'estates' ? 'nav-item-active' : ''}`}><ScrollText className="w-4 h-4" /><span>{ar ? 'التركات' : 'Estates'}</span></button>
        <button onClick={() => setPageTab('family')} className={`nav-item !rounded-lg ${pageTab === 'family' ? 'nav-item-active' : ''}`}><Heart className="w-4 h-4" /><span>{ar ? 'الشركاء والأسرة' : 'Partners & Family'}</span></button>
      </div>

      {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}

      {pageTab === 'family' && (
        <div className="card bg-accent-50 dark:bg-accent-900/15 border-accent-200">
          <p className="text-sm text-accent-700 dark:text-accent-300">{ar ? 'هذا سجل اختياري للشركاء وأفراد الأسرة قبل الوفاة. لا يُعتبر كل شخص مسجل وارثًا تلقائيًا. عند تسجيل وفاة، يمكن ربط السجل بملف تركة. الحساب تقديري وقابل للمراجعة الشرعية والقانونية.' : 'This is an optional registry of partners and family members before death. Not every registered person is automatically an heir. Upon death, the record can be linked to an estate file. Calculations are estimates subject to legal and scholarly review.'}</p>
        </div>
      )}

      {pageTab === 'estates' && (
        <>
          {estates.length === 0 ? (
            <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا توجد تركات مسجلة' : 'No estates recorded'}</div>
          ) : (
            <div className="space-y-4">
              {estates.map((e) => (
                <div key={e.id} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-[var(--color-text)]">{e.deceased_name}</h3>
                      <p className="text-xs text-[var(--color-text-muted)]">{ar ? 'تاريخ الوفاة:' : 'Date of death:'} {formatDualDate(e.date_of_death, lang)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-primary-600">{e.net_estate?.toFixed(2) ?? '0.00'}</span>
                      <button onClick={() => deleteEstate(e)} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-secondary !p-1.5 text-error-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div><span className="text-[var(--color-text-muted)]">{ar ? 'الأصول' : 'Assets'}: </span><span className="font-medium text-success-600">{e.total_assets?.toFixed(2) ?? '0'}</span></div>
                    <div><span className="text-[var(--color-text-muted)]">{ar ? 'الخصوم' : 'Liabilities'}: </span><span className="font-medium text-error-600">{e.total_liabilities?.toFixed(2) ?? '0'}</span></div>
                    <div><span className="text-[var(--color-text-muted)]">{ar ? 'الصافي' : 'Net'}: </span><span className="font-bold text-[var(--color-text)]">{e.net_estate?.toFixed(2) ?? '0'}</span></div>
                  </div>
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--color-text-muted)]"><Users className="w-4 h-4 inline ms-1" />{ar ? 'الورثة' : 'Heirs'}</span>
                      <button onClick={() => { setSelectedEstate(e); setHeirForm({ heir_name: '', relationship: '', share_fraction: '' }); setHeirModalOpen(true); }} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-secondary text-xs flex items-center gap-1"><Plus className="w-3 h-3" />{ar ? 'وارث' : 'Heir'}</button>
                    </div>
                    {estateHeirs(e.id).length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)]">{ar ? 'لا يوجد ورثة مسجلون' : 'No heirs recorded'}</p>
                    ) : (
                      <div className="space-y-1">
                        {estateHeirs(e.id).map((h) => (
                          <div key={h.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-[var(--color-bg)]">
                            <span className="text-[var(--color-text)]">{h.heir_name} <span className="text-xs text-[var(--color-text-muted)]">({h.relationship})</span></span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-[var(--color-text-muted)]">{h.share_fraction}</span>
                              <span className="font-medium text-[var(--color-text)]">{h.calculated_amount?.toFixed(2) ?? '0'}</span>
                              {h.is_distributed && <span className="text-xs text-success-600">{ar ? 'موزع' : 'Distributed'}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pageTab === 'family' && (
        <>
          {partners.length === 0 ? (
            <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا يوجد أشخاص مسجلون بعد' : 'No persons registered yet'}</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <th className="text-start py-2 px-3 font-medium">{ar ? 'الاسم' : 'Name'}</th>
                    <th className="text-start py-2 px-3 font-medium">{ar ? 'صلة القرابة' : 'Relationship'}</th>
                    <th className="text-start py-2 px-3 font-medium">{ar ? 'الجنس' : 'Gender'}</th>
                    <th className="text-start py-2 px-3 font-medium">{ar ? 'تاريخ الميلاد' : 'Birth Date'}</th>
                    <th className="text-start py-2 px-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="text-end py-2 px-3 font-medium">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="py-2 px-3 font-medium text-[var(--color-text)]">{ar ? p.person_name_ar ?? p.person_name : p.person_name}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{p.relationship ?? '—'}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{p.gender ? (p.gender === 'male' ? (ar ? 'ذكر' : 'Male') : (ar ? 'أنثى' : 'Female')) : '—'}</td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)]">{p.birth_date ? formatDualDate(p.birth_date, lang) : '—'}</td>
                      <td className="py-2 px-3">
                        {p.is_deceased
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400">{ar ? 'متوفى' : 'Deceased'}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">{ar ? 'على قيد الحياة' : 'Alive'}</span>}
                      </td>
                      <td className="py-2 px-3 text-end">
                        <button onClick={() => openEditPartner(p)} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-secondary !p-1.5" title={ar ? 'تعديل' : 'Edit'}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deletePartner(p)} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-secondary !p-1.5 text-error-500 ms-1" title={ar ? 'حذف' : 'Delete'}><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={ar ? 'تركة جديدة' : 'New Estate'}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'اسم المتوفى' : 'Deceased Name'} *</label><input type="text" value={form.deceased_name} onChange={(e) => setForm({ ...form, deceased_name: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'تاريخ الوفاة' : 'Date of Death'} *</label><input type="date" value={form.date_of_death} onChange={(e) => setForm({ ...form, date_of_death: e.target.value })} className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'إجمالي الأصول' : 'Total Assets'}</label><input type="number" step="0.01" value={form.total_assets || ''} onChange={(e) => setForm({ ...form, total_assets: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'إجمالي الخصوم' : 'Total Liabilities'}</label><input type="number" step="0.01" value={form.total_liabilities || ''} onChange={(e) => setForm({ ...form, total_liabilities: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--color-bg)] flex justify-between"><span className="text-sm font-medium text-[var(--color-text-muted)]">{ar ? 'صافي التركة' : 'Net Estate'}</span><span className="font-bold text-primary-600">{netEstate.toFixed(2)}</span></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'ملاحظات' : 'Notes'}</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-16" rows={2} /></div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setModalOpen(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={handleSave} disabled={saving || !INHERITANCE_WRITES_ENABLED} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>

      <Modal open={heirModalOpen} onClose={() => setHeirModalOpen(false)} title={ar ? 'إضافة وارث' : 'Add Heir'}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'اسم الوارث' : 'Heir Name'} *</label><input type="text" value={heirForm.heir_name} onChange={(e) => setHeirForm({ ...heirForm, heir_name: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'صلة القرابة' : 'Relationship'}</label><input type="text" value={heirForm.relationship} onChange={(e) => setHeirForm({ ...heirForm, relationship: e.target.value })} className="input-field" placeholder={ar ? 'ابن/زوجة/أب...' : 'Son/Wife/Father...'} /></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'النصيب (كسر)' : 'Share (fraction)'} *</label><input type="text" value={heirForm.share_fraction} onChange={(e) => setHeirForm({ ...heirForm, share_fraction: e.target.value })} className="input-field" placeholder={ar ? 'مثل: 0.5 / 1/3 / 0.25' : 'e.g. 0.5 / 1/3 / 0.25'} /></div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setHeirModalOpen(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={addHeir} disabled={!INHERITANCE_WRITES_ENABLED} className="btn-primary">{ar ? 'إضافة' : 'Add'}</button></div>
        </div>
      </Modal>

      <Modal open={partnerModalOpen} onClose={() => setPartnerModalOpen(false)} title={editingPartner ? (ar ? 'تعديل شخص' : 'Edit Person') : (ar ? 'إضافة شخص' : 'Add Person')}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الاسم' : 'Name'} *</label><input type="text" value={partnerForm.person_name} onChange={(e) => setPartnerForm({ ...partnerForm, person_name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الاسم بالعربية' : 'Arabic Name'}</label><input type="text" value={partnerForm.person_name_ar} onChange={(e) => setPartnerForm({ ...partnerForm, person_name_ar: e.target.value })} className="input-field" dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'صلة القرابة' : 'Relationship'}</label>
              <select value={partnerForm.relationship} onChange={(e) => setPartnerForm({ ...partnerForm, relationship: e.target.value })} className="input-field">
                <option value="">{ar ? 'اختر' : 'Select'}</option>
                {relationshipOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الجنس' : 'Gender'}</label>
              <select value={partnerForm.gender} onChange={(e) => setPartnerForm({ ...partnerForm, gender: e.target.value })} className="input-field">
                <option value="">{ar ? 'اختر' : 'Select'}</option>
                <option value="male">{ar ? 'ذكر' : 'Male'}</option>
                <option value="female">{ar ? 'أنثى' : 'Female'}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'تاريخ الميلاد' : 'Birth Date'}</label><input type="date" value={partnerForm.birth_date} onChange={(e) => setPartnerForm({ ...partnerForm, birth_date: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'رقم الهوية' : 'National ID'}</label><input type="text" value={partnerForm.national_id} onChange={(e) => setPartnerForm({ ...partnerForm, national_id: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الهاتف' : 'Phone'}</label><input type="text" value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} className="input-field" /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_deceased" checked={partnerForm.is_deceased} onChange={(e) => setPartnerForm({ ...partnerForm, is_deceased: e.target.checked, date_of_death: e.target.checked ? partnerForm.date_of_death : '' })} className="w-4 h-4 rounded" />
            <label htmlFor="is_deceased" className="text-sm text-[var(--color-text)]">{ar ? 'متوفى' : 'Deceased'}</label>
          </div>
          {partnerForm.is_deceased && (
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'تاريخ الوفاة' : 'Date of Death'}</label><input type="date" value={partnerForm.date_of_death} onChange={(e) => setPartnerForm({ ...partnerForm, date_of_death: e.target.value })} className="input-field" /></div>
          )}
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'ملاحظات' : 'Notes'}</label><textarea value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} className="input-field min-h-16" rows={2} /></div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setPartnerModalOpen(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={handlePartnerSave} disabled={partnerSaving || !INHERITANCE_WRITES_ENABLED} className="btn-primary flex items-center gap-2">{partnerSaving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
