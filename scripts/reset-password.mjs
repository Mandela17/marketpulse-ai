// Reset password for a Supabase user using Admin API
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://khubocuivplelonooodv.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtodWJvY3VpdnBsZWxvbm9vb2R2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjEzNzE3NywiZXhwIjoyMDk3NzEzMTc3fQ.vszfzHdrE0L5vsk_V6Y_QPtI4wCsrJgscWE4JZBSAjQ';

const TARGET_EMAIL = 'mendela4cazz@gmail.com';
const NEW_PASSWORD = 'Now@2026';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function resetPassword() {
  console.log(`\n🔍 Looking up user: ${TARGET_EMAIL}...`);

  // Step 1: Find the user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error('❌ Failed to list users:', listError.message);
    process.exit(1);
  }

  const user = users.find(u => u.email === TARGET_EMAIL);

  if (!user) {
    console.error(`❌ User with email "${TARGET_EMAIL}" not found in Supabase Auth.`);
    console.log(`\nAvailable users:`);
    users.forEach(u => console.log(`  - ${u.email} (${u.id})`));
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (UID: ${user.id})`);

  // Step 2: Update the password
  console.log(`🔑 Resetting password...`);
  const { data, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: NEW_PASSWORD,
  });

  if (updateError) {
    console.error('❌ Failed to reset password:', updateError.message);
    process.exit(1);
  }

  console.log(`\n✅ Password reset successful!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Email:    ${TARGET_EMAIL}`);
  console.log(`   Password: ${NEW_PASSWORD}`);
  console.log(`   Role:     super_admin`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nYou can now log in to MarketPulse with these credentials.\n`);
}

resetPassword();
