// FX Cartel Academy — checkout Edge Function
// Replaces handleOrder()/createNewStudent()/renewExistingStudent() from
// apps-script-backend.gs. Runs with the service role key (bypasses RLS),
// since checkout happens before any student has an authenticated session.
//
// Rule carried over unchanged from the Sheets backend: a phone/email can
// buy again only if their current course has expired, or they're
// switching to a different course (an upgrade) — otherwise it's a
// genuine duplicate and is rejected.

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

function computeValidUntil(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function isValid(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const d = new Date(validUntil);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

function randomCode(prefix: string, digits: number): string {
  const max = 10 ** digits;
  const min = 10 ** (digits - 1);
  return `${prefix}-${Math.floor(Math.random() * (max - min) + min)}`;
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

  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim();
  const course = String(b.courseKey || b.course || '');
  const amount = Number(b.amount) || 0;

  const { data: byPhone } = await supabase.from('students').select('*').eq('phone', phone).maybeSingle();
  const { data: byEmail } = await supabase.from('students').select('*').ilike('email', email).maybeSingle();

  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    return json({ ok: false, error: 'phone_exists' });
  }

  const existing = byPhone || byEmail;
  const isFree = !amount;
  const paymentStatus = isFree ? 'Paid' : 'Pending';
  const paidAt = isFree ? new Date().toISOString() : null;
  const validUntil = isFree ? computeValidUntil() : null;
  const vat = Math.round((amount * 0.05) / 1.05);

  if (existing) {
    const expired = !isValid(existing.valid_until);
    const courseChanged = existing.course !== course;
    if (!expired && !courseChanged) {
      return json({ ok: false, error: byPhone ? 'phone_exists' : 'email_exists' });
    }

    const orderId = randomCode('ORD', 5);
    const { error } = await supabase
      .from('students')
      .update({
        order_id: orderId,
        name: String(b.name || ''),
        email,
        course,
        amount,
        vat,
        total: amount,
        payment_method: 'Paymob',
        paymob_ref: '',
        payment_status: paymentStatus,
        valid_until: validUntil,
        paid_at: paidAt,
        enrolled_on: new Date().toISOString(),
        status: 'Active',
        address: String(b.address || ''),
        dob: b.dob || null,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
      })
      .eq('id', existing.id);

    if (error) return json({ ok: false, error: 'db_error' }, 500);
    return json({ ok: true, orderId });
  }

  const orderId = randomCode('ORD', 5);
  const studentCode = randomCode('FXC', 4);
  const { error } = await supabase.from('students').insert({
    student_code: studentCode,
    order_id: orderId,
    name: String(b.name || ''),
    phone,
    email,
    course,
    amount,
    vat,
    total: amount,
    payment_method: 'Paymob',
    payment_status: paymentStatus,
    valid_until: validUntil,
    paid_at: paidAt,
    status: 'Active',
    address: String(b.address || ''),
    dob: b.dob || null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
  });

  if (error) {
    // Unique violation on phone/email (race with another request) surfaces here too.
    if (String(error.message).includes('duplicate key')) {
      return json({ ok: false, error: 'phone_exists' });
    }
    return json({ ok: false, error: 'db_error' }, 500);
  }
  return json({ ok: true, orderId });
});
