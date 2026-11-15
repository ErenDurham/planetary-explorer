"""Public bundle allowlist must never publish user notebooks, caches or secrets."""
from scripts.build_pages_bundle import allowed_files

def test_pages_bundle_excludes_private_files_and_preserves_real_api():
    paths=[p.as_posix() for p in allowed_files()]
    assert any(p.endswith('/app/services/discovery_engine.py') for p in paths)
    assert any(p.endswith('/data/documents/chunks.jsonl') for p in paths)
    assert any(p.endswith('/pages_runtime.py') for p in paths)
    assert all('/data/discovery/research/' not in p and '/data/raw/' not in p and '/.env' not in p and '/tests/' not in p for p in paths)

def test_notes_and_env_files_are_not_included_even_when_present(tmp_path):
    backend=tmp_path/'backend'
    for name in ['.env','data/discovery/research/run/candidate.json','data/raw/secret.json','data/index/index.json']:
        p=backend/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('private')
    public=backend/'data/discovery/runs/run/run.json';public.parent.mkdir(parents=True);public.write_text('{}')
    assert allowed_files(tmp_path)==[public]
