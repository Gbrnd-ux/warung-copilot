import { createClient } from '@supabase/supabase-js';

// Use placeholder that passes URL validation for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxOTU3MzQ1MjAwfQ.placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database tables
export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
  created_at: string;
}

export interface Order {
  id: string;
  customer_name: string;
  product_name: string;
  status: string;
  created_at: string;
}
