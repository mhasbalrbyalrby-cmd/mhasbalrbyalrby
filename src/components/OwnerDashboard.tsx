import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OwnerAccount } from '../types/owner';

export const OwnerDashboard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [ownerData, setOwnerData] = useState<OwnerAccount | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchOwnerProfile();
  }, []);

  const fetchOwnerProfile = async () => {
    try {
      setLoading(true);
      // جلب سجل مالك النظام بناءً على قيمة is_owner
      const { data, error } = await supabase
        .from('tenants') // أبدل 'tenants' باسم الجدول لديك إذا كان مختلفاً (مثل stores أو accounts)
        .select('*')
        .eq('is_owner', true)
        .maybeSingle();

      if (error) {
        console.error('خطأ أثناء جلب بيانات المالك:', error.message);
        setErrorMessage(error.message);
      } else if (data) {
        setOwnerData(data as OwnerAccount);
      }
    } catch (err: any) {
      console.error('خطأ في الاتصال:', err);
      setErrorMessage('حدث خطأ أثناء الاتصال بقاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-600">
        جاري تحميل بيانات لوحة المالك...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="p-6 text-red-600 bg-red-50 rounded-lg m-4">
        حدث خطأ: {errorMessage}
      </div>
    );
  }

  return (
    <div className="p-6 dir-rtl text-right bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-sm border">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {ownerData?.name_ar || 'مالك النظام'}
            </h1>
            <p className="text-sm text-gray-500">
              المعرف اللفظي (Slug): {ownerData?.slug}
            </p>
          </div>
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            الحالة: {ownerData?.status || 'نشط'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <span className="text-xs text-blue-600 font-semibold">صلاحية المالك</span>
            <p className="text-lg font-bold text-blue-900 mt-1">
              {ownerData?.is_owner ? 'مالك معتمد (System Owner)' : 'غير محدد'}
            </p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <span className="text-xs text-purple-600 font-semibold">الحد الأقصى للمستخدمين</span>
            <p className="text-xl font-bold text-purple-900 mt-1">
              {ownerData?.max_users ?? 5} مستخدمين
            </p>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <span className="text-xs text-amber-600 font-semibold">نوع الخطة</span>
            <p className="text-lg font-bold text-amber-900 mt-1">
              {ownerData?.plan_id ? ownerData.plan_id : 'افتراضي / غير محدد'}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border">
          <h2 className="text-sm font-bold text-gray-700 mb-2">معلومات المعرف الفريد (UUID):</h2>
          <code className="text-xs bg-gray-200 p-2 rounded block break-all text-gray-800">
            {ownerData?.id}
          </code>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;
