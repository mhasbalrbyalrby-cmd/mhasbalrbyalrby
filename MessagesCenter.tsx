import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AIMessage } from './types/database';

export function MessagesCenter() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMessages() {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setMessages(data as AIMessage[]);
      }
      setLoading(false);
    }
    fetchMessages();
  }, []);

  if (loading) {
    return <div className="p-4 text-center">جاري تحميل الرسائل...</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold mb-4">مركز الرسائل الذكية</h2>
      {messages.length === 0 ? (
        <p className="text-gray-500">لا توجد رسائل حالياً.</p>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className="p-3 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{msg.raw_text}</p>
            <span className="text-xs text-gray-500 mt-1 block">الحالة: {msg.status}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default MessagesCenter;
