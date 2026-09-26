import { useEffect, useState } from 'react';
import { useI18n } from './i18n-context';
import { useAuth } from './auth-context';
import { supabase } from './supabase';
import type { Party, PartyRole, PartyRoleType } from './database';
import Modal from './Modal';
import {
  Users, Plus, Search, Pencil, Trash2, Phone, Mail, Loader2,
  AlertCircle, User, Building2, CheckCircle2,
} from 'lucide-react';

export default function ContactsPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [partyRoles, setPartyRoles] = useState<Record<string, PartyRole[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<PartyRoleType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    type: 'person' as 'person' | 'company',
    phone: '',
    email: '',
    address: '',
    city: '',
    id_number: '',
    notes: '',
    roles: { customer: false, supplier: false, employee: false, agent: false } as Record<PartyRoleType, boolean>,
  });

  useEffect(() => {
    loadParties();
  }, []);

  async function loadParties() {
    setLoading(true);
    const tenantId = profile?.tenant_id;
    if (!tenantId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('parties')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const partyList = data as Party[];
      setParties(partyList);

      const { data: rolesData } = await supabase
        .from('party_roles')
        .select('*')
        .in('party_id', partyList.map((p) => p.id));

      if (rolesData) {
        const rolesMap: Record<string, PartyRole[]> = {};
        (rolesData as PartyRole[]).forEach((r) => {
          if (!rolesMap[r.party_id]) rolesMap[r.party_id] = [];
          rolesMap[r.party_id].push(r);
        });
        setPartyRoles(rolesMap);
      }
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingParty(null);
    setForm({
      name: '', name_ar: '', type: 'person', phone: '', email: '',
      address: '', city: '', id_number: '', notes: '',
      roles: { customer: false, supplier: false, employee: false, agent: false, other: false },
    });
    setError('');
    setModalOpen(true);
  }

  function openEdit(party: Party) {
    setEditingParty(party);
    const roles = (partyRoles[party.id] ?? []).map((r) => r.role);
    setForm({
      name: party.name,
      name_ar: party.name_ar ?? '',
      type: party.type,
      phone: party.phone ?? '',
      email: party.email ?? '',
      address: party.address ?? '',
      city: party.city ?? '',
      id_number: party.id_number ?? '',
      notes: party.notes ?? '',
      roles: {
        customer: roles.includes('customer'),
        supplier: roles.includes('supplier'),
        employee: roles.includes('employee'),
        agent: roles.includes('agent'),
        other: roles.includes('other'),
      },
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    if (!profile?.tenant_id) return;

    const hasRole = Object.values(form.roles).some((r) => r);
    if (!hasRole) {
      setError(lang === 'ar' ? 'اختر دورًا واحدًا على الأقل' : 'Select at least one role');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        tenant_id: profile.tenant_id,
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        type: form.type,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        id_number: form.id_number.trim() || null,
        notes: form.notes.trim() || null,
        is_active: true,
      };

      let partyId: string;

      if (editingParty) {
        const { error: updErr } = await supabase
          .from('parties')
          .update(payload)
          .eq('id', editingParty.id);
        if (updErr) throw updErr;
        partyId = editingParty.id;

        const { error: delErr } = await supabase
          .from('party_roles')
          .delete()
          .eq('party_id', partyId);
        if (delErr) throw delErr;
      } else {
        const { data: newParty, error: insErr } = await supabase
          .from('parties')
          .insert({ ...payload, created_by: profile.id })
          .select()
          .single();
        if (insErr) throw insErr;
        partyId = (newParty as Party).id;
      }

      const roleEntries = Object.entries(form.roles)
        .filter(([, v]) => v)
        .map(([k]) => ({ party_id: partyId, role: k as PartyRoleType }));

      if (roleEntries.length > 0) {
        const { error: roleErr } = await supabase
          .from('party_roles')
          .insert(roleEntries);
        if (roleErr) throw roleErr;
      }

      setModalOpen(false);
      await loadParties();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(party: Party) {
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد من الحذف؟' : 'Are you sure?')) return;
    const { error } = await supabase.from('parties').delete().eq('id', party.id);
    if (!error) await loadParties();
  }

  const filtered = parties.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.name_ar ?? '').includes(search) ||
      (p.phone ?? '').includes(search);
    const matchRole = filterRole === 'all' ||
      (partyRoles[p.id] ?? []).some((r) => r.role === filterRole);
    return matchSearch && matchRole;
  });

  const roleLabels: Record<PartyRoleType, { ar: string; en: string }> = {
    customer: { ar: 'عميل', en: 'Customer' },
    supplier: { ar: 'مورد', en: 'Supplier' },
    employee: { ar: 'موظف', en: 'Employee' },
    agent: { ar: 'وكيل', en: 'Agent' },
    other: { ar: 'أخرى', en: 'Other' },
  };

  const roleColors: Record<PartyRoleType, string> = {
    customer: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    supplier: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-400',
    employee: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    agent: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    other: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.contacts')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'العملاء والموردون والموظفون - نموذج جهة الاتصال الرئيسي' : 'Customers, suppliers, employees — Master Contact model'}
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('common.create')}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="input-field ps-10"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as PartyRoleType | 'all')}
          className="input-field !w-auto"
        >
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="customer">{lang === 'ar' ? 'عملاء' : 'Customers'}</option>
          <option value="supplier">{lang === 'ar' ? 'موردون' : 'Suppliers'}</option>
          <option value="employee">{lang === 'ar' ? 'موظفون' : 'Employees'}</option>
          <option value="agent">{lang === 'ar' ? 'وكلاء' : 'Agents'}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {t('common.no_data')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((party) => {
            const roles = partyRoles[party.id] ?? [];
            return (
              <div key={party.id} className="card hover:border-primary-400 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      {party.type === 'company' ? (
                        <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      ) : (
                        <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--color-text)]">
                        {lang === 'ar' ? party.name_ar ?? party.name : party.name}
                      </div>
                      {party.phone && (
                        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {party.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(party)} className="btn-secondary !p-1.5">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(party)} className="btn-secondary !p-1.5 text-error-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {party.email && (
                  <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-2">
                    <Mail className="w-3 h-3" />
                    {party.email}
                  </div>
                )}

                <div className="flex gap-1 flex-wrap">
                  {roles.map((r) => (
                    <span key={r.id} className={`text-xs px-2 py-0.5 rounded-full ${roleColors[r.role]}`}>
                      {lang === 'ar' ? roleLabels[r.role].ar : roleLabels[r.role].en}
                    </span>
                  ))}
                  {party.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      {t('common.active')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingParty ? t('common.edit') : t('common.create')}
        size="lg"
      >
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {t('common.name')} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}
              </label>
              <input
                type="text"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                className="input-field"
                dir="rtl"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'النوع' : 'Type'}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm({ ...form, type: 'person' })}
                className={`btn-secondary flex items-center gap-2 ${form.type === 'person' ? '!border-primary-500 !text-primary-600' : ''}`}
              >
                <User className="w-4 h-4" />
                {lang === 'ar' ? 'فرد' : 'Person'}
              </button>
              <button
                onClick={() => setForm({ ...form, type: 'company' })}
                className={`btn-secondary flex items-center gap-2 ${form.type === 'company' ? '!border-primary-500 !text-primary-600' : ''}`}
              >
                <Building2 className="w-4 h-4" />
                {lang === 'ar' ? 'شركة' : 'Company'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {t('common.phone')}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {t('common.email')}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'المدينة' : 'City'}
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'رقم الهوية' : 'ID Number'}
              </label>
              <input
                type="text"
                value={form.id_number}
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'الأدوار' : 'Roles'} *
            </label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(form.roles) as PartyRoleType[]).map((roleKey) => (
                <button
                  key={roleKey}
                  onClick={() => setForm({
                    ...form,
                    roles: { ...form.roles, [roleKey]: !form.roles[roleKey] },
                  })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    form.roles[roleKey]
                      ? 'bg-primary-600 text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {form.roles[roleKey] && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {lang === 'ar' ? roleLabels[roleKey].ar : roleLabels[roleKey].en}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {lang === 'ar'
                ? 'يمكن للشخص الواحد أن يكون عميلًا وموردًا وموظفًا في نفس الوقت'
                : 'One person can be customer, supplier, and employee at the same time'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {t('common.notes')}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field min-h-20"
              rows={2}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
