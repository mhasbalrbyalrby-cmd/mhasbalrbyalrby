import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { PrepaidCard } from '@/types/database';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Copy, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldAlert,
  Loader2,
  Sparkles,
  Filter
} from 'lucide-react';

export default function PrepaidCardsPage() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<PrepaidCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchCards();
  }, [profile?.tenant_id]);

  async function fetchCards() {
    setLoading(true);
    const { data, error } = await supabase
      .from('prepaid_cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCards(data as PrepaidCard[]);
    }
    setLoading(false);
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCards = cards.filter((card) => {
    const matchesSearch = card.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (card.notes && card.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            نشطة
          </span>
        );
      case 'used':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" />
            مستخدمة
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <ShieldAlert className="w-3.5 h-3.5" />
            منتهية
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            ملغاة
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--color-bg-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">إدارة كروت التعبئة والشحن</h1>
            <p className="text-xs text-[var(--color-text-muted)]">مولّد وإدارة بطاقات اشتراكات النظام والرصيد</p>
          </div>
        </div>
        <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
          <Plus className="w-4 h-4" />
          توليد كروت جديدة
        </button>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="البحث برقم الكرت أو الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--color-text)]"
          />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[var(--color-text)] appearance-none cursor-pointer"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشطة (جاهزة للاستخدام)</option>
            <option value="used">مستخدمة</option>
            <option value="expired">منتهية الصلاحية</option>
            <option value="cancelled">ملغاة</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-sm text-[var(--color-text-muted)]">جاري تحميل سجل الكروت...</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="p-12 text-center bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] space-y-3">
          <Sparkles className="w-10 h-10 text-[var(--color-text-muted)] mx-auto opacity-50" />
          <p className="text-base font-semibold text-[var(--color-text)]">لا توجد بطاقات شحن</p>
          <p className="text-xs text-[var(--color-text-muted)]">لم يتم العثور على أي كروت تطابق محددات البحث الحالية.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <div
              key={card.id}
              className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 hover:border-emerald-500/40 transition-all shadow-sm relative overflow-hidden group"
            >
              {/* Top Row */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                {getStatusBadge(card.status)}
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                  {card.duration_type === 'monthly' ? 'شهري' : card.duration_type === 'yearly' ? 'سنوي' : `${card.duration_days} يوم`}
                </span>
              </div>

              {/* Code Box */}
              <div className="bg-[var(--color-bg)] p-3 rounded-xl border border-[var(--color-border)] flex items-center justify-between group-hover:border-emerald-500/20 transition-colors">
                <span className="font-mono text-base font-bold tracking-wider text-[var(--color-text)] dir-ltr">
                  {card.code}
                </span>
                <button
                  onClick={() => handleCopyCode(card.code)}
                  className="p-1.5 text-[var(--color-text-muted)] hover:text-emerald-600 transition-colors rounded-lg hover:bg-[var(--color-bg-surface)]"
                  title="نسخ الرقم"
                >
                  {copiedCode === card.code ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--color-text-muted)] block">القيمة المالية</span>
                  <span className="font-bold text-[var(--color-text)]">{card.value} {card.currency}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)] block">تاريخ الانتهاء</span>
                  <span className="font-medium text-[var(--color-text)]">
                    {card.expires_at ? new Date(card.expires_at).toLocaleDateString('ar-SA') : 'غير محدد'}
                  </span>
                </div>
              </div>

              {card.notes && (
                <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] p-2 rounded-lg line-clamp-2">
                  {card.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
