import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import { ExploreView } from "./ExploreView";
import type { Site } from "@/types";
const site=fixture.site.site as unknown as Site;
const image={entry_id:"orbital_one",view:"orbital",title:"Verified orbital image",relevance:"Candidate region",credit:"NASA",source_page_url:"https://science.nasa.gov/",relationship:"candidate_region",verified_on:"2026-11-14",coverage_evidence:"Curated coverage",institution:"NASA",license:"Credit required"};
const mount=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ExploreView globe={<p>Globe preview</p>} site={site}/></QueryClientProvider>);
afterEach(()=>vi.restoreAllMocks());
describe("Explore imagery",()=>{
  it("shows the selected site's source-backed asset and preserves the image choice across Globe",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({site_id:site.id,entries:[image,{...image,entry_id:"orbital_two",title:"Second verified scene"}],notes:[]})));
    mount();fireEvent.click(screen.getByRole("button",{name:"Orbital view"}));
    const select=await screen.findByLabelText("Orbital image");fireEvent.change(select,{target:{value:"orbital_two"}});
    expect(screen.getByRole("img")).toHaveAttribute("src",expect.stringContaining("/imagery/orbital_two/asset"));
    fireEvent.click(screen.getByRole("button",{name:/^Globe$/}));
    expect(screen.getByText("Globe preview")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Orbital view"}));
    expect(screen.getByLabelText("Orbital image")).toHaveValue("orbital_two");
    expect(screen.getByRole("link",{name:/Open original source/})).toHaveAttribute("href","https://science.nasa.gov/");
  });
  it("does not substitute orbital imagery for a missing surface view",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({site_id:site.id,entries:[image],notes:["No landed camera at this site."]})));
    mount();fireEvent.click(screen.getByRole("button",{name:"Surface view"}));
    expect(await screen.findByText(/No verified surface imagery/)).toBeInTheDocument();expect(screen.queryByRole("img")).toBeNull();
  });
  it("offers a retry when an asset fails",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({site_id:site.id,entries:[image],notes:[]})));
    mount();fireEvent.click(screen.getByRole("button",{name:"Orbital view"}));
    const img=await screen.findByRole("img");fireEvent.error(img);
    fireEvent.click(screen.getByRole("button",{name:"Retry image"}));
    expect(screen.getByRole("img")).toHaveAttribute("src",expect.stringContaining("retry=1"));
  });
});
