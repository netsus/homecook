// @vitest-environment jsdom
import React,{useRef,useState} from "react";
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,describe,expect,it,vi} from "vitest";
import {changeExecutionUnit,ExecutionQuantitySheet} from "@/components/cooking/execution-quantity-sheet";
import type {CookingModeIngredient} from "@/types/cooking";
const ingredient:CookingModeIngredient={ingredient_id:"ingredient",standard_name:"두부",amount:200,unit:"g",ingredient_type:"QUANT",scalable:true,display_text:"두부 200g"};
afterEach(cleanup);
function Fixture({save=vi.fn().mockResolvedValue(undefined)}:{save?:(changes:unknown)=>Promise<void>}){const [open,setOpen]=useState(false);const ref=useRef<HTMLButtonElement|null>(null);return <><button ref={ref} onClick={()=>setOpen(true)}>재료 수정</button>{open?<ExecutionQuantitySheet ingredients={[ingredient]} onClose={()=>setOpen(false)} onSave={save} returnFocusRef={ref}/>:null}</>;}
describe("execution quantity edit sheet",()=>{
 it("focuses its title, converts g/kg once, saves current quantities and restores focus",async()=>{
  const user=userEvent.setup();const save=vi.fn().mockResolvedValue(undefined);render(<Fixture save={save}/>);await user.click(screen.getByRole("button",{name:"재료 수정"}));
  const title=screen.getByRole("heading",{name:"이번 요리 재료 수정"});await waitFor(()=>expect(document.activeElement).toBe(title));
  await user.selectOptions(screen.getByRole("combobox",{name:"두부 단위"}),"kg");expect((screen.getByRole("spinbutton",{name:"두부 양"}) as HTMLInputElement).value).toBe("0.2");
  await user.clear(screen.getByRole("spinbutton",{name:"두부 양"}));await user.type(screen.getByRole("spinbutton",{name:"두부 양"}),"0.19");await user.click(screen.getByRole("button",{name:"이번 요리에 적용"}));
  expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:0,amount:.19,unit:"kg"}]);await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("button",{name:"재료 수정"})));
 });
 it("cancels a draft without a write and reopens with the server quantities",async()=>{const user=userEvent.setup(),save=vi.fn();render(<Fixture save={save}/>);await user.click(screen.getByText("재료 수정"));await user.clear(screen.getByRole("spinbutton"));await user.type(screen.getByRole("spinbutton"),"190");await user.click(screen.getByRole("button",{name:"닫기"}));expect(save).not.toHaveBeenCalled();await user.click(screen.getByText("재료 수정"));expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("200");});
 it("requires re-entry after dimension changes, preserves errors and deliberately records unknown",async()=>{
  const user=userEvent.setup(),save=vi.fn().mockRejectedValue(new Error("다른 탭에서 수정됐어요."));render(<Fixture save={save}/>);await user.click(screen.getByText("재료 수정"));await user.selectOptions(screen.getByRole("combobox"),"ml");await user.click(screen.getByRole("button",{name:"이번 요리에 적용"}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole("alert").textContent).toContain("양을 입력");
  await user.click(screen.getByRole("checkbox",{name:"양 미확인"}));await user.click(screen.getByRole("button",{name:"이번 요리에 적용"}));expect(save).toHaveBeenCalledWith([{row_index:0,amount:null,unit:"g"}]);await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("다른 탭"));expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
 });
 it("converts only known compatible dimensions",()=>{expect(changeExecutionUnit({amount:".2",unit:"L",unknown:false},"ml").amount).toBe("200");expect(changeExecutionUnit({amount:"2",unit:"큰술",unknown:false},"g").amount).toBe("");});
});
