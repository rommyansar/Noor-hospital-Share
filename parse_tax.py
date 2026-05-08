import csv
import json

data = []
with open('/Users/ashrarehmat/Desktop/tax FEBRUARY Sb  2026.csv', 'r') as f:
    reader = csv.reader(f)
    header = []
    for i, row in enumerate(reader):
        if i == 0: continue
        if i == 1:
            header = [c.strip() for c in row]
            continue
        if len(row) < 6: continue
        ind = row[0].strip()
        name = row[1].strip()
        if not ind or not ind.isdigit():
            # if ind is like T-102, keep it
            if not ind.startswith('T-'):
                continue

        def parse_amt(val):
            val = val.replace(',', '').replace('"', '').strip()
            if not val or val == '-': return 0
            try: return int(val)
            except: return 0
            
        ch = parse_amt(row[2])
        aam = parse_amt(row[3])
        jsal = parse_amt(row[4])
        inctax = parse_amt(row[5])
        
        data.append({
            'ind': ind,
            'name': name,
            'ch': ch,
            'aam_musi': aam,
            'j_sal': jsal,
            'inc_tax': inctax
        })

with open('/Users/ashrarehmat/hospital share/hospital-share/src/lib/taxData.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Parsed", len(data), "records")
