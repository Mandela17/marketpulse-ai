// Supabase Client for MarketPulse AI
// Provides read-only (anon) and server-side (service_role) clients

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-for-build.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Client-side Supabase client (read-only via RLS policies)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (can insert/update via service_role)
// Only use this in API routes — never expose service_role key to browser
let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) {
    console.warn('[Supabase] No SUPABASE_SERVICE_ROLE_KEY found, using anon client');
    return supabase;
  }
  
  _serviceClient = createClient(supabaseUrl, serviceKey);
  return _serviceClient;
}
