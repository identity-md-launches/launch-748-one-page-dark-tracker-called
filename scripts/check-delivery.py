"""Check submitted content without opening or modifying Git metadata."""
from pathlib import Path
import hashlib
import io
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUDGET = 8_388_608
EXCLUDED = {'.git', '.github', '.imd', '.agents', '.codex'}
FORBIDDEN = {'node_modules', '.cache', '.vite', '__pycache__', 'playwright-report'}


def submitted_files(directory):
    for path in sorted(directory.iterdir()):
        relative = path.relative_to(ROOT)
        if path.name in EXCLUDED or relative == Path('test/scratch'):
            continue
        assert path.name not in FORBIDDEN, f'Generated directory in delivery: {relative}'
        assert not path.is_symlink(), f'Symlink in delivery: {relative}'
        assert path.name != '.gitmodules', 'Submodules are not allowed'
        assert not path.name.startswith('.env'), f'Unexpected environment file: {relative}'
        if path.is_dir():
            yield from submitted_files(path)
        else:
            assert not path.name.endswith(('.tgz', '.tar.gz', '.zip', '.deb')), f'Packaging archive: {relative}'
            yield path


files = list(submitted_files(ROOT))
raw_bytes = sum(path.stat().st_size for path in files)
assert raw_bytes < BUDGET, f'Uncompressed delivery exceeds budget: {raw_bytes}'
archive = io.BytesIO()
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in files:
        bundle.write(path, path.relative_to(ROOT))
assert len(archive.getvalue()) < BUDGET

html = (ROOT / 'dist/index.html').read_text()
for url in re.findall(r'(?:src|href)="([^"]+)"', html):
    assert url.startswith('./'), f'Non-relative HTML asset: {url}'
    assert (ROOT / 'dist' / url).is_file(), f'Missing HTML asset: {url}'
for css in (ROOT / 'dist/assets').glob('*.css'):
    for url in re.findall(r'url\(([^)]+)\)', css.read_text()):
        url = url.strip('\'"')
        if url.startswith('data:'):
            continue
        assert not url.startswith(('/', 'http:','https:')), f'Non-relative CSS asset: {url}'
        assert (css.parent / url).is_file(), f'Missing CSS asset: {url}'
assert not list((ROOT / 'dist').rglob('*.map')), 'Unneeded source maps in production export'

staging = ROOT / 'test/scratch/build'
compared = 0
if staging.is_dir():
    for relative in ['src', 'public', 'tests', 'dist', 'package.json', 'package-lock.json',
                     'index.html', 'vite.config.ts', 'tsconfig.json', 'playwright.config.ts']:
        original = ROOT / relative
        candidates = sorted(original.rglob('*')) if original.is_dir() else [original]
        for path in candidates:
            if path.is_file():
                twin = staging / path.relative_to(ROOT)
                assert twin.is_file() and path.read_bytes() == twin.read_bytes(), f'Staging mismatch: {path.relative_to(ROOT)}'
                compared += 1
    for path in (staging / 'dist').rglob('*'):
        if path.is_file():
            assert (ROOT / path.relative_to(staging)).is_file(), 'Missing exported file'

print(json.dumps({
    'result': 'PASS', 'files': len(files), 'uncompressed_bytes': raw_bytes,
    'zip_bytes': len(archive.getvalue()), 'budget_bytes': BUDGET,
    'production_bytes': sum(p.stat().st_size for p in (ROOT / 'dist').rglob('*') if p.is_file()),
    'staging_files_compared': compared,
    'index_sha256': hashlib.sha256((ROOT / 'dist/index.html').read_bytes()).hexdigest(),
    'note': 'Content-size check; Git metadata is deliberately not read. ZIP is measured in memory, not delivered.',
}, indent=2))
