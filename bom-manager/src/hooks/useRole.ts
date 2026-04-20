import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'user';

export function useRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRole(null);
          setUserEmail(null);
          return;
        }

        setUserEmail(user.email ?? null);

        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        setRole((data as any)?.role || 'user');
      } catch (err) {
        console.error('Failed to fetch role:', err);
        setRole('user'); // fallback
      } finally {
        setLoading(false);
      }
    };

    fetchRole();

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const isAdmin = role === 'admin' || userEmail === 'abey.thomas@bepindia.com';
  const isUser = role === 'user';

  return { role, isAdmin, isUser, loading, userEmail };
}
