// Supabase Edge Function: passive-income
// Вызывается по расписанию (Supabase Cron / pg_net раз в минуту) и начисляет data_per_hour / 60

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing Supabase service env vars' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // DEFAULT: если передан Bearer, сверяем с service key или CRON_SECRET
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc('distribute_passive_income');
    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        updatedPlayers: data ?? 0,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
