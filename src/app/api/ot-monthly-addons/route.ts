import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const departmentId = searchParams.get('department_id');

    if (!month) {
      return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    let query = supabase
      .from('ot_monthly_addons')
      .select('*')
      .eq('month', month);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching OT monthly addons:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { month, department_id, addons } = await request.json();

    if (!month || !department_id || !Array.isArray(addons)) {
      return NextResponse.json({ error: 'Invalid payload — month, department_id, and addons required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // 1. Delete all existing addons for the month + department
    const { error: deleteError } = await supabase
      .from('ot_monthly_addons')
      .delete()
      .eq('month', month)
      .eq('department_id', department_id);

    if (deleteError) {
      console.error('Error deleting old OT addons:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 2. Insert new ones
    if (addons.length > 0) {
      const payload = addons.map((a: any) => ({
        month,
        department_id,
        addon_department_id: a.addon_department_id,
        percentage: parseFloat(a.percentage) || 0,
        calculation_type: a.calculation_type || 'individual',
        attendance_rule: a.attendance_rule || 'none',
        applied_rules: a.applied_rules || [],
        amount_source: a.amount_source || 'TDA',
        manual_amount: a.manual_amount || null
      }));

      const { error: insertError } = await supabase
        .from('ot_monthly_addons')
        .insert(payload);

      if (insertError) {
        console.error('Error inserting OT addons:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Exception saving OT addons:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
