```tsx
async function loadUserData(userId: string) {
  if (!supabase || loadInProgress.current) return;
  loadInProgress.current = true;

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!mountedRef.current) return;

    setProfile(profileData as Profile | null);

    if (!profileData) {
      setTenant(null);
      setTenantMember(null);
      setRole(null);
      setIsOwner(false);
      setAuthError('profile_not_found');
      return;
    }

    // استخدم المؤسسة الموجودة في الملف الشخصي إن وُجدت،
    // وإلا ابحث عن العضوية الأساسية النشطة للمستخدم.
    let memberQuery = supabase
      .from('tenant_members')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (profileData.tenant_id) {
      memberQuery = memberQuery.eq('tenant_id', profileData.tenant_id);
    } else {
      memberQuery = memberQuery.eq('is_primary', true);
    }

    const { data: memberData, error: memberError } =
      await memberQuery.maybeSingle();

    if (memberError) throw memberError;
    if (!mountedRef.current) return;

    setTenantMember(memberData as TenantMember | null);

    if (!memberData) {
      setTenant(null);
      setRole(null);
      setIsOwner(false);
      setAuthError(
        profileData.tenant_id ? 'no_membership' : 'no_tenant'
      );
      return;
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', memberData.tenant_id)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!mountedRef.current) return;

    setTenant(tenantData as Tenant | null);

    if (!tenantData) {
      setRole(null);
      setIsOwner(false);
      setAuthError('tenant_not_found');
      return;
    }

    setIsOwner(
      (tenantData as Tenant).is_owner === true &&
      memberData.status === 'active'
    );

    if (memberData.role_id) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', memberData.role_id)
        .maybeSingle();

      if (roleError) throw roleError;
      if (!mountedRef.current) return;

      setRole(roleData as Role | null);
    } else {
      setRole(null);
    }

    setAuthError(null);
  } catch (err) {
    if (!mountedRef.current) return;

    console.error('Failed to load user data:', err);
    setAuthError('load_failed');
    setIsOwner(false);
  } finally {
    loadInProgress.current = false;
  }
}
```
