const fs = require('fs');

const file_path = 'src/app/(dashboard)/monthly-entry/page.tsx';
let content = fs.readFileSync(file_path, 'utf8');

// I want to replace the `addons.map((addon` object initialization
content = content.replace(
  /setAddons\(\[\.\.\.addons, \{ addon_department_id: '', percentage: 0, calculation_type: 'individual', attendance_rule: 'none' \}\]\)/g,
  "setAddons([...addons, { addon_department_id: '', percentage: 0, calculation_type: 'individual', attendance_rule: 'none', amount_source: 'TDA', manual_amount: '' }])"
);

// I want to inject the amount source div after the "Apply To Rules" section
const searchAnchor = `                      {addon.addon_department_id && (
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label className="form-label text-xs" style={{ margin: 0, fontWeight: 600 }}>Attendance Rule (Inside Add-On):</label>`;

const replacementText = `                      {/* Row 3: Amount Source & Attendance Config */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-700/30">
                        {/* Amount Source Control */}
                        <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                          <label className="form-label text-xs mb-2">Amount Source</label>
                          <div className="flex gap-2 mb-3">
                            <button
                              className="flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all"
                              style={{
                                background: (addon.amount_source || 'TDA') === 'TDA' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                                color: (addon.amount_source || 'TDA') === 'TDA' ? '#60a5fa' : '#64748b',
                                border: (addon.amount_source || 'TDA') === 'TDA' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(71, 85, 105, 0.3)',
                              }}
                              onClick={() => {
                                const next = [...addons];
                                next[index].amount_source = 'TDA';
                                setAddons(next);
                              }}
                            >
                              TDA
                            </button>
                            <button
                              className="flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all"
                              style={{
                                background: addon.amount_source === 'MANUAL' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                                color: addon.amount_source === 'MANUAL' ? '#10b981' : '#64748b',
                                border: addon.amount_source === 'MANUAL' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(71, 85, 105, 0.3)',
                              }}
                              onClick={() => {
                                const next = [...addons];
                                next[index].amount_source = 'MANUAL';
                                setAddons(next);
                              }}
                            >
                              Manual Amount
                            </button>
                          </div>
                          
                          {addon.amount_source === 'MANUAL' && (
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>₹</span>
                              <input
                                type="number"
                                className="text-input"
                                style={{ paddingLeft: '22px', height: '32px', fontSize: '13px', width: '100%' }}
                                value={addon.manual_amount !== undefined && addon.manual_amount !== null ? addon.manual_amount : ''}
                                onChange={(e) => {
                                  const next = [...addons];
                                  next[index].manual_amount = e.target.value;
                                  setAddons(next);
                                }}
                                placeholder="Enter manual amount"
                                min="0"
                                step="0.01"
                              />
                              <p style={{ fontSize: '10px', color: '#10b981', marginTop: '4px' }}>Ignores main {deptName} TDA completely.</p>
                            </div>
                          )}
                          {(addon.amount_source || 'TDA') === 'TDA' && (
                            <p style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Base pool scales dynamically with {deptName} TDA.</p>
                          )}
                        </div>

                        {/* Addon Attendance Rule */}
                        <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                          <label className="form-label text-xs mb-2">Staff Attendance Sync</label>
                          <select
                            className="select-field text-xs py-1.5 h-auto text-slate-300"
                            style={{ height: '32px', fontSize: '12px' }}
                            value={addon.attendance_rule || 'none'}
                            onChange={(e) => {
                              const next = [...addons];
                              next[index].attendance_rule = e.target.value;
                              setAddons(next);
                            }}
                          >
                            <option value="none" style={{ backgroundColor: '#1e293b' }}>Global None (Full Amount)</option>
                            <option value="monthly" style={{ backgroundColor: '#1e293b' }}>Global Monthly (Ratio Based)</option>
                            <option value="daily" style={{ backgroundColor: '#1e293b' }}>Global Daily (Day Selection)</option>
                          </select>
                          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '6px' }}>Enforces deduction logic independently for internal Add-on Staff.</p>
                        </div>
                      </div>
                      
                      {/* Old attendance rule wrapper hidden since we replaced it:`;

const oldEndAnchor = `                      )}
                    </div>
                  </div>
                );`;

const fullSearchStr = searchAnchor;

if(content.includes(searchAnchor)) {
    content = content.replace(searchAnchor, replacementText + '\n                      {false && (' + searchAnchor.replace('{addon.addon_department_id && (', ''));
    fs.writeFileSync(file_path, content);
    console.log("Success patching UI");
} else {
    console.log("Could not find anchor");
}
