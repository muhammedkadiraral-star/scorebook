import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('users').select('avatar_url').limit(1);
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Success. avatar_url exists. Data:", data);
  }
}
check();
