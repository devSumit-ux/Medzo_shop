import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://egcmmspwptftbcjrfock.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnY21tc3B3cHRmdGJjanJmb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg4MzUsImV4cCI6MjA4NTg0NDgzNX0.BxQjbvhgOcE53_VoyllrFUzFgTXNaoSLR7d5dN-xA44';

export const supabase = createClient(supabaseUrl, supabaseKey);