"""Build the public catalog from the private one with real prices.

The private workbook (catalog/private/NETGEAR_BoM_Catalog_official_pricing.xlsx, never committed) holds
List_Price_USD and Price_Source. The public catalog (catalog/NETGEAR_BoM_Catalog.xlsx) gets a unitless
Cost_Index instead: every price times one factor (Tool_Settings Cost_Index_Factor in the private workbook),
rounded to 3 significant digits, and no sources. Design choices are identical because the engine only uses
relative costs.

    python tools/publish_costs.py
    python tools/fix_xlsx_cache.py && node tools/catalog_from_xlsx.js && node tools/build.js

Edit prices only in the private workbook, then run this again.
"""
import math, shutil, openpyxl
from openpyxl.worksheet.table import Table

PRIV = 'catalog/private/NETGEAR_BoM_Catalog_official_pricing.xlsx'
PUB = 'catalog/NETGEAR_BoM_Catalog.xlsx'

def sig3(x):
    if not x: return x
    d = 3 - int(math.floor(math.log10(abs(x)))) - 1
    v = round(x, d)
    return int(v) if v == int(v) else v

wb = openpyxl.load_workbook(PRIV)
ts = wb['Tool_Settings']
F = next((float(ts.cell(r, 2).value) for r in range(5, ts.max_row + 1) if ts.cell(r, 1).value == 'Cost_Index_Factor'), None)
if not F: raise SystemExit('Add a Cost_Index_Factor row to Tool_Settings in the private workbook')

for name in ('Products', 'Accessories'):
    ws = wb[name]; hdr = [c.value for c in ws[4]]
    pc = hdr.index('List_Price_USD') + 1; sc = hdr.index('Price_Source') + 1
    for r in range(5, ws.max_row + 1):
        v = ws.cell(r, pc).value
        if isinstance(v, (int, float)): ws.cell(r, pc).value = sig3(v * F)
        ws.cell(r, sc).value = None
    ws.cell(4, pc).value = 'Cost_Index'; ws.cell(4, sc).value = 'Cost_Note'
    t = ws.tables[list(ws.tables)[0]]
    for col in t.tableColumns:
        if col.name == 'List_Price_USD': col.name = 'Cost_Index'
        if col.name == 'Price_Source': col.name = 'Cost_Note'

for r in range(ts.max_row, 4, -1):
    k = ts.cell(r, 1).value
    if k == 'Cost_Index_Factor':
        ts.delete_rows(r)
        t = ts.tables[list(ts.tables)[0]]; a, b = t.ref.split(':'); t.ref = f'{a}:{b[0]}{int(b[1:]) - 1}'
    elif k == 'Per_Switch_Overhead_USD':
        ts.cell(r, 1).value = 'Per_Switch_Overhead'
        ts.cell(r, 2).value = str(sig3(float(ts.cell(r, 2).value) * F))
        ts.cell(r, 3).value = 'Added to every switch when comparing designs, in Cost_Index units: rack space, power, patching and setup. Higher values favor fewer, larger switches'

D = wb['Data_Dictionary']
for r in range(5, D.max_row + 1):
    c = D.cell(r, 2).value
    if c == 'List_Price_USD': D.cell(r, 2).value = 'Cost_Index'; D.cell(r, 4).value = None; D.cell(r, 6).value = 'Relative cost used to compare designs. Not a price: real prices are kept internally'
    if c == 'Price_Source': D.cell(r, 2).value = 'Cost_Note'; D.cell(r, 6).value = 'Notes on the cost index (no sources published)'
G = wb['Data_Gaps']
for r in range(G.max_row, 4, -1):
    if G.cell(r, 1).value == 'Pricing': G.delete_rows(r)
t = G.tables[list(G.tables)[0]]; a, b = t.ref.split(':')
last = max(r for r in range(5, G.max_row + 1) if G.cell(r, 1).value) if G.max_row >= 5 else 4
t.ref = f'{a}:{b[0]}{last}'
wb.save(PUB)
print(f'public catalog written with Cost_Index (factor kept private)')
