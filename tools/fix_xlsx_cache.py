"""Write cached results for the formulas in the sheets the BoM tool reads.

openpyxl saves formulas without their last calculated value, but the tool's catalog
upload (SheetJS) reads cached values only. Run this after editing the catalog with openpyxl:

    python tools/fix_xlsx_cache.py catalog/NETGEAR_BoM_Catalog.xlsx

It evaluates the formula patterns used in Products and PSU_PoE_Matrix, writes the results
into the file, and marks the workbook for a full recalculation when Excel opens it
(README counts and Model_Lookup). An unknown formula in a sheet the tool reads is an error.
"""
import re, sys, zipfile, shutil, tempfile, openpyxl
from openpyxl.utils import column_index_from_string as ci

READ = ['Products', 'PSU_PoE_Matrix']
num = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def evaluate(ws, f):
    v = lambda ref: num(ws[ref].value)
    if m := re.fullmatch(r'=SUM\(([A-Z]+)(\d+):([A-Z]+)\d+\)', f):
        a, r, b = m.group(1), int(m.group(2)), m.group(3)
        return sum(num(ws.cell(r, c).value) or 0 for c in range(ci(a), ci(b) + 1))
    if m := re.fullmatch(r'=IFERROR\((\w+)/(\w+),""\)', f):
        x, y = v(m.group(1)), v(m.group(2))
        return x / y if x is not None and y else ''
    if m := re.fullmatch(r'=IF\(MAX\((\w+),(\w+)\)=0,"",ROUND\(MAX\(\w+,\w+\)\*([\d.]+),0\)\)', f):
        mx = max(v(m.group(1)) or 0, v(m.group(2)) or 0)
        return '' if mx == 0 else round(mx * float(m.group(3)))
    if m := re.fullmatch(r'=IF\(COUNT\((\w+),(\w+)\)=0,"",MIN\(\w+,\w+\)\)', f):
        xs = [x for x in (v(m.group(1)), v(m.group(2))) if x is not None]
        return min(xs) if xs else ''
    raise ValueError(f'{ws.title}: no evaluator for {f}')

def main(path):
    wb = openpyxl.load_workbook(path)
    names = {s.title: i + 1 for i, s in enumerate(wb.worksheets)}
    values = {}
    for n in READ:
        ws = wb[n]
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith('='):
                    values[(n, c.coordinate)] = evaluate(ws, c.value)
    wb.calculation.fullCalcOnLoad = True
    wb.save(path)  # openpyxl drops cached values; patch them back into the sheet XML below
    rels = zipfile.ZipFile(path).read('xl/_rels/workbook.xml.rels').decode()
    book = zipfile.ZipFile(path).read('xl/workbook.xml').decode()
    target = {}
    for n in READ:
        rid = re.search(r'<sheet [^>]*name="%s"[^>]*r:id="(\w+)"' % re.escape(n), book).group(1)
        rel = next(r for r in re.findall(r'<Relationship [^>]*>', rels) if re.search(r'Id="%s"' % rid, r))
        target[n] = 'xl/' + re.search(r'Target="/?(?:xl/)?([^"]+)"', rel).group(1)
    tmp = tempfile.mktemp(suffix='.xlsx')
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            sheet = next((n for n, t in target.items() if t == item.filename), None)
            if sheet:
                xml = data.decode()
                def fill(m):
                    val = values.get((sheet, m.group(2)))
                    if val is None or val == '':
                        return m.group(0).replace('<v />', '').replace('<v></v>', '')
                    val = float('%.15g' % val)  # Excel caches 15 significant digits
                    return f'{m.group(1)}<f>{m.group(3)}</f><v>{int(val) if val.is_integer() else val}</v></c>'
                xml = re.sub(r'(<c r="([A-Z]+\d+)"[^>]*>)<f>([^<]*)</f>(?:<v */>|<v></v>|<v>[^<]*</v>)?</c>', fill, xml)
                data = xml.encode()
            zout.writestr(item, data)
    shutil.move(tmp, path)
    print(f'cached {len(values)} formula results in {", ".join(READ)}')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'catalog/NETGEAR_BoM_Catalog.xlsx')
