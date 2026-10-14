/*
# Fix post_receipt: Use amount_base and exchange_rate from receipts table

## Summary

The post_receipt function was creating journal_lines with hardcoded
`exchange_rate = 1` and using `v_receipt.amount` (the foreign amount)
for debit/credit values. This produced incorrect accounting entries for
any receipt in a non-base currency.

This migration updates post_receipt to:
- Use `v_receipt.amount_base` for debit/credit (the base-currency amount)
- Use `v_receipt.amount` for `amount_foreign` when the receipt currency
  differs from the tenant's base currency, NULL otherwise
- Use `v_receipt.exchange_rate` from the receipts table
- Keep `v_receipt.currency` as the line currency

## Behavior for base currency (e.g., SAR with exchange_rate = 1):
- debit/credit = amount_base = amount (same as before)
- amount_foreign = NULL (no foreign amount for base currency)
- exchange_rate = 1

## Behavior for foreign currency (e.g., USD with exchange_rate = 15.5):
- debit/credit = amount_base = amount × exchange_rate
- amount_foreign = amount (the original foreign amount)
- exchange_rate = the rate from receipts table

## Security
- SECURITY DEFINER preserved
- search_path = 'public' preserved
- Function signature unchanged: post_receipt(p_receipt_id uuid)
- All tenant/auth checks preserved
- No RLS, table, or column changes
- No data changes
*/

CREATE OR REPLACE FUNCTION public.post_receipt(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_receipt record;
  v_entry_id uuid;
  v_entry_number text;
  v_cash_account uuid;
  v_party_account uuid;
  v_base_currency text;
  v_is_foreign boolean;
  v_line_amount_foreign numeric;
BEGIN
SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
IF v_tenant_id IS NULL THEN
  RETURN jsonb_build_object('success', false, 'error', 'no_profile');
END IF;

SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id AND tenant_id = v_tenant_id;
IF NOT FOUND THEN
  RETURN jsonb_build_object('success', false, 'error', 'not_found');
END IF;
IF v_receipt.status <> 'draft' THEN
  RETURN jsonb_build_object('success', false, 'error', 'not_draft');
END IF;

-- Determine base currency for this tenant
SELECT code INTO v_base_currency FROM currencies
WHERE tenant_id = v_tenant_id AND is_base = true LIMIT 1;
IF v_base_currency IS NULL THEN
  v_base_currency := 'SAR';
END IF;

v_is_foreign := v_receipt.currency <> v_base_currency;
v_line_amount_foreign := CASE WHEN v_is_foreign THEN v_receipt.amount ELSE NULL::numeric END;

-- Find cash/bank account
SELECT id INTO v_cash_account FROM chart_of_accounts
WHERE tenant_id = v_tenant_id AND type = 'asset' AND sub_type = 'current_asset' AND is_postable = true
ORDER BY code LIMIT 1;

-- Find party's AR/AP account
SELECT pr.account_id INTO v_party_account
FROM party_roles pr
WHERE pr.party_id = v_receipt.party_id
AND (
  (v_receipt.type = 'receipt' AND pr.role = 'customer')
  OR
  (v_receipt.type = 'payment' AND pr.role = 'supplier')
)
LIMIT 1;

IF v_cash_account IS NULL THEN
  SELECT id INTO v_cash_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND type = 'asset' AND is_postable = true
  ORDER BY code LIMIT 1;
END IF;

IF v_party_account IS NULL THEN
  IF v_receipt.type = 'receipt' THEN
    SELECT id INTO v_party_account FROM chart_of_accounts
    WHERE tenant_id = v_tenant_id AND sub_type = 'accounts_receivable' AND is_postable = true
    ORDER BY code LIMIT 1;
  ELSE
    SELECT id INTO v_party_account FROM chart_of_accounts
    WHERE tenant_id = v_tenant_id AND sub_type = 'accounts_payable' AND is_postable = true
    ORDER BY code LIMIT 1;
  END IF;
END IF;

-- Create journal entry
v_entry_number := 'JE-RCP-' || v_receipt.receipt_number;
INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by)
VALUES (v_tenant_id, v_entry_number, v_receipt.date,
  'Receipt ' || v_receipt.receipt_number, 'receipt', p_receipt_id,
  'draft', v_user_id)
RETURNING id INTO v_entry_id;

IF v_receipt.type = 'receipt' THEN
  -- Cash-in: Debit Cash, Credit AR
  INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
  VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Cash - ' || v_receipt.receipt_number,
    v_receipt.amount_base, 0, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 0);
  IF v_party_account IS NOT NULL THEN
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_party_account, v_receipt.party_id, 'AR - ' || v_receipt.receipt_number,
      0, v_receipt.amount_base, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 1);
  END IF;
ELSIF v_receipt.type = 'payment' THEN
  -- Cash-out: Debit AP, Credit Cash
  IF v_party_account IS NOT NULL THEN
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_party_account, v_receipt.party_id, 'AP - ' || v_receipt.receipt_number,
      v_receipt.amount_base, 0, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 0);
  END IF;
  INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
  VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Cash - ' || v_receipt.receipt_number,
    0, v_receipt.amount_base, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 1);
ELSIF v_receipt.type = 'transfer' THEN
  -- Transfer: debit/credit cash (same account)
  INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
  VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Transfer - ' || v_receipt.receipt_number,
    v_receipt.amount_base, 0, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 0);
  INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, amount_foreign, exchange_rate, line_order)
  VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Transfer - ' || v_receipt.receipt_number,
    0, v_receipt.amount_base, v_receipt.currency, v_line_amount_foreign, v_receipt.exchange_rate, 1);
END IF;

-- Post the journal entry
UPDATE journal_entries SET status = 'posted', posted_at = now(), posted_by = v_user_id, updated_at = now()
WHERE id = v_entry_id;

-- Mark receipt as posted
UPDATE receipts SET status = 'posted', posted_at = now(), posted_by = v_user_id, updated_at = now()
WHERE id = p_receipt_id;

-- Audit log
INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, entity_name, new_values)
VALUES (v_tenant_id, v_user_id, 'post_receipt', 'receipt', p_receipt_id, v_receipt.receipt_number,
  jsonb_build_object('status', 'posted', 'amount', v_receipt.amount, 'amount_base', v_receipt.amount_base,
    'currency', v_receipt.currency, 'exchange_rate', v_receipt.exchange_rate, 'journal_entry_id', v_entry_id));

RETURN jsonb_build_object('success', true, 'journal_entry_id', v_entry_id);
END;
$function$;
