import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CandidateResearchPanel } from "./CandidateResearchPanel";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useAppStore } from "@/store/useAppStore";

const mocks=vi.hoisted(()=>({research:vi.fn(),saveResearch:vi.fn()}));
vi.mock("@/services/discoveryEngine",()=>({discoveryEngine:mocks}));
const dossier={run_id:"survey",candidate_id:"region",candidate:{name:"Proposed region",lat:31.875,lon_east:-2.125,profile:{measurements:{}}},
 record:{status:"unresearched",notes:"",findings:[],updated_at:null},research_questions:["Has this region already been studied?"],
 search_tasks:[{label:"Prior analog work",url:"https://ntrs.nasa.gov/search"}],research_brief:"Check prior work and field validation gaps.",
 background_evidence:[{chunk_id:"chunk",title:"Jezero context",url:"https://science.nasa.gov/",institution:"NASA",excerpt:"Regional background does not establish geology at this candidate."}]};
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CandidateResearchPanel /></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();useCandidateResearchTarget.setState({target:{runId:"survey",candidateId:"region"}});mocks.research.mockResolvedValue(dossier);mocks.saveResearch.mockResolvedValue({status:"in_progress"});});
afterEach(()=>vi.restoreAllMocks());
describe("candidate deep research",()=>{
 it("opens a scoped evidence dossier without marking the candidate researched",async()=>{
  mount();expect(await screen.findByText("Deep research: Proposed region")).toBeInTheDocument();
  expect(screen.getByText("Unresearched",{selector:"span"})).toBeInTheDocument();
  expect(screen.getByText(/Background only/)).toBeInTheDocument();
  expect(mocks.saveResearch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"),{target:{value:"Unsaved research notes must survive a background evidence query."}});
  fireEvent.change(screen.getByLabelText("Question for the evidence library"),{target:{value:"What geological evidence is missing?"}});
  fireEvent.click(screen.getByRole("button",{name:"Retrieve background evidence"}));
  await waitFor(()=>expect(mocks.research).toHaveBeenLastCalledWith("survey","region","What geological evidence is missing?",expect.anything()));
  await waitFor(()=>expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("Unsaved research notes must survive a background evidence query."));
 });
 it("saves explicit progress and blocks evidence-free completion",async()=>{
  mount();await screen.findByText("Deep research: Proposed region");
  fireEvent.change(screen.getByLabelText("Candidate research status"),{target:{value:"literature_reviewed"}});
  expect(screen.getByRole("button",{name:"Save research notes"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Candidate research status"),{target:{value:"in_progress"}});
  fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"),{target:{value:"Inspecting geological maps and checking prior analog research."}});
  fireEvent.click(screen.getByRole("button",{name:"Save research notes"}));
  await waitFor(()=>expect(mocks.saveResearch).toHaveBeenCalledWith("survey","region",expect.objectContaining({status:"in_progress"})));
 });
 it("offers a discovery handoff when no candidate is selected",()=>{
  useCandidateResearchTarget.setState({target:null});mount();
  fireEvent.click(screen.getByRole("button",{name:"Choose a discovery candidate"}));
  expect(useAppStore.getState().activeTab).toBe("explore");
  expect(useAppStore.getState().exploreMode).toBe("find_analogs");
 });
 it("tags missing and in-progress status clearly",()=>{
  const v=render(<ResearchStatusBadge status={undefined}/>);expect(screen.getByText("Unresearched")).toBeInTheDocument();
  v.rerender(<ResearchStatusBadge status="in_progress"/>);expect(screen.getByText("Research in progress")).toBeInTheDocument();
 });
});
