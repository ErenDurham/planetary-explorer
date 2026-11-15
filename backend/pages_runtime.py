"""ASGI adapter for Pyodide. Scientific services are unchanged.

Workers execute requests serially. Run sync endpoints inline because browser Python
cannot start native thread-pool threads. There is no listening socket or cloud key.
"""
import inspect
import json
import os
import sys
from urllib.parse import urlsplit

os.environ.update(DATA_DIR='/planetary/backend/data',EMBEDDING_BACKEND='local',
                  ANTHROPIC_API_KEY='',LLM_PROVIDER='anthropic',OLLAMA_WARMUP='false')
sys.path.insert(0,'/planetary/backend')

async def inline_call(fn,*args,**kwargs):
    value=fn(*args,**kwargs)
    return await value if inspect.isawaitable(value) else value

import fastapi.routing
import fastapi.dependencies.utils
import starlette.concurrency
import starlette._exception_handler
fastapi.routing.run_in_threadpool=inline_call
fastapi.dependencies.utils.run_in_threadpool=inline_call
starlette.concurrency.run_in_threadpool=inline_call
starlette._exception_handler.run_in_threadpool=inline_call

from app.main import app
from app.models.discovery_research import ResearchRecord
from app.services.discovery_research import record_path


def restore_records(records):
    for value in records:
        try:
            record=ResearchRecord.model_validate(value)
            p=record_path(record.run_id,record.candidate_id)
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_text(record.model_dump_json())
        except (ValueError,KeyError):
            continue


async def request(request_json):
    value=json.loads(request_json)
    parsed=urlsplit(value['path'])
    body=(value.get('body') or '').encode()
    output=[]
    received=False
    async def receive():
        nonlocal received
        if not received:
            received=True
            return {'type':'http.request','body':body,'more_body':False}
        return {'type':'http.disconnect'}
    async def send(message):output.append(message)
    scope={'type':'http','asgi':{'version':'3.0'},'http_version':'1.1',
        'method':value.get('method','GET'),'scheme':'https','path':'/api/v1'+parsed.path,
        'raw_path':('/api/v1'+parsed.path).encode(),'query_string':parsed.query.encode(),
        'headers':[(b'content-type',b'application/json')], 'root_path':'',
        'server':('pages.local',443),'client':('127.0.0.1',0)}
    await app(scope,receive,send)
    start=next(x for x in output if x['type']=='http.response.start')
    data=b''.join(x.get('body',b'') for x in output if x['type']=='http.response.body')
    return json.dumps({'status':start['status'],'body':data.decode('utf-8')})
