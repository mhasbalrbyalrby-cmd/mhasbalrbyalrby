import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  Brain, Search, Loader2, AlertCircle, Plus, X,
  FileText, ListChecks, Calendar, Save, RefreshCw,
  CircleDot, Filter,
} from 'lucide-react';
import Modal from '@/components/Modal';

type Tab = 'work_log' | 'summaries';

interface WorkLogEntry {
  id: string;
  project_key: string;
  record_type: string;
  title: string;
  status: string;
  severity: string;
  summary: string;
  details: Record<string, unknown>;
  related_reference: string | null;
  created_by: string | null;
  created_at: string;
}

interface ConversationSummary {
  id: string;
  project_key: string;
  conversation_date: string;
  title: string;
  summary: string;
  decisions: string[];
  errors: string[];
  fixes: string[];
  pending_tasks: string[];
  source_reference: string | null;
  created_by: string | null;
  created_at: string;
}

const severityColors: Record<string, string> = {
  info: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  high: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
  critical: 'bg-error-200 text-error-800 dark:bg-error-900/50 dark:text-error-300',
};

const statusColors: Record<string, string> = {
  recorded: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  in_progress: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
  completed: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
  failed: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
};

export default function ProjectMemoryPage() {
  const { t, lang } = useI18n();
  const { isOwner } = useAuth();
  const [tab, setTab] = useState<Tab>('work_log');
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    loadData();
  }, [isOwner]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [{ data: wlData, error: wlErr }, { data: csData, error: csErr }] = await Promise.all([
        supabase.from('project_work_log').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('project_conversation_summaries').select('*').order('conversation_date', { ascending: false }).limit(100),
      ]);
      if (wlErr) throw wlErr;
      if (csErr) throw csErr;
      setWorkLog((wlData as WorkLogEntry[]) ?? []);
      setSummaries((csData as ConversationSummary[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)]">{t('error.unauthorized')}</p>
        </div>
      </div>
    );
  }

  const tabs: { code: Tab; icon: typeof Brain; label: string }[] = [
    { code: 'work_log', icon: ListChecks, label: lang === 'ar' ? 'سجل العمل' : 'Work Log' },
    { code: 'summaries', icon: FileText, label: lang === 'ar' ? 'ملخصات المحادثات' : 'Conversation Summaries' },
  ];

  const recordTypes = [...new Set(workLog.map((e) => e.record_type))].sort();

  const filteredWorkLog = workLog.filter((e) => {
    const matchesSearch = !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.summary.toLowerCase().includes(search.toLowerCase());
    const matchesType = !filterType || e.record_type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredSummaries = summaries.filter((s) => {
    if (!search) return true;
    return s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.summary.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            {lang === 'ar' ? 'ذاكرة المشروع' : 'Project Memory'}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'سجل متابعة التطوير وملخصات المحادثات الفنية' : 'Development tracking and technical conversation summaries'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)]">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.code}
              onClick={() => setTab(tabItem.code)}
              className={`nav-item !rounded-lg whitespace-nowrap ${tab === tabItem.code ? 'nav-item-active' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

      <div className="card flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث في العنوان أو الملخص...' : 'Search title or summary...'}
            className="input-field ps-9"
          />
        </div>
        {tab === 'work_log' && recordTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field !py-2">
              <option value="">{lang === 'ar' ? 'كل الأنواع' : 'All types'}</option>
              {recordTypes.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
            </select>
          </div>
        )}
        <button onClick={loadData} className="btn-secondary flex items-center gap-2 !py-2">
          <RefreshCw className="w-4 h-4" />
          {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
        {tab === 'summaries' && (
          <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2 !py-2">
            <Plus className="w-4 h-4" />
            {lang === 'ar' ? 'إضافة ملخص' : 'Add Summary'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : error ? (
        <div className="card text-center text-error-500 flex items-center justify-center gap-2 py-6">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      ) : (
        <>
          {tab === 'work_log' && (
            <WorkLogList entries={filteredWorkLog} lang={lang} />
          )}
          {tab === 'summaries' && (
            <SummariesList summaries={filteredSummaries} lang={lang} />
          )}
        </>
      )}

      {addModalOpen && (
        <AddSummaryModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          lang={lang}
          onSaved={() => { setAddModalOpen(false); loadData(); }}
        />
      )}
    </div>
  );
}

function WorkLogList({ entries, lang }: { entries: WorkLogEntry[]; lang: string }) {
  if (entries.length === 0) {
    return (
      <div className="card text-center py-12 text-[var(--color-text-muted)]">
        {lang === 'ar' ? 'لا توجد سجلات' : 'No records'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="card">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                  {entry.record_type}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[entry.status] ?? ''}`}>
                  {entry.status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[entry.severity] ?? ''}`}>
                  {entry.severity}
                </span>
              </div>
              <h3 className="font-semibold text-[var(--color-text)] text-sm">{entry.title}</h3>
            </div>
            <time className="text-xs text-[var(--color-text-muted)] shrink-0">
              {new Date(entry.created_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
            </time>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">{entry.summary}</p>
          {entry.related_reference && (
            <div className="text-xs text-[var(--color-text-muted)] mt-2 font-mono">
              ref: {entry.related_reference}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SummariesList({ summaries, lang }: { summaries: ConversationSummary[]; lang: string }) {
  if (summaries.length === 0) {
    return (
      <div className="card text-center py-12 text-[var(--color-text-muted)]">
        {lang === 'ar' ? 'لا توجد ملخصات' : 'No summaries'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summaries.map((s) => (
        <div key={s.id} className="card">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                <time className="text-xs text-[var(--color-text-muted)]">{s.conversation_date}</time>
              </div>
              <h3 className="font-semibold text-[var(--color-text)] text-sm">{s.title}</h3>
            </div>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">{s.summary}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {s.decisions.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-[var(--color-text)] mb-1">
                  {lang === 'ar' ? 'القرارات' : 'Decisions'}
                </div>
                <ul className="space-y-1">
                  {s.decisions.map((d, i) => (
                    <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5">
                      <CircleDot className="w-3 h-3 mt-0.5 shrink-0 text-primary-500" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.fixes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-success-600 dark:text-success-400 mb-1">
                  {lang === 'ar' ? 'الإصلاحات' : 'Fixes'}
                </div>
                <ul className="space-y-1">
                  {s.fixes.map((f, i) => (
                    <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5">
                      <CircleDot className="w-3 h-3 mt-0.5 shrink-0 text-success-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.errors.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-error-600 dark:text-error-400 mb-1">
                  {lang === 'ar' ? 'الأخطاء' : 'Errors'}
                </div>
                <ul className="space-y-1">
                  {s.errors.map((e, i) => (
                    <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5">
                      <CircleDot className="w-3 h-3 mt-0.5 shrink-0 text-error-500" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.pending_tasks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-warning-600 dark:text-warning-400 mb-1">
                  {lang === 'ar' ? 'مهام معلقة' : 'Pending Tasks'}
                </div>
                <ul className="space-y-1">
                  {s.pending_tasks.map((p, i) => (
                    <li key={i} className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5">
                      <CircleDot className="w-3 h-3 mt-0.5 shrink-0 text-warning-500" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddSummaryModal({
  open, onClose, lang, onSaved,
}: { open: boolean; onClose: () => void; lang: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '',
    summary: '',
    conversation_date: new Date().toISOString().slice(0, 10),
    decisions: '',
    fixes: '',
    errors: '',
    pending_tasks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function parseLines(text: string): string[] {
    return text.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.summary.trim()) {
      setError(lang === 'ar' ? 'العنوان والملخص مطلوبان' : 'Title and summary are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.from('project_conversation_summaries').insert({
        project_key: 'arab-spring-erp',
        conversation_date: form.conversation_date,
        title: form.title.trim(),
        summary: form.summary.trim(),
        decisions: parseLines(form.decisions),
        fixes: parseLines(form.fixes),
        errors: parseLines(form.errors),
        pending_tasks: parseLines(form.pending_tasks),
      });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={lang === 'ar' ? 'إضافة ملخص محادثة' : 'Add Conversation Summary'}>
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
            {lang === 'ar' ? 'التاريخ' : 'Date'}
          </label>
          <input
            type="date"
            value={form.conversation_date}
            onChange={(e) => setForm({ ...form, conversation_date: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
            {lang === 'ar' ? 'العنوان' : 'Title'} *
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
            {lang === 'ar' ? 'الملخص' : 'Summary'} *
          </label>
          <textarea
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={3}
            className="input-field resize-y"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'القرارات (سطر لكل عنصر)' : 'Decisions (one per line)'}
            </label>
            <textarea value={form.decisions} onChange={(e) => setForm({ ...form, decisions: e.target.value })} rows={3} className="input-field resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'الإصلاحات (سطر لكل عنصر)' : 'Fixes (one per line)'}
            </label>
            <textarea value={form.fixes} onChange={(e) => setForm({ ...form, fixes: e.target.value })} rows={3} className="input-field resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'الأخطاء (سطر لكل عنصر)' : 'Errors (one per line)'}
            </label>
            <textarea value={form.errors} onChange={(e) => setForm({ ...form, errors: e.target.value })} rows={3} className="input-field resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
              {lang === 'ar' ? 'مهام معلقة (سطر لكل عنصر)' : 'Pending tasks (one per line)'}
            </label>
            <textarea value={form.pending_tasks} onChange={(e) => setForm({ ...form, pending_tasks: e.target.value })} rows={3} className="input-field resize-y" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex items-center gap-2">
            <X className="w-4 h-4" />
            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {lang === 'ar' ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
