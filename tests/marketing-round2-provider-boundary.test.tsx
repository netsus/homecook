// @vitest-environment jsdom
import React from "react";
import {cleanup,render} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const getSession=vi.hoisted(()=>vi.fn(async()=>({data:{session:null}})));
vi.mock("next/navigation",()=>({usePathname:()=>window.location.pathname}));
vi.mock("@/lib/supabase/browser",()=>({getSupabaseBrowserClient:()=>({auth:{getSession}})}));
vi.mock("@/lib/supabase/env",()=>({hasSupabasePublicEnv:()=>true}));
import {ProviderMemorySync} from "@/components/auth/provider-memory-sync";
afterEach(()=>{cleanup();getSession.mockClear();});
it.each(["/beta/r2/recording","/beta/r2/homeflow"])("does not initialize service authentication on isolated campaign %s",path=>{window.history.replaceState({},"",path);render(<ProviderMemorySync/>);expect(getSession).not.toHaveBeenCalled();});
it.each(["/beta","/planner","/recipes"])("preserves existing authentication sync on %s",path=>{window.history.replaceState({},"",path);render(<ProviderMemorySync/>);expect(getSession).toHaveBeenCalledTimes(1);});
it("starts ordinary service sync after leaving R2 without a document reload and pauses on return",()=>{
  window.history.replaceState({},"","/beta/r2/recording");const view=render(<ProviderMemorySync/>);
  expect(getSession).not.toHaveBeenCalled();
  window.history.replaceState({},"","/privacy");view.rerender(<ProviderMemorySync/>);
  expect(getSession).toHaveBeenCalledTimes(1);
  window.history.replaceState({},"","/planner");view.rerender(<ProviderMemorySync/>);
  expect(getSession).toHaveBeenCalledTimes(1);
  window.history.replaceState({},"","/beta/r2/homeflow");view.rerender(<ProviderMemorySync/>);
  expect(getSession).toHaveBeenCalledTimes(1);
});
