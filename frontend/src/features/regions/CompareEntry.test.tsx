import { expect,it,vi } from "vitest";
import { render,screen } from "@testing-library/react";
import { CompareEntry } from "./CompareEntry";
vi.mock("@/components/layout/CompareView",()=>({CompareView:()=> <h1>Original comparative field atlas</h1>}));
it("always renders the original comparison page rather than a replacement workspace",()=>{
 render(<CompareEntry sites={[]} selectedId={null}/>);
 expect(screen.getByRole("heading",{name:"Original comparative field atlas"})).toBeInTheDocument();
});
