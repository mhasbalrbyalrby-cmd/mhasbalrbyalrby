import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { AIMessage } from '@/types/database';
import { Loader2, MessageSquare } from 'lucide-react';

export function MessagesCenter() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, [profile?.tenant_id]);

  async function fetchMessages() {
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMessages(data as AIMessage[]);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-[var(--color-primary)]" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">مركز الرسائل الذكية</h2>
      </div>

      {messages.length === 0 ? (
        <div className="card text-center py-8 text-[var(--color-text-muted)]">
          لا توجد رسائل حالياً.
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="card hover:border-[var(--color-primary)] transition-colors">
              <p className="font-medium text-sm text-[var(--color-text)]">{msg.raw_text}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <span>الحالة: {msg.status}</span>
                {msg.created_at && (
                  <span>{new Date(msg.created_at).toLocaleDateString('ar-SA')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MessagesCenter;
