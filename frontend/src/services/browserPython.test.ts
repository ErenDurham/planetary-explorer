import { afterEach, expect, it, vi } from "vitest";

class FakeWorker {
  static current: FakeWorker;
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  constructor() { FakeWorker.current = this; }
  postMessage(value: Record<string, unknown>) { this.sent.push(value); }
  emit(data: unknown) { this.onmessage?.({data}); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
async function runtime() {
  vi.resetModules();
  vi.stubGlobal("Worker", FakeWorker);
  return import("./browserPython");
}
it("rejects pending and future requests when the running worker crashes", async () => {
  const {browserRequest, browserRuntimeStatus} = await runtime();
  const pending = browserRequest("/discovery/capabilities");
  const result = expect(pending).rejects.toThrow("could not start");
  FakeWorker.current.emit({type:"ready"});
  await Promise.resolve();
  FakeWorker.current.onerror?.();
  await result;
  expect(browserRuntimeStatus.get().phase).toBe("error");
  await expect(browserRequest("/health")).rejects.toThrow("could not start");
});
it("reports storage failure instead of confirming durable research save", async () => {
  const {browserRequest} = await runtime();
  const pending = browserRequest("/discovery/runs/run/candidates/candidate/research", {method:"POST"});
  const result = expect(pending).rejects.toThrow("Browser storage is not available");
  FakeWorker.current.emit({type:"ready"});
  await Promise.resolve();
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => {throw new Error("quota");});
  const request = FakeWorker.current.sent.find(value => value.type === "request")!;
  FakeWorker.current.emit({id:request.id,status:200,body:JSON.stringify({run_id:"run",candidate_id:"candidate",status:"in_progress"})});
  await result;
});
it("restores saved candidate records and persists successful notebook saves", async () => {
  const saved = {run_id:"run",candidate_id:"candidate",status:"in_progress"};
  localStorage.setItem("planetary-explorer.pages-research.v1",JSON.stringify({"run:candidate":saved}));
  const {browserRequest} = await runtime();
  const pending = browserRequest("/discovery/runs/run/candidates/candidate/research", {method:"POST"});
  expect(FakeWorker.current.sent[0].records).toEqual([saved]);
  FakeWorker.current.emit({type:"ready"});
  await Promise.resolve();
  const request = FakeWorker.current.sent.find(value => value.type === "request")!;
  FakeWorker.current.emit({id:request.id,status:200,body:JSON.stringify({...saved,notes:"Updated notes"})});
  expect((await pending).status).toBe(200);
  expect(JSON.parse(localStorage.getItem("planetary-explorer.pages-research.v1")!)["run:candidate"].notes).toBe("Updated notes");
});
