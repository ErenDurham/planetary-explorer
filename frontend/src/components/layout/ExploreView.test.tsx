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
  it("steps through the images with the arrows and preserves the image choice across Globe",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({site_id:site.id,entries:[image,{...image,entry_id:"orbital_two",title:"Second verified scene"}],notes:[]})));
    mount();fireEvent.click(screen.getByRole("button",{name:"Orbital view"}));
    expect(await screen.findByTestId("site-image-title")).toHaveTextContent("Verified orbital image1 of 2");
    expect(screen.queryByRole("combobox")).toBeNull();   // no drop-down: arrows only
    fireEvent.click(screen.getByRole("button",{name:"Next orbital image"}));
    expect(screen.getByRole("img")).toHaveAttribute("src",expect.stringContaining("/imagery/orbital_two/asset"));
    expect(screen.getByTestId("site-image-title")).toHaveTextContent("Second verified scene2 of 2");
    fireEvent.click(screen.getByRole("button",{name:/^Globe$/}));
    expect(screen.getByText("Globe preview")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Orbital view"}));
    expect(screen.getByTestId("site-image-title")).toHaveTextContent("Second verified scene");
    fireEvent.click(screen.getByRole("button",{name:"Next orbital image"}));   // wraps around to the first
    expect(screen.getByTestId("site-image-title")).toHaveTextContent("Verified orbital image1 of 2");
    fireEvent.click(screen.getByRole("button",{name:"Previous orbital image"}));
    expect(screen.getByTestId("site-image-title")).toHaveTextContent("Second verified scene2 of 2");
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
