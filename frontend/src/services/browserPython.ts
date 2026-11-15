/** GitHub Pages transport: same Python models and APIs in a dedicated worker. */
export const IS_BROWSER_PYTHON = import.meta.env.VITE_PAGES_PYTHON === "true";
const STORAGE_KEY="planetary-explorer.pages-research.v1";
type Status={phase:"idle"|"loading"|"ready"|"error";message:string};
let status:Status={phase:"idle",message:"Preparing planet data…"};
const subscribers=new Set<()=>void>();
export const browserRuntimeStatus={get:()=>status,subscribe:(fn:()=>void)=>{subscribers.add(fn);return()=>{subscribers.delete(fn);};}};
function update(next:Status){status=next;subscribers.forEach(fn=>fn());}
let worker:Worker|undefined,ready:Promise<void>|undefined,counter=0;
const waiting=new Map<number,{resolve:(r:Response)=>void;reject:(e:Error)=>void;cleanup:()=>void;path:string;method:string}>();
let fatalError:Error|undefined;
function fail(error:Error){
  fatalError=error;
  update({phase:"error",message:error.message});
  for(const request of waiting.values()){request.cleanup();request.reject(error);}
  waiting.clear();
}
function initialize():Promise<void>{
  if(ready)return ready;
  ready=new Promise((resolve,reject)=>{
    update({phase:"loading",message:"Loading the calculation engine…"});
    worker=new Worker(new URL(`${import.meta.env.BASE_URL}pages-worker.js`,window.location.origin),{type:"module"});
    worker.onmessage=event=>{
      const value=event.data;
      if(value.type==="progress"){update({phase:"loading",message:value.message});return;}
      if(value.type==="ready"){update({phase:"ready",message:"Calculations run on this device. Research notes stay in this browser; export a copy to keep them."});resolve();return;}
      if(value.type==="error"){
        const error=new Error(value.message);
        if(value.id!=null){const request=waiting.get(value.id);request?.cleanup();request?.reject(error);waiting.delete(value.id);}
        else{fail(error);reject(error);}
        return;
      }
      const request=waiting.get(value.id);if(!request)return;
      request.cleanup();waiting.delete(value.id);
      if(request.method==="POST"&&request.path.split("?")[0].endsWith("/research")&&value.status===200){
        try{const record=JSON.parse(value.body);const records=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");records[`${record.run_id}:${record.candidate_id}`]=record;localStorage.setItem(STORAGE_KEY,JSON.stringify(records));}
        catch{request.reject(new Error("Browser storage is unavailable. Keep the notebook open and export your findings."));return;}
      }
      request.resolve(new Response(value.body,{status:value.status,headers:{"Content-Type":"application/json"}}));
    };
    worker.onerror=()=>{const error=new Error("The local calculation engine could not start. Reload the page or check your connection.");fail(error);reject(error);};
    let records:unknown[]=[];try{records=Object.values(JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"));}catch{/* A corrupt browser cache is not evidence. */}
    worker.postMessage({type:"initialize",dataBase:new URL(`${import.meta.env.BASE_URL}pages-data/`,window.location.origin).href,records});
  });
  return ready;
}
export async function browserRequest(path:string,init:RequestInit={}):Promise<Response>{
  if(init.signal?.aborted)throw new DOMException("Request aborted","AbortError");
  if(fatalError)throw fatalError;
  await initialize();
  if(fatalError)throw fatalError;
  if(init.signal?.aborted)throw new DOMException("Request aborted","AbortError");
  return new Promise((resolve,reject)=>{
    const id=++counter;
    const cancel=()=>{waiting.delete(id);reject(new DOMException("Request aborted","AbortError"));};
    waiting.set(id,{resolve,reject,path,method:init.method||"GET",cleanup:()=>init.signal?.removeEventListener("abort",cancel)});
    init.signal?.addEventListener("abort",cancel,{once:true});
    worker!.postMessage({type:"request",id,path,method:init.method||"GET",body:typeof init.body==="string"?init.body:null});
  });
}
