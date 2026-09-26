import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient'; // تم ضبط المسار ليتوافق مع هيكلة المجلدات لديك
import type { Profile, Tenant, TenantMember, Role } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  tenantMember: TenantMember | null;
  role: Role | null;
  loading: boolean;
  isOwner: boolean;
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

  async function loadUserData(userId: string) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    setProfile(profileData as Profile | null);

    if (profileData?.tenant_id) {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profileData.tenant_id)
        .maybeSingle();

      setTenant(tenantData as Tenant | null);
      setIsOwner((tenantData as Tenant | null)?.is_owner ?? false);

      const { data: memberData } = await supabase
        .from('tenant_members')
        .select('*')
        .eq('tenant_id', profileData.tenant_id)
        .eq('user_id', userId)
        .maybeSingle();

      setTenantMember(memberData as TenantMember | null);

      if (memberData?.role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('*')
          .eq('id', memberData.role_id)
          .maybeSingle();
        setRole(roleData as Role | null);
      }
    } else {
      setTenant(null);
      setTenantMember(null);
      setRole(null);
      setIsOwner(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
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
        }
        setLoading(false);
      })();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function refreshProfile() {
    if (user) {
      await loadUserData(user.id);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, tenant, tenantMember, role, loading, isOwner, signOut, refreshProfile }}
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
