عنimport { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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

  const loadInProgress = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
setAuthError('no_tenant');
return;
      }

      if (!profileData.tenant_id) {
        setTenant(null)
      setAuthError('no_tenant');
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profileData.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;
      if (!mountedRef.current) return;

      setTenant(tenantData as Tenant | null);

      const { data: memberData, error: memberError } = await supabase
        .from('tenant_members')
        .select('*')
        .eq('tenant_id', profileData.tenant_id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (memberError) throw memberError;
      if (!mountedRef.current) return;

      setTenantMember(memberData as TenantMember | null);

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
        if (!mountedRef.current) return;

        setRole(roleData as Role | null);
      } else {
        setRole(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setAuthError('load_failed');
    } finally {
      loadInProgress.current = false;
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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id).finally(() => {
          if (mountedRef.current) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      if (mountedRef.current) {
        setLoading(false);
        setAuthError('session_failed');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        if (!mountedRef.current) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await loadUserData(newSession.user.id);
        } else {
          setProfile(null);
          setTenant(null);
          setTenantMember(null);
          setRole(null);
          setIsOwner(false);
          setAuthError(null);
        }
        if (mountedRef.current) setLoading(false);
      })();
    });

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
    if (supabase) await supabase.auth.signOut();
  }

  const authReady = !authError && !!profile && !!profile.tenant_id && !!tenantMember;

  return (
    <AuthContext.Provider
      value={{ session, user, profile, tenant, tenantMember, role, loading, isOwner, configError: supabaseConfigError, authError, authReady, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
