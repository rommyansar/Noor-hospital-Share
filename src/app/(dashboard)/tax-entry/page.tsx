'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { createClient } from '@/lib/supabase/client';
import { Save, Search, Calculator } from 'lucide-react';

interface TaxRecord {
  ind: string;
  ch: number;
  aam_musi: number;
  j_sal: number;
  inc_tax: number;
}

interface StaffData {
  id: string;
  name: string;
  staff_code: string;
}

export default function TaxEntryPage() {
  const [taxes, setTaxes] = useState<Record<string, TaxRecord>>({});
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name, staff_code')
        .eq('is_active', true)
        .order('staff_code', { ascending: true });

      if (staffError) throw staffError;
      
      const validStaff = (staffData || []).filter(s => !!s.staff_code);
      setStaff(validStaff);

      // 2. Fetch taxes
      const res = await fetch('/api/taxes');
      if (!res.ok) throw new Error('Failed to load tax data');
      const taxData: TaxRecord[] = await res.json();
      
      const taxMap: Record<string, TaxRecord> = {};
      taxData.forEach(t => {
        if (t.ind) taxMap[t.ind] = t;
      });

      // Ensure every staff member has a record in our UI state
      const initialTaxes: Record<string, TaxRecord> = {};
      validStaff.forEach(s => {
        initialTaxes[s.staff_code] = taxMap[s.staff_code] || {
          ind: s.staff_code,
          ch: 0,
          aam_musi: 0,
          j_sal: 0,
          inc_tax: 0
        };
      });

      setTaxes(initialTaxes);
    } catch (err: any) {
      console.error(err);
      addToast('error', err.message || 'An error occurred loading data.');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert map back to array
      const taxArray = Object.values(taxes);
      const res = await fetch('/api/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxArray),
      });

      if (!res.ok) throw new Error('Failed to save tax data');
      
      addToast('success', 'Tax data saved successfully');
    } catch (err: any) {
      console.error(err);
      addToast('error', err.message || 'Failed to save.');
    }
    setSaving(false);
  };

  const updateTax = (ind: string, field: keyof TaxRecord, value: string) => {
    const num = parseInt(value) || 0;
    setTaxes(prev => ({
      ...prev,
      [ind]: {
        ...prev[ind],
        [field]: num
      }
    }));
  };

  const filteredStaff = staff.filter(s => {
    const term = searchTerm.toLowerCase();
    return (s.name.toLowerCase().includes(term) || s.staff_code.toLowerCase().includes(term));
  });

  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calculator className="text-emerald-400" />
            Tax Entry
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage fixed monthly tax deductions for staff.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving || loading}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Taxes'}
        </button>
      </div>

      <div className="glass-card p-4">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or IND no..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', maxHeight: '65vh' }}>
            <table className="data-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>IND No.</th>
                  <th style={{ width: '220px' }}>Staff Name</th>
                  <th style={{ textAlign: 'center' }}>CH.AAM</th>
                  <th style={{ textAlign: 'center' }}>MUSI</th>
                  <th style={{ textAlign: 'center' }}>J.SAL</th>
                  <th style={{ textAlign: 'center' }}>INC.TAX</th>
                  <th style={{ textAlign: 'right', width: '120px' }}>Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-400 py-8">
                      No staff found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s) => {
                    const t = taxes[s.staff_code];
                    if (!t) return null;
                    const total = t.ch + t.aam_musi + t.j_sal + t.inc_tax;
                    
                    return (
                      <tr key={s.id}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', fontWeight: 500 }}>
                          {s.staff_code}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>{s.name}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input-field"
                            style={{ width: '90px', padding: '6px 8px', textAlign: 'right' }}
                            value={t.ch === 0 ? '' : t.ch}
                            onChange={(e) => updateTax(s.staff_code, 'ch', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input-field"
                            style={{ width: '90px', padding: '6px 8px', textAlign: 'right' }}
                            value={t.aam_musi === 0 ? '' : t.aam_musi}
                            onChange={(e) => updateTax(s.staff_code, 'aam_musi', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input-field"
                            style={{ width: '90px', padding: '6px 8px', textAlign: 'right' }}
                            value={t.j_sal === 0 ? '' : t.j_sal}
                            onChange={(e) => updateTax(s.staff_code, 'j_sal', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input-field"
                            style={{ width: '90px', padding: '6px 8px', textAlign: 'right' }}
                            value={t.inc_tax === 0 ? '' : t.inc_tax}
                            onChange={(e) => updateTax(s.staff_code, 'inc_tax', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: total > 0 ? '#f87171' : '#475569', fontSize: '15px' }}>
                          {total > 0 ? `₹${total.toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
