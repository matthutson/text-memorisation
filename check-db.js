import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://quxjesuarzbqqoahogma.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eGplc3VhcnpicXFvYWhvZ21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0MDM3NjgsImV4cCI6MjA0Nzk3OTc2OH0.KmF3bM-WS_lBK4f8x8Qd6AtwRjQ2jqHGZWN13CrTnWE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('Checking texts in database...');
  
  const { data: texts, error: textsError } = await supabase
    .from('texts')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (textsError) {
    console.error('Error fetching texts:', textsError);
  } else {
    console.log(`Found ${texts.length} texts:`, texts);
  }
  
  console.log('\nChecking folders in database...');
  const { data: folders, error: foldersError } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (foldersError) {
    console.error('Error fetching folders:', foldersError);
  } else {
    console.log(`Found ${folders.length} folders:`, folders);
  }
}

checkDatabase().then(() => process.exit(0));
