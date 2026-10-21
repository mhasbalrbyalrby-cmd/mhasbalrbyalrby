import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addonModuleCodes, canAccessModuleWithEntitlements } from '@/lib/module-access';

type TenantModuleRow = {
  is_enabled: boolean;
  modules: { code: string } | { code: string }[] | null;
};

/**
 * Shared client-side module gate for both route rendering and navigation.
 * Entitlements fail closed: an unavailable tenant_modules query never grants an addon.
 */
export function useModuleAccess(
  tenantId: string | null | undefined,
  roleName: string,
  isOwner: boolean,
) {
  const [enabledAddons, setEnabledAddons] = useState<Set<string>>(() => new Set());
  const [entitlementsLoaded, setEntitlementsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEnabledAddons(new Set());

    if (isOwner || !tenantId) {
      setEntitlementsLoaded(true);
      return () => { cancelled = true; };
    }

    setEntitlementsLoaded(false);
    if (!supabase) {
      setEntitlementsLoaded(true);
      return () => { cancelled = true; };
    }

    void (async () => {
      const { data, error } = await supabase
        .from('tenant_modules')
        .select('is_enabled, modules!inner(code)')
        .eq('tenant_id', tenantId)
        .eq('is_enabled', true);

      if (cancelled) return;
      if (error || !data) {
        // Empty set plus loaded=true intentionally denies all optional modules.
        setEnabledAddons(new Set());
        setEntitlementsLoaded(true);
        return;
      }

      const codes = new Set<string>();
      (data as TenantModuleRow[]).forEach((row) => {
        const module = Array.isArray(row.modules) ? row.modules[0] : row.modules;
        if (row.is_enabled && module?.code && addonModuleCodes.includes(module.code as (typeof addonModuleCodes)[number])) {
          codes.add(module.code);
        }
      });
      setEnabledAddons(codes);
      setEntitlementsLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [tenantId, isOwner]);

  const canAccess = (moduleCode: string) =>
    canAccessModuleWithEntitlements(moduleCode, roleName, isOwner, enabledAddons, entitlementsLoaded);

  return { canAccess, entitlementsLoaded };
}
