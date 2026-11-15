// Static-host runtime: execute the existing Python API, not a JavaScript scoring copy.
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';
let python, manifest, dataBase, molaReady=false;
const progress=message=>self.postMessage({type:'progress',message});
async function checkedFetch(url, hash) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Source data could not be loaded (${response.status}).`);
  const bytes=await response.arrayBuffer();
  if(hash){const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw new Error('Published data checksum mismatch.');}
  return bytes;
}
async function initialize(message){
  dataBase=message.dataBase;
  progress('Loading the calculation engine…');
  python=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/'});
  progress('Preparing scientific libraries…');
  await python.loadPackage(['numpy','pydantic','fastapi','micropip']);
  await python.runPythonAsync("import micropip\nawait micropip.install('pydantic-settings==2.12.0')");
  progress('Opening the published planet and survey data…');
  const response=await fetch(new URL('manifest.json',dataBase));if(!response.ok)throw new Error('Published data manifest unavailable.');manifest=await response.json();
  python.unpackArchive(await checkedFetch(new URL(manifest.archive,dataBase),manifest.sha256),'zip',{extractDir:'/planetary'});
  python.globals.set('_pages_records_json',JSON.stringify(message.records||[]));
  await python.runPythonAsync("import sys\nsys.path.insert(0,'/planetary/backend')\nimport pages_runtime\nimport json\npages_runtime.restore_records(json.loads(_pages_records_json))");
  self.postMessage({type:'ready'});
}
async function handle(message){
  if(message.type==='initialize'){await initialize(message);return;}
  if(message.path.startsWith('/expedition/')&&!molaReady&&manifest.mola){
    progress('Loading regional terrain for the expedition planner…');
    const bytes=await checkedFetch(new URL(manifest.mola.url,dataBase),manifest.mola.sha256);
    python.FS.mkdirTree('/planetary/backend/data/raw');python.FS.writeFile('/planetary/backend/data/raw/megt90n000eb.img',new Uint8Array(bytes));molaReady=true;
    self.postMessage({type:'ready'});
  }
  python.globals.set('_pages_request_json',JSON.stringify(message));
  const result=JSON.parse(await python.runPythonAsync('await pages_runtime.request(_pages_request_json)'));
  self.postMessage({type:'response',id:message.id,...result});
}
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(()=>handle(event.data)).catch(error=>self.postMessage({type:'error',id:event.data.id,message:error.message||String(error)}));};
