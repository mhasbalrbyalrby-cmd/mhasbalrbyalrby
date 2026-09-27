import React, { useState } from 'react';
​export default function App() {
const [activeTab, setActiveTab] = useState('dashboard');
const [zakatEnabled, setZakatEnabled] = useState(false);
const [salesAmount, setSalesAmount] = useState('');
const [partnerShare, setPartnerShare] = useState(0);
​const calculatePartnerShare = (amount: string) => {
const val = parseFloat(amount) || 0;
setPartnerShare(val * 0.3);
};
​return (
<div className="min-h-screen bg-gray-100 text-gray-800 font-sans" dir="rtl">
<header className="bg-emerald-800 text-white shadow-md p-4 flex justify-between items-center">
<div>
<h1 className="text-xl font-bold">محاسب الربيع العربي - النسخة المتكاملة</h1>
<p className="text-xs text-emerald-200">إدارة الحسابات، المبيعات، والزكاة</p>
</div>
<div className="flex gap-3">
<button
onClick={() => setZakatEnabled(!zakatEnabled)}
className={px-3 py-1.5 rounded text-sm font-medium transition ${ zakatEnabled ? 'bg-amber-500 text-white' : 'bg-emerald-700 text-emerald-100 border border-emerald-600' }}
>
{zakatEnabled ? '✓ نظام الزكاة مُفعّل' : 'تفعيل نظام الزكاة'}
</button>
</div>
</header>
​<main className="p-6 max-w-7xl mx-auto">
<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
<div className="bg-white p-4 rounded-lg shadow border-r-4 border-emerald-600">
<h3 className="text-gray-500 text-sm">إجمالي المبيعات اليومية</h3>
<p className="text-2xl font-bold text-gray-800 mt-1">0.00 ر.ي</p>
</div>
<div className="bg-white p-4 rounded-lg shadow border-r-4 border-blue-600">
<h3 className="text-gray-500 text-sm">صندوق النقدية</h3>
<p className="text-2xl font-bold text-gray-800 mt-1">0.00 ر.ي</p>
</div>
<div className="bg-white p-4 rounded-lg shadow border-r-4 border-amber-600">
<h3 className="text-gray-500 text-sm">أرباح الشريك (30%)</h3>
<p className="text-2xl font-bold text-amber-600 mt-1">{partnerShare.toFixed(2)} ر.ي</p>
</div>
{zakatEnabled && (
<div className="bg-white p-4 rounded-lg shadow border-r-4 border-purple-600 bg-purple-50">
<h3 className="text-purple-700 text-sm font-bold">حساب زكاة المال (الحول)</h3>
<p className="text-xl font-bold text-purple-900 mt-1">جاهز للحساب</p>
</div>
)}
</div>
​<div className="bg-white rounded-lg shadow p-6">
<div className="flex border-b pb-3 mb-4 gap-4">
<button
onClick={() => setActiveTab('dashboard')}
className={pb-2 font-medium ${activeTab === 'dashboard' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-gray-500'}}
>
الرئيسية ونقاط البيع
</button>
<button
onClick={() => setActiveTab('accounts')}
className={pb-2 font-medium ${activeTab === 'accounts' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-gray-500'}}
>
دليل الحسابات
</button>
<button
onClick={() => setActiveTab('reports')}
className={pb-2 font-medium ${activeTab === 'reports' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-gray-500'}}
>
التقارير المالية
</button>
</div>
​{activeTab === 'dashboard' && (
<div className="space-y-4">
<h2 className="text-lg font-bold text-gray-700">تسجيل مبيعات يومية وحساب حصة الشريك</h2>
<div className="flex gap-4 items-center">
<input
type="number"
placeholder="أدخل مبلغ المبيعات اليومية..."
value={salesAmount}
onChange={(e) => {
setSalesAmount(e.target.value);
calculatePartnerShare(e.target.value);
}}
className="border rounded px-4 py-2 w-72 focus:outline-none focus:border-emerald-600"
/>
<span className="text-gray-500 text-sm">يتم احتساب حصة الشريك تلقائياً</span>
</div>
</div>
)}
​{activeTab === 'accounts' && (
<div>
<h2 className="text-lg font-bold text-gray-700 mb-2">دليل الحسابات والأرصدة الافتتاحية</h2>
<p className="text-gray-500 text-sm">هنا يتم عرض الشجرة المحاسبية وإدارة الحسابات بكل سهولة.</p>
</div>
)}
​{activeTab === 'reports' && (
<div>
<h2 className="text-lg font-bold text-gray-700 mb-2">التقارير المالية وحسابات الحول</h2>
<p className="text-gray-500 text-sm">عرض كشوفات الحساب والأرباح والخسائر.</p>
</div>
)}
</div>
</main>
</div>
);
}
