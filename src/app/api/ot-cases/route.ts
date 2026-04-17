import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OTCase } from '@/lib/types';

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
      .from('ot_cases')
      .select('*')
      .eq('month', month);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching OT cases:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { month, department_id, cases } = await request.json();

    if (!month || !department_id || !Array.isArray(cases)) {
      return NextResponse.json({ error: 'Invalid payload — month, department_id, and cases required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch existing cases for the month+department to find which ones to delete
    const { data: existingCases, error: fetchError } = await supabase
      .from('ot_cases')
      .select('id')
      .eq('month', month)
      .eq('department_id', department_id);

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const existingIds = existingCases?.map(c => c.id) || [];
    const incomingIds = cases.map((c: any) => c.id).filter((id: any) => id);
    
    // Find IDs to delete (exist in DB but not in payload)
    const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

    // 2. Delete removed cases
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('ot_cases')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    // 3. Separate new rows from existing rows
    if (cases.length > 0) {
      const buildRow = (c: any, id?: string) => ({
        ...(id ? { id } : {}),
        month,
        department_id,
        date: c.date,
        case_type: c.case_type || 'Major',
        amount: parseFloat(c.amount) || 0,
        doctor_id: c.doctor_id || null,
        doctor_pct: parseFloat(c.doctor_pct) || 0,
        assist_doctor_ids: Array.isArray(c.assist_doctor_ids) ? c.assist_doctor_ids : [],
        assist_doctor_pct: parseFloat(c.assist_doctor_pct) || 0,
        assist_doctor_mode: c.assist_doctor_mode || 'group',
        assist_nurse_ids: Array.isArray(c.assist_nurse_ids) ? c.assist_nurse_ids : [],
        assist_nurse_pct: parseFloat(c.assist_nurse_pct) || 0,
        assist_nurse_mode: c.assist_nurse_mode || 'group',
        paramedical_ids: Array.isArray(c.paramedical_ids) ? c.paramedical_ids : [],
        paramedical_pct: parseFloat(c.paramedical_pct) || 0,
        paramedical_mode: c.paramedical_mode || 'group',
      });

      const toUpdate = cases.filter((c: any) => c.id && !String(c.id).startsWith('temp_'));
      const toInsert = cases.filter((c: any) => !c.id || String(c.id).startsWith('temp_'));

      // Insert new rows (no id — DB generates UUID)
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('ot_cases')
          .insert(toInsert.map((c: any) => buildRow(c)));
        if (insertError) throw new Error(`Insert error: ${insertError.message}`);
      }

      // Update existing rows
      if (toUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('ot_cases')
          .upsert(toUpdate.map((c: any) => buildRow(c, c.id)))
          .select();
        if (updateError) throw new Error(`Update error: ${updateError.message}`);
      }
    }

    return NextResponse.json({ success: true, message: 'OT Cases saved successfully' });
  } catch (err: any) {
    console.error('Error saving OT cases:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
