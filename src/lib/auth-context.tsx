import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from './supabase';
import type { Profile, Tenant, TenantMember, Role } from '@/types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  tenantMember: TenantMember | null;
  role: Role | null;
  loading: boolean;
  isOwner: boolean;
  configError: string | null;
  authError: string | null;
  authReady: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantMember, setTenantMember] = useState<TenantMember | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadRequestId = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadUserData(userId: string) {
    if (!supabase) return;
    // Each auth transition supersedes earlier requests so stale responses cannot
    // overwrite the current user's state. Concurrent session checks are allowed.
    const requestId = ++loadRequestId.current;

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!mountedRef.current || requestId !== loadRequestId.current) return;

      if (!profileData) {
        setProfile(null);
        setTenant(null);
        setTenantMember(null);
        setRole(null);
        setIsOwner(false);
        setAuthError('profile_not_found');
        return;
      }

      // Resolve the active tenant from the profile first. Some valid users,
      // including system owners, have profile.tenant_id = NULL but do have
      // an active tenant_members row. Resolve that relationship without
      // writing anything to the database.
      let resolvedTenantId: string | null = profileData.tenant_id ?? null;
      let memberData: TenantMember | null = null;

      if (resolvedTenantId) {
        const { data, error: memberError } = await supabase
          .from('tenant_members')
          .select('*')
          .eq('tenant_id', resolvedTenantId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        if (memberError) throw memberError;
        memberData = data as TenantMember | null;
      } else {
        const { data, error: memberError } = await supabase
          .from('tenant_members')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (memberError) throw memberError;
        memberData = data as TenantMember | null;
        resolvedTenantId = memberData?.tenant_id ?? null;
      }

      // A sign-in/sign-out or account switch may have happened while membership
      // was loading. Do not let this request update any auth state if superseded.
      if (!mountedRef.current || requestId !== loadRequestId.current) return;

      if (!resolvedTenantId) {
        setProfile(profileData as Profile);
        setTenant(null);
        setTenantMember(null);
        setRole(null);
        setIsOwner(false);
        setAuthError('no_tenant');
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', resolvedTenantId)
        .maybeSingle();

      if (tenantError) throw tenantError;
      if (!mountedRef.current || requestId !== loadRequestId.current) return;

      // Publish profile/tenant state only after this request is still current.
      // This does not update profiles.tenant_id in Supabase.
      setProfile({ ...(profileData as Profile), tenant_id: resolvedTenantId });
      setTenant(tenantData as Tenant | null);
      setTenantMember(memberData);

      const tenantIsOwner = (tenantData as Tenant | null)?.is_owner ?? false;
      setIsOwner(tenantIsOwner && !!memberData);

      if (!memberData) {
        setRole(null);
        setAuthError('no_membership');
        return;
      }

      setAuthError(null);

      if (memberData.role_id) {
        const { data: roleData, error: roleError } = await supabase
          .from('roles')
          .select('*')
          .eq('id', memberData.role_id)
          .maybeSingle();

        if (roleError) throw roleError;
        if (!mountedRef.current || requestId !== loadRequestId.current) return;

        setRole(roleData as Role | null);
      } else {
        setRole(null);
      }
    } catch (err) {
      if (!mountedRef.current || requestId !== loadRequestId.current) return;
      // Keep the UI error generic, but preserve diagnostic details for debugging.
      console.error('[AuthContext] Failed to load authenticated user data:', err);
      setAuthError('load_failed');
    } finally {
      // Only the newest request may end the loading state.
      if (mountedRef.current && requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!supabase || supabaseConfigError) {
      setLoading(false);
      return;
    }

    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved && !mountedRef.current) return;
      if (!resolved) {
        setLoading(false);
      }
    }, 10000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);

        if (!mountedRef.current) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          void loadUserData(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);

        if (mountedRef.current) {
          setLoading(false);
          setAuthError('session_failed');
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        (async () => {
          if (!mountedRef.current) return;

          // If an auth event arrives before getSession() resolves, the event is
          // the newer source of truth; ignore the pending initial session result.
          resolved = true;
          clearTimeout(timeoutId);

          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (newSession?.user) {
            setLoading(true);
            await loadUserData(newSession.user.id);
          } else {
            // Invalidate any in-flight profile/tenant requests after sign-out.
            loadRequestId.current += 1;
            setProfile(null);
            setTenant(null);
            setTenantMember(null);
            setRole(null);
            setIsOwner(false);
            setAuthError(null);
            setLoading(false);
          }
        })();
      }
    );

    return () => {
      clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function refreshProfile() {
    if (user) {
      await loadUserData(user.id);
    }
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
  }

  const authReady = !authError && !!profile && !!tenant?.id && !!tenantMember;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        tenant,
        tenantMember,
        role,
        loading,
        isOwner,
        configError: supabaseConfigError,
        authError,
        authReady,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}
