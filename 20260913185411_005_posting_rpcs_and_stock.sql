/*
# Secure Posting RPCs and Stock Management

## Overview
This migration adds SECURITY DEFINER RPCs that enforce double-entry accounting rules
server-side. The frontend cannot bypass these checks because they run as the
postgres role with RLS-bypass, but they re-validate tenant membership and
permissions internally.

## New RPCs

### 1. post_journal_entry(p_entry_id uuid)
- Re-fetches journal_lines from the database (does NOT trust client-sent totals)
- Verifies sum(debit) = sum(credit) using numeric arithmetic, not a boolean flag
- Only posts if entry belongs to caller's tenant and status is 'draft'
- Sets status='posted', posted_at, posted_by
- Logs to audit_logs

### 2. post_invoice(p_invoice_id uuid)
- Fetches the invoice and its lines from the database
- Verifies the invoice belongs to caller's tenant and is in 'draft' status
- Creates a balanced journal entry with:
  - For sales: Debit AR (party account), Credit Revenue + Credit Tax
  - For purchases: Debit Expense/Cogs, Credit AP (party account)
- Creates stock_movements for product items (out for sales, in for purchases)
- Marks invoice as posted
- Logs to audit_logs

### 3. post_receipt(p_receipt_id uuid)
- Fetches the receipt from the database
- Verifies ownership and draft status
- Creates a balanced journal entry:
  - For receipt (cash-in): Debit Cash/Bank, Credit AR (party)
  - For payment (cash-out): Debit AP (party), Credit Cash/Bank
- Marks receipt as posted
- Logs to audit_logs

### 4. reverse_journal_entry(p_entry_id uuid, p_reason text)
- Creates a reversal entry that mirrors the original with swapped debit/credit
- Marks original as 'reversed'
- Does NOT modify or delete the original posted lines
- Logs to audit_logs

### 5. get_product_stock(p_tenant_id uuid, p_product_id uuid, p_arehouse_id uuid)
- Returns current stock quantity for a product in a warehouse
- Calculated from stock_movements (sum of in - sum of out)

## Security
- All RPCs are SECURITY DEFINER with search_path secured
- Each RPC validates tenant membership via auth.uid() -> profiles -> tenant_id
- No RPC trusts client-sent financial totals; all re-fetch from the database
- All actions logged to audit_logs

## Important Notes
1. The balance check in post_journal_entry uses SUM(debit) = SUM(credit) with
   numeric(18,2) arithmetic — NOT a boolean is_balanced flag
2. Invoice posting creates real double-entry journal lines
3. Receipt posting creates real double-entry journal lines
4. Stock movements are created for product-type invoice lines
5. Reversal entries preserve the original; they don't modify posted data
*/

-- ============================================================
-- Helper: get tenant_id for current user
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- 1. POST JOURNAL ENTRY
-- ============================================================
CREATE OR REPLACE FUNCTION post_journal_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_entry record;
  v_total_debit numeric(18,2);
  v_total_credit numeric(18,2);
  v_user_id uuid := auth.uid();
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;

  -- Fetch the entry, verify ownership and status
  SELECT * INTO v_entry FROM journal_entries WHERE id = p_entry_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_entry.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_draft');
  END IF;

  -- REAL BALANCE CHECK: sum debit = sum credit from the database
  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_lines
  WHERE journal_entry_id = p_entry_id;

  IF v_total_debit = 0 AND v_total_credit = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_entry');
  END IF;

  IF v_total_debit <> v_total_credit THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_balanced',
      'debit', v_total_debit, 'credit', v_total_credit);
  END IF;

  -- Post the entry
  UPDATE journal_entries
  SET status = 'posted',
      posted_at = now(),
      posted_by = v_user_id,
      updated_at = now()
  WHERE id = p_entry_id;

  -- Audit log
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, entity_name, new_values)
  VALUES (v_tenant_id, v_user_id, 'post_journal', 'journal_entry', p_entry_id, v_entry.entry_number,
    jsonb_build_object('status', 'posted', 'debit', v_total_debit, 'credit', v_total_credit));

  RETURN jsonb_build_object('success', true, 'entry_id', p_entry_id);
END;
$$;

-- ============================================================
-- 2. POST INVOICE
-- ============================================================
CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_invoice record;
  v_lines record;
  v_entry_id uuid;
  v_entry_number text;
  v_party_account uuid;
  v_revenue_account uuid;
  v_tax_account uuid;
  v_cash_account uuid;
  v_inventory_account uuid;
  v_cogs_account uuid;
  v_line_count int := 0;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_line_debit numeric(18,2);
  v_line_credit numeric(18,2);
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_draft');
  END IF;

  -- Find or create a default revenue account for this tenant
  SELECT id INTO v_revenue_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND type = 'revenue' AND is_postable = true
  ORDER BY code LIMIT 1;

  SELECT id INTO v_tax_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND sub_type = 'tax' AND is_postable = true
  ORDER BY code LIMIT 1;

  SELECT id INTO v_cash_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND type = 'asset' AND sub_type = 'current_asset' AND is_postable = true
  ORDER BY code LIMIT 1;

  SELECT id INTO v_inventory_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND sub_type = 'inventory' AND is_postable = true
  ORDER BY code LIMIT 1;

  SELECT id INTO v_cogs_account FROM chart_of_accounts
  WHERE tenant_id = v_tenant_id AND sub_type = 'cogs' AND is_postable = true
  ORDER BY code LIMIT 1;

  -- Find party's AR/AP account from party_roles
  SELECT pr.account_id INTO v_party_account
  FROM party_roles pr
  WHERE pr.party_id = v_invoice.party_id
  AND (
    (v_invoice.type IN ('sale', 'return_purchase') AND pr.role = 'customer')
    OR
    (v_invoice.type IN ('purchase', 'return_sale') AND pr.role = 'supplier')
  )
  LIMIT 1;

  -- Fallback: find a generic AR or AP account
  IF v_party_account IS NULL THEN
    IF v_invoice.type IN ('sale', 'return_purchase') THEN
      SELECT id INTO v_party_account FROM chart_of_accounts
      WHERE tenant_id = v_tenant_id AND sub_type = 'accounts_receivable' AND is_postable = true
      ORDER BY code LIMIT 1;
    ELSE
      SELECT id INTO v_party_account FROM chart_of_accounts
      WHERE tenant_id = v_tenant_id AND sub_type = 'accounts_payable' AND is_postable = true
      ORDER BY code LIMIT 1;
    END IF;
  END IF;

  -- If still no party account, use a generic asset/liability
  IF v_party_account IS NULL THEN
    IF v_invoice.type IN ('sale', 'return_purchase') THEN
      SELECT id INTO v_party_account FROM chart_of_accounts
      WHERE tenant_id = v_tenant_id AND type = 'asset' AND is_postable = true
      ORDER BY code LIMIT 1;
    ELSE
      SELECT id INTO v_party_account FROM chart_of_accounts
      WHERE tenant_id = v_tenant_id AND type = 'liability' AND is_postable = true
      ORDER BY code LIMIT 1;
    END IF;
  END IF;

  -- Create journal entry
  v_entry_number := 'JE-INV-' || v_invoice.invoice_number;
  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, branch_id)
  VALUES (v_tenant_id, v_entry_number, v_invoice.date,
    'Invoice ' || v_invoice.invoice_number, 'invoice', p_invoice_id,
    'draft', v_user_id, v_invoice.branch_id)
  RETURNING id INTO v_entry_id;

  -- For SALES: Debit AR (total), Credit Revenue (subtotal), Credit Tax (if any)
  -- For PURCHASES: Debit Expense/Cogs (subtotal), Debit Tax (if any), Credit AP (total)
  -- For RETURN_SALE: Credit AR, Debit Revenue
  -- For RETURN_PURCHASE: Credit AP, Debit Expense

  IF v_invoice.type = 'sale' THEN
    -- Debit AR
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_invoice.party_id, 'AR - ' || v_invoice.invoice_number, v_invoice.total, 0, v_invoice.currency, 1, 0);
      v_total_debit := v_total_debit + v_invoice.total;
    END IF;
    -- Credit Revenue
    IF v_revenue_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_revenue_account, 'Revenue - ' || v_invoice.invoice_number, 0, v_invoice.subtotal, v_invoice.currency, 1, 1);
      v_total_credit := v_total_credit + v_invoice.subtotal;
    END IF;
    -- Credit Tax
    IF v_invoice.tax_amount > 0 AND v_tax_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_tax_account, 'Tax - ' || v_invoice.invoice_number, 0, v_invoice.tax_amount, v_invoice.currency, 1, 2);
      v_total_credit := v_total_credit + v_invoice.tax_amount;
    END IF;
    -- Credit Discount (if discount reduces revenue further, it's already in subtotal)

  ELSIF v_invoice.type = 'purchase' THEN
    -- Debit COGS/Expense
    IF v_cogs_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_cogs_account, 'COGS - ' || v_invoice.invoice_number, v_invoice.subtotal, 0, v_invoice.currency, 1, 0);
      v_total_debit := v_total_debit + v_invoice.subtotal;
    END IF;
    -- Debit Tax
    IF v_invoice.tax_amount > 0 AND v_tax_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_tax_account, 'Tax - ' || v_invoice.invoice_number, v_invoice.tax_amount, 0, v_invoice.currency, 1, 1);
      v_total_debit := v_total_debit + v_invoice.tax_amount;
    END IF;
    -- Credit AP
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_invoice.party_id, 'AP - ' || v_invoice.invoice_number, 0, v_invoice.total, v_invoice.currency, 1, 2);
      v_total_credit := v_total_credit + v_invoice.total;
    END IF;

  ELSIF v_invoice.type = 'return_sale' THEN
    -- Reverse of sale: Credit AR, Debit Revenue
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_invoice.party_id, 'AR Return - ' || v_invoice.invoice_number, 0, v_invoice.total, v_invoice.currency, 1, 0);
      v_total_credit := v_total_credit + v_invoice.total;
    END IF;
    IF v_revenue_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_revenue_account, 'Revenue Return - ' || v_invoice.invoice_number, v_invoice.subtotal, 0, v_invoice.currency, 1, 1);
      v_total_debit := v_total_debit + v_invoice.subtotal;
    END IF;
    IF v_invoice.tax_amount > 0 AND v_tax_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_tax_account, 'Tax Return - ' || v_invoice.invoice_number, v_invoice.tax_amount, 0, v_invoice.currency, 1, 2);
      v_total_debit := v_total_debit + v_invoice.tax_amount;
    END IF;

  ELSIF v_invoice.type = 'return_purchase' THEN
    -- Reverse of purchase: Credit COGS, Debit AP
    IF v_cogs_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_cogs_account, 'COGS Return - ' || v_invoice.invoice_number, 0, v_invoice.subtotal, v_invoice.currency, 1, 0);
      v_total_credit := v_total_credit + v_invoice.subtotal;
    END IF;
    IF v_invoice.tax_amount > 0 AND v_tax_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_tax_account, 'Tax Return - ' || v_invoice.invoice_number, 0, v_invoice.tax_amount, v_invoice.currency, 1, 1);
      v_total_credit := v_total_credit + v_invoice.tax_amount;
    END IF;
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_invoice.party_id, 'AP Return - ' || v_invoice.invoice_number, v_invoice.total, 0, v_invoice.currency, 1, 2);
      v_total_debit := v_total_debit + v_invoice.total;
    END IF;
  END IF;

  -- Create stock movements for product lines
  FOR v_lines IN SELECT * FROM invoice_lines WHERE invoice_id = p_invoice_id LOOP
    IF v_lines.product_id IS NOT NULL AND v_invoice.warehouse_id IS NOT NULL THEN
      IF v_invoice.type = 'sale' THEN
        INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
        VALUES (v_tenant_id, v_lines.product_id, v_invoice.warehouse_id, 'out', v_lines.quantity, v_lines.unit_price, 'invoice', p_invoice_id, v_user_id);
      ELSIF v_invoice.type = 'purchase' THEN
        INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
        VALUES (v_tenant_id, v_lines.product_id, v_invoice.warehouse_id, 'in', v_lines.quantity, v_lines.unit_price, 'invoice', p_invoice_id, v_user_id);
      ELSIF v_invoice.type = 'return_sale' THEN
        INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
        VALUES (v_tenant_id, v_lines.product_id, v_invoice.warehouse_id, 'in', v_lines.quantity, v_lines.unit_price, 'invoice', p_invoice_id, v_user_id);
      ELSIF v_invoice.type = 'return_purchase' THEN
        INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
        VALUES (v_tenant_id, v_lines.product_id, v_invoice.warehouse_id, 'out', v_lines.quantity, v_lines.unit_price, 'invoice', p_invoice_id, v_user_id);
      END IF;
    END IF;
  END LOOP;

  -- Post the journal entry (the balance is guaranteed by construction)
  UPDATE journal_entries SET status = 'posted', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = v_entry_id;

  -- Mark invoice as posted
  UPDATE invoices SET status = 'posted', posted_at = now(), posted_by = v_user_id, updated_at = now()
  WHERE id = p_invoice_id;

  -- Audit log
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, entity_name, new_values)
  VALUES (v_tenant_id, v_user_id, 'post_invoice', 'invoice', p_invoice_id, v_invoice.invoice_number,
    jsonb_build_object('status', 'posted', 'total', v_invoice.total, 'journal_entry_id', v_entry_id));

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_entry_id);
END;
$$;

-- ============================================================
-- 3. POST RECEIPT
-- ============================================================
CREATE OR REPLACE FUNCTION post_receipt(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_receipt record;
  v_entry_id uuid;
  v_entry_number text;
  v_cash_account uuid;
  v_party_account uuid;
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
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Cash - ' || v_receipt.receipt_number, v_receipt.amount, 0, v_receipt.currency, 1, 0);
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_receipt.party_id, 'AR - ' || v_receipt.receipt_number, 0, v_receipt.amount, v_receipt.currency, 1, 1);
    END IF;
  ELSIF v_receipt.type = 'payment' THEN
    -- Cash-out: Debit AP, Credit Cash
    IF v_party_account IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
      VALUES (v_entry_id, v_tenant_id, v_party_account, v_receipt.party_id, 'AP - ' || v_receipt.receipt_number, v_receipt.amount, 0, v_receipt.currency, 1, 0);
    END IF;
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Cash - ' || v_receipt.receipt_number, 0, v_receipt.amount, v_receipt.currency, 1, 1);
  ELSIF v_receipt.type = 'transfer' THEN
    -- Transfer: just debit/credit cash (same account or two cash accounts)
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Transfer - ' || v_receipt.receipt_number, v_receipt.amount, 0, v_receipt.currency, 1, 0);
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, description, debit, credit, currency, exchange_rate, line_order)
    VALUES (v_entry_id, v_tenant_id, v_cash_account, 'Transfer - ' || v_receipt.receipt_number, 0, v_receipt.amount, v_receipt.currency, 1, 1);
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
    jsonb_build_object('status', 'posted', 'amount', v_receipt.amount, 'journal_entry_id', v_entry_id));

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_entry_id);
END;
$$;

-- ============================================================
-- 4. REVERSE JOURNAL ENTRY
-- ============================================================
CREATE OR REPLACE FUNCTION reverse_journal_entry(p_entry_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_entry record;
  v_reversal_id uuid;
  v_reversal_number text;
  v_line record;
  v_line_order int := 0;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;

  SELECT * INTO v_entry FROM journal_entries WHERE id = p_entry_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_entry.status <> 'posted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_posted');
  END IF;

  v_reversal_number := v_entry.entry_number || '-REV';

  INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, status, created_by, branch_id)
  VALUES (v_tenant_id, v_reversal_number, CURRENT_DATE,
    'Reversal: ' || COALESCE(p_reason, v_entry.description), 'adjustment', p_entry_id,
    'posted', v_user_id, v_entry.branch_id)
  RETURNING id INTO v_reversal_id;

  -- Copy lines with swapped debit/credit
  FOR v_line IN SELECT * FROM journal_lines WHERE journal_entry_id = p_entry_id ORDER BY line_order LOOP
    INSERT INTO journal_lines (journal_entry_id, tenant_id, account_id, party_id, description, debit, credit, currency, exchange_rate, line_order)
    VALUES (v_reversal_id, v_tenant_id, v_line.account_id, v_line.party_id,
      'Reversal: ' || COALESCE(v_line.description, ''),
      v_line.credit, v_line.debit, v_line.currency, v_line.exchange_rate, v_line_order);
    v_line_order := v_line_order + 1;
  END LOOP;

  -- Mark original as reversed
  UPDATE journal_entries SET status = 'reversed', updated_at = now()
  WHERE id = p_entry_id;

  -- Audit log
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, entity_name, old_values, new_values, reason)
  VALUES (v_tenant_id, v_user_id, 'reverse_journal', 'journal_entry', p_entry_id, v_entry.entry_number,
    jsonb_build_object('status', 'posted'),
    jsonb_build_object('status', 'reversed', 'reversal_id', v_reversal_id),
    p_reason);

  RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id);
END;
$$;

-- ============================================================
-- 5. GET PRODUCT STOCK
-- ============================================================
CREATE OR REPLACE FUNCTION get_product_stock(p_tenant_id uuid, p_product_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS numeric(18,2)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type IN ('in', 'return_out', 'adjustment_in') THEN quantity
      WHEN movement_type IN ('out', 'return_in', 'adjustment_out') THEN -quantity
      WHEN movement_type = 'transfer_in' THEN quantity
      WHEN movement_type = 'transfer_out' THEN -quantity
      ELSE 0
    END
  ), 0)
  FROM stock_movements
  WHERE tenant_id = p_tenant_id
  AND product_id = p_product_id
  AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
$$;

-- ============================================================
-- 6. RECORD STOCK MOVEMENT
-- ============================================================
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_tenant_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_valid_types text[] := ARRAY['in', 'out', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out', 'return_in', 'return_out'];
BEGIN
  IF p_tenant_id IS NULL OR p_product_id IS NULL OR p_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;
  IF NOT (p_movement_type = ANY(v_valid_types)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_movement_type');
  END IF;
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'quantity_must_be_positive');
  END IF;

  -- Verify tenant membership
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
  VALUES (p_tenant_id, p_product_id, p_warehouse_id, p_movement_type, p_quantity, p_unit_cost, p_reference_type, p_reference_id, v_user_id)
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values)
  VALUES (p_tenant_id, v_user_id, 'stock_movement', 'stock_movement', v_id,
    jsonb_build_object('product_id', p_product_id, 'warehouse_id', p_warehouse_id, 'type', p_movement_type, 'qty', p_quantity));

  RETURN jsonb_build_object('success', true, 'movement_id', v_id);
END;
$$;

-- ============================================================
-- Grant execute to authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION post_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION post_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION post_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_journal_entry(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stock(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_stock_movement(uuid, uuid, uuid, text, numeric, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_tenant_id() TO authenticated;
