async function handleSave() {
  if (!profile?.tenant_id) return;

  if (!form.party_id) {
    setError(lang === 'ar' ? 'اختر جهة الاتصال' : 'Select a contact');
    return;
  }

  if (
    form.lines.length === 0 ||
    form.lines.every((l) => !l.description && !l.product_id)
  ) {
    setError(lang === 'ar' ? 'أضف سطرًا واحدًا على الأقل' : 'Add at least one line');
    return;
  }

  if (
    form.lines.some(
      (l) =>
        Number(l.quantity) <= 0 ||
        Number(l.unit_price) < 0 ||
        Number(l.discount_amount) < 0
    )
  ) {
    setError(
      lang === 'ar'
        ? 'تحقق من الكمية والسعر والخصم في البنود'
        : 'Check line quantities, prices, and discounts'
    );
    return;
  }

  setSaving(true);
  setError('');

  try {
    const invNumber =
      `INV-${Date.now()}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`;

    const invoicePayload = {
      invoice_number: invNumber,
      type: form.type,
      party_id: form.party_id,
      date: form.date,
      due_date: form.due_date || null,
      currency: form.currency,
      discount_amount: invoiceDiscount,
      notes: form.notes.trim() || null,
      warehouse_id: form.warehouse_id || null,
      shift_id: form.shift_id || null,
    };

    const linePayloads = form.lines.map((l, i) => ({
      product_id: l.product_id || null,
      description: l.description || null,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price) || 0,
      discount_amount: Number(l.discount_amount) || 0,
      line_order: i,
    }));

    const { data, error: saveError } = await supabase.rpc(
      'create_invoice_draft_atomic',
      {
        p_invoice: invoicePayload,
        p_lines: linePayloads,
      }
    );

    if (saveError) throw saveError;

    const result = data as { success?: boolean; invoice_id?: string };

    if (!result?.success || !result.invoice_id) {
      throw new Error(
        lang === 'ar'
          ? 'لم يتم تأكيد حفظ الفاتورة'
          : 'Invoice save was not confirmed'
      );
    }

    setModalOpen(false);
    await loadData();
  } catch (err) {
    setError(err instanceof Error ? err.message : t('error.generic'));
  } finally {
    setSaving(false);
  }
}
