with open('/Users/ashrarehmat/.gemini/antigravity/brain/5e31dadf-d5c3-4f54-9d1a-929da96c92ad/task.md', 'r') as f:
    text = f.read()

text = text.replace('- [ ] Add `OTMonthlyAddon` interface to `src/lib/types.ts`.', '- [x] Add `OTMonthlyAddon` interface to `src/lib/types.ts`.')
text = text.replace('- [ ] Implement `src/app/api/ot-monthly-addons/route.ts`', '- [x] Implement `src/app/api/ot-monthly-addons/route.ts`')
text = text.replace('- [ ] Extract row-level `%` and `Mode`', '- [x] Extract row-level `%` and `Mode`')
text = text.replace('- [ ] Implement global React states', '- [x] Implement global React states')
text = text.replace('- [ ] Render the global inputs into the table `<thead>`.', '- [x] Render the global inputs into the table `<thead>`.')
text = text.replace('- [ ] Add an auto-sync function', '- [x] Add an auto-sync function')
text = text.replace('- [ ] Modify `addRow()` logic', '- [x] Modify `addRow()` logic')
text = text.replace('- [ ] Fetch `/api/ot-monthly-addons`', '- [x] Fetch `/api/ot-monthly-addons`')
text = text.replace('- [ ] Build the UI section below the Grid mimicking `monthly-entry`.', '- [x] Build the UI section below the Grid mimicking `monthly-entry`.')
text = text.replace('- [ ] Integrate OT Entry\'s sum output', '- [x] Integrate OT Entry\'s sum output')
text = text.replace('- [ ] Build a robust Export method for Excel', '- [x] Build a robust Export method for Excel')
text = text.replace('- [ ] Build a robust Export method for PDF', '- [x] Build a robust Export method for PDF')
text = text.replace('- [ ] Attach matching export buttons', '- [x] Attach matching export buttons')

with open('/Users/ashrarehmat/.gemini/antigravity/brain/5e31dadf-d5c3-4f54-9d1a-929da96c92ad/task.md', 'w') as f:
    f.write(text)
