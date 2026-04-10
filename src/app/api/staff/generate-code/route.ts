import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');

  if (!role) {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 });
  }

  // 1. Map role to prefix
  let prefix = 'STF';
  const lowerRole = role.toLowerCase();
  if (lowerRole.includes('doctor') || lowerRole.includes('dr')) {
    prefix = 'DOC';
  } else if (lowerRole.includes('nurse')) {
    prefix = 'NUR';
  } else if (lowerRole.includes('technician') || lowerRole.includes('tech')) {
    prefix = 'TEC';
  }

  try {
    const supabase = await createServerSupabaseClient();

    // 2. Query existing staff with this prefix
    const { data: staff, error } = await supabase
      .from('staff')
      .select('staff_code')
      .like('staff_code', `${prefix}-%`);

    if (error) {
      console.error('Error fetching staff codes:', error);
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }

    // 3. Find highest numeric suffix
    let maxNum = 0;
    if (staff && staff.length > 0) {
      for (const s of staff) {
        if (!s.staff_code) continue;
        const parts = s.staff_code.split('-');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    // 4. Increment and format
    const nextNum = maxNum + 1;
    const nextCode = `${prefix}-${nextNum.toString().padStart(3, '0')}`;

    return NextResponse.json({ code: nextCode });
  } catch (err: any) {
    console.error('API Error generating code:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
