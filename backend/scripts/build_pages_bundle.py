"""Build a public, secret-free browser runtime from an explicit allowlist.

Only shipped source/config/data are bundled. Never include .env, caches or user notebooks.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile

ROOT=Path(__file__).resolve().parents[2]
EXPECTED_MOLA='d18d9b9ab8c5516d02e157dd2cde0f1d0d160c21940e953ba22391269a545e7b'

def allowed_files(root=ROOT):
    backend=root/'backend'
    files=([root/'LICENSE'] if (root/'LICENSE').is_file() else [])+list((backend/'app').rglob('*.py'))+list((backend/'app/config').glob('*.json'))
    files += [backend/'scripts/__init__.py',backend/'scripts/geo.py',backend/'pages_runtime.py']
    for name in ['earth','mars','evidence','comparison','moon']:
        files+=list((backend/'data'/name).glob('*.json'))
    for name in ['chunks.jsonl','manifest.json']:
        files.append(backend/'data/documents'/name)
    files += list((backend/'data').glob('*.json'))
    files += list((backend/'data/discovery/runs').glob('*/*.json'))
    files += [backend/'data/imagery/manifest.json']
    return sorted({p for p in files if p.is_file()})

def build(destination, mola=None):
    destination.mkdir(parents=True,exist_ok=True)
    archive=destination/'backend.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in allowed_files():z.write(p,p.relative_to(ROOT).as_posix())
    image_dir=destination/'imagery';image_dir.mkdir(exist_ok=True)
    manifest=json.loads((ROOT/'backend/data/imagery/manifest.json').read_text())
    images={}
    for site in manifest['sites'].values():
        for entry in site['entries']:
            asset=entry.get('local_asset')
            if not asset:continue
            p=ROOT/'backend/data/imagery/assets'/asset
            if p.is_file():
                # All current assets are JPEG. Preserve the original bytes.
                if p.suffix.lower()!='.jpg':raise ValueError('Add explicit non-JPEG support before publishing '+asset)
                shutil.copyfile(p,image_dir/(entry['entry_id']+'.jpg'))
                images[entry['entry_id']]='imagery/'+entry['entry_id']+'.jpg'
    output={'engine':'python-in-browser','pyodide_version':'314.0.8','archive':'backend.zip',
            'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(allowed_files()),'images':images,'mola':None}
    if mola and mola.exists():
        raw=mola.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=EXPECTED_MOLA:raise ValueError('MOLA checksum mismatch')
        shutil.copyfile(mola,destination/'mola.img')
        output['mola']={'url':'mola.img','sha256':EXPECTED_MOLA,'bytes':len(raw)}
    (destination/'manifest.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({'archive_bytes':archive.stat().st_size,'files':output['files'],'images':len(images),'mola':bool(output['mola'])}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'frontend/public/pages-data')
    parser.add_argument('--mola',type=Path,default=ROOT/'backend/data/raw/megt90n000eb.img')
    args=parser.parse_args();build(args.out,args.mola)
