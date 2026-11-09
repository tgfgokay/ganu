"""Bağımsız, salt okunur belge QA: pypdf + pdfplumber; gerçek veri/log gövdesi yazmaz."""
import argparse
import hashlib
import json
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('pdf')
parser.add_argument('--report', required=True)
parser.add_argument('--visual-reviewed', action='store_true')
args = parser.parse_args()
path = Path(args.pdf)
reader = PdfReader(path)
fields = {key: field for key, field in (reader.get_fields() or {}).items() if field.get('/FT')}
widgets = [ref.get_object() for page in reader.pages for ref in page.get('/Annots', []) if ref.get_object().get('/Subtype') == '/Widget']

def field_name(item):
    names = []
    while item:
        if item.get('/T'):
            names.insert(0, str(item['/T']))
        item = item['/Parent'].get_object() if item.get('/Parent') else None
    return '.'.join(names)

def inherited(item, key):
    while item:
        if key in item:
            return item[key]
        item = item['/Parent'].get_object() if item.get('/Parent') else None
    return None

assert len(fields) == len(widgets), 'Kanonik terminal alan / Widget sayıları farklı'
for name, field in fields.items():
    matching = [widget for widget in widgets if field_name(widget) == name]
    assert len(matching) == 1, 'Alan adı tek bir Widget ile eşleşmeli'
    assert inherited(matching[0], '/V') == field.get('/V'), 'Kanonik alan ve Widget değerleri farklı'
    assert matching[0].get('/AP') and matching[0]['/AP'].get('/N'), 'Widget normal görünümü eksik'

text = '\n'.join(page.extract_text() or '' for page in reader.pages)
for expected in ['Çığ Şen', 'Özgür Işık', 'iki nüsha', '1.200,00', 'günlük 50,00 TL']:
    assert expected in text, 'Sahte örneğin Türkçe alan veya tutar eşleşmesi eksik'
assert fields['virtual-office.signer.1']['/V'] == 'Özgür Işık'
assert fields['virtual-office.date.1'].get('/V', '') == ''
with pdfplumber.open(path) as pdf:
    for page in pdf.pages:
        assert all(char['x0'] >= 40 and char['x1'] <= page.width - 40 and char['top'] >= 10 and char['bottom'] <= page.height - 20 for char in page.chars), 'Sayfa sınırlarında metin taşması var'

report = {
    'kind': 'synthetic-only', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    'pages': len(reader.pages), 'terminal_fields': len(fields), 'widgets': len(widgets),
    'canonical_widget_values_match': True, 'normal_appearance_streams_present': True,
    'turkish_text_extracted': True, 'text_within_page_bounds': True,
    'visual_review_all_pages': args.visual_reviewed, 'real_customer_data': False,
}
Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('Independent PDF QA PASS:', json.dumps(report, ensure_ascii=False))
