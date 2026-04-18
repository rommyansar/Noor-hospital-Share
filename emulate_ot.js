const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const month = '2026-03';
  const department_id = 'd4e125db-01d4-40dc-ae9e-0c80fc366dc6';
  
  const { data: otCases } = await supabase.from('ot_cases').select('*').eq('month', month).eq('department_id', department_id);
  const { data: allStaff } = await supabase.from('staff').select('id, name, role').eq('is_active', true);
  
  const staffShares = {};
  const addShare = (staffId, share, caseAmount, pct, mode, groupCount, caseType, roleType) => {
    if (!staffId || share <= 0) return;
    if (!staffShares[staffId]) staffShares[staffId] = { total_share: 0, total_working_amount: 0, case_breakdowns: [] };
    staffShares[staffId].total_share += share;
    staffShares[staffId].total_working_amount += caseAmount;
    staffShares[staffId].case_breakdowns.push({ case_type: caseType, role_type: roleType, amount: caseAmount, pct, mode, group_count: groupCount, share });
  };
  
  for (const c of otCases) {
    const amt = parseFloat(c.amount) || 0;
    if (amt <= 0) continue;
    const caseType = c.case_type || 'Major';
    
    // helper simulating logic
    const processRole = (ids, pctRaw, mode, roleType) => {
      if (!ids || ids.length === 0) return;
      const pct = parseFloat(pctRaw) || 0;
      const totalShare = Math.round((amt * pct / 100) * 100) / 100;
      if (mode === 'group') {
        const perPerson = Math.round((totalShare / ids.length) * 100) / 100;
        ids.forEach(id => addShare(id, perPerson, amt, pct, 'group', ids.length, caseType, roleType));
      } else {
        ids.forEach(id => addShare(id, totalShare, amt, pct, 'individual', 1, caseType, roleType));
      }
    };
    
    if (c.doctor_id) {
       const pct = parseFloat(c.doctor_pct) || 0;
       const share = Math.round((amt * pct / 100) * 100) / 100;
       addShare(c.doctor_id, share, amt, pct, 'individual', 1, caseType, 'Doctor');
    }
    processRole(c.assist_doctor_ids || [], c.assist_doctor_pct, c.assist_doctor_mode || 'group', 'Assist Doctor');
    processRole(c.assist_nurse_ids || [], c.assist_nurse_pct, c.assist_nurse_mode || 'group', 'Assist Nurse');
    processRole(c.paramedical_ids || [], c.paramedical_pct, c.paramedical_mode || 'group', 'Paramedical');
  }
  
  console.log("Calculated shares:", JSON.stringify(staffShares, null, 2));
}
run();
