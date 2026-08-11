// FX Cartel Academy — contact Edge Function
// Replaces handleContact()/findLeadByPhoneOrEmail() from apps-script-backend.gs.
// One Leads row per mobile OR email — a repeat submission from either
// refreshes the existing row and bumps `flags` instead of forking a
// duplicate, so the frontend can show "already received" instead of the
// normal thank-you message.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const name = String(b.name || '');
  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim();
  const message = String(b.message || '');

  let existingQuery = supabase.from('leads').select('*').limit(1);
  if (phone && email) {
    existingQuery = existingQuery.or(`phone.eq.${phone},email.ilike.${email}`);
  } else if (phone) {
    existingQuery = existingQuery.eq('phone', phone);
  } else if (email) {
    existingQuery = existingQuery.ilike('email', email);
  }
  const { data: existingRows } = phone || email ? await existingQuery : { data: null };
  const existing = existingRows && existingRows[0];

  if (existing) {
    const flags = (Number(existing.flags) || 1) + 1;
    const { error } = await supabase
      .from('leads')
      .update({ name, phone, email, message, status: 'New', flags })
      .eq('id', existing.id);
    if (error) return json({ ok: false, error: 'db_error' }, 500);
    return json({ ok: true, duplicate: true, flags });
  }

  const { error } = await supabase
    .from('leads')
    .insert({ name, phone, email, message, source: 'Website form', status: 'New', flags: 1 });
  if (error) return json({ ok: false, error: 'db_error' }, 500);
  return json({ ok: true, duplicate: false, flags: 1 });
});
