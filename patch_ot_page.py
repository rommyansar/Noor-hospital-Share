import re

with open('src/app/(dashboard)/ot-entry/page.tsx', 'r') as f:
    code = f.read()

# 1. Fix fetchAddonDeps
old_fetch = '''  // Addon Helpers
  const fetchAddonDeps = async (id: string) => {
    if(!addonRulesMap[id]) {
      const [rRes, sRes, iRes] = await Promise.all([
        fetch(`/api/rules?department_id=${id}`),
        fetch(`/api/staff?department_id=${id}`),
        fetch(`/api/daily-income?department_id=${id}&month=${monthStr}`)
      ]);
      setAddonRulesMap(prev => ({...prev, [id]: rRes.ok ? await rRes.json() : []}));
      setAddonStaffMap(prev => ({...prev, [id]: sRes.ok ? await sRes.json() : []}));
      setIncomesMap(prev => ({...prev, [id]: iRes.ok ? await iRes.json() : []}));
    }
  };'''

new_fetch = '''  // Addon Helpers
  const fetchAddonDeps = async (id: string) => {
    if(!addonRulesMap[id]) {
      const [rRes, sRes, iRes] = await Promise.all([
        fetch(`/api/rules?department_id=${id}`),
        fetch(`/api/staff?department_id=${id}`),
        fetch(`/api/daily-income?department_id=${id}&month=${monthStr}`)
      ]);
      const rData = rRes.ok ? await rRes.json() : [];
      const sData = sRes.ok ? await sRes.json() : [];
      const iData = iRes.ok ? await iRes.json() : [];
      setAddonRulesMap(prev => ({...prev, [id]: rData}));
      setAddonStaffMap(prev => ({...prev, [id]: sData}));
      setIncomesMap(prev => ({...prev, [id]: iData}));
    }
  };'''

code = code.replace(old_fetch, new_fetch)

# 2. Add Date Helpers
date_helpers = '''
  const parseUserDate = (str: string) => {
    if(!str) return null;
    const parts = str.split(/[-/]/);
    if(parts.length !== 3) return null;
    let [p1, p2, p3] = parts;
    if(p1.length === 4) return new Date(parseInt(p1), parseInt(p2)-1, parseInt(p3));
    let year = parseInt(p3);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(p2)-1, parseInt(p1));
  };

  const formatUserDate = (d: Date, template: string) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth()+1).padStart(2, '0');
    const year = d.getFullYear();
    const shortYear = String(year).slice(2);
    if (template.split(/[-/]/)[0]?.length === 4) return `${year}-${month}-${day}`;
    if (template.includes('/') || template.split('-')[2]?.length === 2) {
      return `${d.getDate()}-${d.getMonth()+1}-${shortYear}`;
    }
    return `${day}-${month}-${year}`;
  };

  const handleDateCascade = (id: string, newDateText: string) => {
    setCases(prev => {
       const next = [...prev];
       const index = next.findIndex(c => c.id === id);
       if (index === -1) return prev;
       next[index] = {...next[index], date: newDateText};
       
       let parsedDate = parseUserDate(newDateText);
       if (parsedDate && !isNaN(parsedDate.getTime())) {
          for (let i = index + 1; i < next.length; i++) {
             parsedDate.setDate(parsedDate.getDate() + 1);
             next[i] = {...next[i], date: formatUserDate(parsedDate, newDateText)};
          }
       }
       return next;
    });
  };

  const addRow = () => {
    let nextDate = `${monthStr}-01`;
    if (cases.length > 0) {
      const lastDate = cases[cases.length - 1].date;
      if (lastDate) {
        let parsed = parseUserDate(lastDate);
        if (parsed && !isNaN(parsed.getTime())) {
           parsed.setDate(parsed.getDate() + 1);
           nextDate = formatUserDate(parsed, lastDate);
        }
      }
    }
    setCases(prev => [...prev, createEmptyCase(nextDate)]);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const payload = cases.map(c => {
         let isoDate = c.date;
         const d = parseUserDate(c.date || '');
         if (d && !isNaN(d.getTime())) isoDate = d.toISOString().split('T')[0];
         return {
           ...c,
           date: isoDate,
           id: c.id?.startsWith('temp_') ? undefined : c.id
         };
      });
      await fetch('/api/ot-cases', { method: 'POST', body: JSON.stringify({ month: monthStr, cases: payload }) });
      await fetch('/api/ot-monthly-addons', { method: 'POST', body: JSON.stringify({ month: monthStr, addons }) });
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
'''

# Find insertion point and insert date helpers
code = re.sub(r'  const addRow = \(\) => \{.+?finally \{\n      setSaving\(false\);\n    \}\n  \};', date_helpers, code, flags=re.DOTALL)


# 4. Modify date input in HTML table
code = code.replace(
    '<tr>\n                  <td className="p-3"><input type="date" value={c.date || \'\'} onChange={(e) => updateCase(c.id!, \'date\', e.target.value)} className="text-input p-2 w-36 text-sm" /></td>',
    '<tr>\n                  <td className="p-3"><input type="text" placeholder="DD-MM-YY" value={c.date || \'\'} onChange={(e) => handleDateCascade(c.id!, e.target.value)} className="text-input p-2 w-32 text-sm" /></td>'
)

# Alternative replacement logic since the `<tr>` format might slightly differ exactly
code = code.replace(
    '<td className="p-3"><input type="date" value={c.date || \'\'} onChange={(e) => updateCase(c.id!, \'date\', e.target.value)} className="text-input p-2 w-36 text-sm" /></td>',
    '<td className="p-3"><input type="text" placeholder="DD-MM-YYYY" value={c.date || \'\'} onChange={(e) => handleDateCascade(c.id!, e.target.value)} className="text-input p-2 w-32 text-sm text-center" /></td>'
)

with open('src/app/(dashboard)/ot-entry/page.tsx', 'w') as f:
    f.write(code)

print("Patched completely!")

