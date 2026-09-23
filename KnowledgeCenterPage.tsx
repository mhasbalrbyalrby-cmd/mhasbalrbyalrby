;import { useI18n } from './i18n-context';
import { useAuth } from './auth-context';
import { supabase } from './supabase';
import type { Article, Category } from './database';
import {
  BookOpen, Loader2, Search, FileText, CheckCircle2,
  Clock, AlertCircle, Circle,
} from 'lucide-react';

const categories = [
  { code: 'requirements', icon: FileText },
  { code: 'features', icon: CheckCircle2 },
  { code: 'decisions', icon: BookOpen },
  { code: 'rules', icon: AlertCircle },
  { code: 'errors', icon: AlertCircle },
  { code: 'tests', icon: Clock },
  { code: 'changelog', icon: Clock },
  { code: 'guide', icon: BookOpen },
] as const;

export default function KnowledgeCenterPage() {
  const { t, lang } = useI18n();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);

  useEffect(() => {
    loadArticles();
  }, []);

  async function loadArticles() {
    setLoading(true);
    const { data } = await supabase
      .from('knowledge_articles')
      .select('*')
      .order('sort_order');
    setArticles((data as KnowledgeArticle[]) ?? []);
    setLoading(false);
  }

  const filtered = articles.filter((a) => {
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.title_ar ?? '').includes(search) ||
      (a.content ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = !activeCategory || a.category === activeCategory;
    return matchSearch && matchCategory;
  });

  function statusIcon(status: string) {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-success-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-accent-500" />;
      case 'tested': return <CheckCircle2 className="w-4 h-4 text-primary-500" />;
      case 'needs_review': return <AlertCircle className="w-4 h-4 text-warning-500" />;
      default: return <Circle className="w-4 h-4 text-[var(--color-text-muted)]" />;
    }
  }

  function statusLabel(status: string): string {
    const key = `knowledge.status.${status}`;
    return t(key);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('knowledge.title')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'المرجع الأساسي لمتطلبات ومواصفات المشروع' : 'Primary reference for project requirements and specifications'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="input-field ps-10"
        />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !activeCategory
              ? 'bg-primary-600 text-white'
              : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {lang === 'ar' ? 'الكل' : 'All'}
        </button>
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.code}
              onClick={() => setActiveCategory(cat.code)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeCategory === cat.code
                  ? 'bg-primary-600 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(`knowledge.${cat.code}`)}
            </button>
          );
        })}
      </div>

      {/* Articles */}
      {selectedArticle ? (
        <div className="card animate-slide-up">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg text-[var(--color-text)]">
                {lang === 'ar' ? selectedArticle.title_ar ?? selectedArticle.title : selectedArticle.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {statusIcon(selectedArticle.status)}
                <span className="text-sm text-[var(--color-text-muted)]">{statusLabel(selectedArticle.status)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                  {t(`knowledge.${selectedArticle.category}`)}
                </span>
              </div>
            </div>
            <button onClick={() => setSelectedArticle(null)} className="btn-secondary text-sm">
              {t('common.close')}
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-[var(--color-text)] whitespace-pre-wrap">
            {lang === 'ar' ? selectedArticle.content_ar ?? selectedArticle.content : selectedArticle.content}
          </div>
          {selectedArticle.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-4 pt-4 border-t border-[var(--color-border)]">
              {selectedArticle.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((article) => (
            <button
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="card text-start hover:border-primary-400 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-[var(--color-text)]">
                  {lang === 'ar' ? article.title_ar ?? article.title : article.title}
                </h3>
                {statusIcon(article.status)}
              </div>
              <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">
                {lang === 'ar' ? article.content_ar ?? article.content : article.content}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                  {t(`knowledge.${article.category}`)}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{statusLabel(article.status)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {t('common.no_data')}
        </div>
      )}
    </div>
  );
}
