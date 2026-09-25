import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BiometricLog } from '../types/biometric';
import { Fingerprint, ShieldCheck, Cpu, RefreshCw } from 'lucide-react';

export const BiometricCenter: React.FC = () => {
  const [logs, setLogs] = useState<BiometricLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchBiometricLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('biometric_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLogs(data as BiometricLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBiometricLogs();
  }, []);

  return (
    <div className="p-6 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 dir-rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-8 h-8 text-emerald-400" />
          <div>
            <h2 className="text-xl font-bold">مركز أجهزة البصمة والأمان الحيوي</h2>
            <p className="text-sm text-slate-400">إدارة سجلات الحضور، الورديات، وتأكيد العمليات المالية</p>
          </div>
        </div>
        <button
          onClick={fetchBiometricLogs}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث السجلات
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/50 flex items-center gap-4">
          <Cpu className="w-8 h-8 text-cyan-400" />
          <div>
            <span className="text-xs text-slate-400">الأجهزة المتصلة</span>
            <p className="text-lg font-bold text-slate-100">1 جهاز فعال</p>
          </div>
        </div>
        <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/50 flex items-center gap-4">
          <ShieldCheck className="w-8 h-8 text-emerald-400" />
          <div>
            <span className="text-xs text-slate-400">حالة الأمان الحيوي</span>
            <p className="text-lg font-bold text-emerald-400">نشط ومتصل</p>
          </div>
        </div>
        <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700/50 flex items-center gap-4">
          <Fingerprint className="w-8 h-8 text-amber-400" />
          <div>
            <span className="text-xs text-slate-400">إجمالي الحركات</span>
            <p className="text-lg font-bold text-slate-100">{logs.length} حركة</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="p-3">معرف الجهاز</th>
              <th className="p-3">رقم الموظف</th>
              <th className="p-3">نوع الحركة</th>
              <th className="p-3">التاريخ والوقت</th>
              <th className="p-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-3 font-mono text-cyan-400">{log.device_id}</td>
                <td className="p-3 font-medium">{log.biometric_user_id}</td>
                <td className="p-3">
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-semibold">
                    {log.punch_type}
                  </span>
                </td>
                <td className="p-3 text-slate-400 text-xs">
                  {new Date(log.created_at).toLocaleString('ar-YE')}
                </td>
                <td className="p-3 text-xs text-slate-300">{log.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
