'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  watchlist: string[];
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  toggleWatchlist: (symbol: string) => Promise<void>;
  setWatchlist: (list: string[]) => void;
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

  // Main listener for auth state change
  useEffect(() => {
    let isMounted = true;

    // 1. Set up the auth state change listener FIRST
    //    This is critical for hash-based auth callbacks (email confirmation)
    //    where Supabase redirects to /#access_token=...
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      setLoading(false);

      // After email confirmation, clean up the URL hash
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        // Replace the URL to remove the token hash without triggering navigation
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    // 2. Then get initial session — this also triggers hash fragment parsing
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!isMounted) return;
      setLoading(false);
    });

    // 3. Safety timeout: never let the loading screen hang more than 8 seconds
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
      // User logged in: sync local and cloud watchlists
      const cloud = user.user_metadata?.watchlist as string[] | undefined;
      if (cloud && Array.isArray(cloud)) {
        // Merge lists to preserve both locally added and cloud-saved stocks
        const merged = Array.from(new Set([...local, ...cloud]));
        setWatchlist(merged);
        
        // If there were new local items, sync the merged list back to cloud
        if (merged.length > cloud.length) {
          syncWatchlistToCloud(merged);
        }
      } else {
        // First time cloud sync: upload existing local watchlist to user metadata
        setWatchlist(local);
        syncWatchlistToCloud(local);
      }
    } else {
      // User is logged out: load local watchlist only
      setWatchlist(local);
    }
  }, [user]);

  // Sign In Method
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // Sign Up Method
  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  // Sign Out Method
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  // Toggle watchlist item (updates local and cloud dynamically)
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

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        watchlist,
        signIn,
        signUp,
        signOut,
        toggleWatchlist,
        setWatchlist,
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
