'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'super_admin' | 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'revoked' | 'loading';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: UserRole;
  userStatus: UserStatus;
  isAdmin: boolean;
  watchlist: string[];
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  toggleWatchlist: (symbol: string) => Promise<void>;
  setWatchlist: (list: string[]) => void;
  refreshUserStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_WATCHLIST = [
  'RELIANCE', 'TATAMOTORS', 'ADANIGREEN', 'HAL', 'TITAN',
  'HDFCBANK', 'TCS', 'NTPC', 'OLECTRA', 'MARUTI',
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlistState] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [userStatus, setUserStatus] = useState<UserStatus>('loading');

  // Load initial watchlist from localStorage safely
  const getLocalWatchlist = (): string[] => {
    if (typeof window === 'undefined') return DEFAULT_WATCHLIST;
    const saved = localStorage.getItem('marketpulse_watchlist');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_WATCHLIST;
      }
    }
    return DEFAULT_WATCHLIST;
  };

  // Set watchlist state and local storage helper
  const setWatchlist = (list: string[]) => {
    setWatchlistState(list);
    if (typeof window !== 'undefined') {
      localStorage.setItem('marketpulse_watchlist', JSON.stringify(list));
    }
  };

  // Sync watchlist to Supabase user metadata
  const syncWatchlistToCloud = async (list: string[]) => {
    try {
      await supabase.auth.updateUser({
        data: { watchlist: list }
      });
    } catch (e) {
      console.error('[AuthContext] Failed to sync watchlist to cloud:', e);
    }
  };

  // Check user approval status from server
  const checkUserStatus = async (accessToken: string) => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.role || 'user');
        setUserStatus(data.status || 'pending');
      } else {
        setUserStatus('pending');
      }
    } catch {
      setUserStatus('pending');
    }
  };

  // Public: refresh user status (called after admin approves)
  const refreshUserStatus = async () => {
    if (session?.access_token) {
      await checkUserStatus(session.access_token);
    }
  };

  // Main listener for auth state change
  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      setLoading(false);

      if (currentUser && currentSession?.access_token) {
        await checkUserStatus(currentSession.access_token);
      } else {
        setUserStatus('loading');
        setUserRole('user');
      }

      // After email confirmation, clean up the URL hash
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.access_token) {
        checkUserStatus(session.access_token);
      }
    }).catch(() => {
      if (!isMounted) return;
      setLoading(false);
    });

    const timeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 8000);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Sync logic when user logs in/out
  useEffect(() => {
    const local = getLocalWatchlist();

    if (user) {
      const cloud = user.user_metadata?.watchlist as string[] | undefined;
      if (cloud && Array.isArray(cloud)) {
        const merged = Array.from(new Set([...local, ...cloud]));
        setWatchlist(merged);
        if (merged.length > cloud.length) {
          syncWatchlistToCloud(merged);
        }
      } else {
        setWatchlist(local);
        syncWatchlistToCloud(local);
      }
    } else {
      setWatchlist(local);
    }
  }, [user]);

  // Sign In
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  // Sign Up
  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  // Sign Out
  const signOut = async () => {
    setUserStatus('loading');
    setUserRole('user');
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  // Toggle watchlist
  const toggleWatchlist = async (symbol: string) => {
    const cleanSymbol = symbol.toUpperCase();
    let updatedList: string[];

    if (watchlist.includes(cleanSymbol)) {
      updatedList = watchlist.filter(s => s !== cleanSymbol);
    } else {
      updatedList = [...watchlist, cleanSymbol];
    }

    setWatchlist(updatedList);

    if (user) {
      await syncWatchlistToCloud(updatedList);
    }
  };

  const isAdmin = userRole === 'super_admin' || userRole === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        userRole,
        userStatus,
        isAdmin,
        watchlist,
        signIn,
        signUp,
        signOut,
        toggleWatchlist,
        setWatchlist,
        refreshUserStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
