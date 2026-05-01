import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dxxeaesaofdutyriouox.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eGVhZXNhb2ZkdXR5cmlvdW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzQ0NDksImV4cCI6MjA5MzIxMDQ0OX0.UhBrbr3HRiFhYjSKn50tR40-6u2pmCYsXSG7O95-h0Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);