import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log('Supabase Anon Key prefix:', supabaseAnonKey ? supabaseAnonKey.substring(0, 10) : 'undefined');
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
