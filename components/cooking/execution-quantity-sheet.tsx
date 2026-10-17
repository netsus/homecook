"use client";
import React,{useRef,useState} from "react";
import {AppBottomSheet} from "@/components/shared/app-overlay";
import {useDialogBoundary} from "@/components/shared/use-dialog-boundary";
import type {CookingModeIngredient} from "@/types/cooking";
export interface ExecutionQuantityDraft {amount:string;unit:string;unknown:boolean}
export function changeExecutionUnit(draft:ExecutionQuantityDraft,unit:string):ExecutionQuantityDraft {
  const factors:Record<string,{kind:string;factor:number}>={g:{kind:"mass",factor:1},kg:{kind:"mass",factor:1000},ml:{kind:"volume",factor:1},L:{kind:"volume",factor:1000}};
  const before=factors[draft.unit],after=factors[unit];
  return {...draft,unit,amount:before&&after&&before.kind===after.kind&&draft.amount!==""?String(Number(draft.amount)*before.factor/after.factor):""};
}
export function ExecutionQuantitySheet({ingredients,onClose,onSave,returnFocusRef}:{ingredients:CookingModeIngredient[];onClose:()=>void;onSave:(changes:Array<{row_index:number;amount:number|null;unit:string|null}>)=>Promise<void>;returnFocusRef:React.RefObject<HTMLButtonElement|null>}) {
 const [drafts,setDrafts]=useState(()=>ingredients.map(row=>({amount:row.amount===null?"":String(row.amount),unit:row.unit??"g",unknown:row.amount===null})));
 const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);
 const panelRef=useRef<HTMLDivElement|null>(null),titleRef=useRef<HTMLHeadingElement|null>(null);
 const {setReturnFocusTarget}=useDialogBoundary({dialogRef:panelRef,initialFocusRef:titleRef,onClose,closeOnEscape:!saving});
 React.useEffect(()=>{setReturnFocusTarget(()=>returnFocusRef.current);},[setReturnFocusTarget,returnFocusRef]);
 const update=(index:number,value:ExecutionQuantityDraft)=>setDrafts(current=>current.map((row,i)=>i===index?value:row));
 const save=async()=>{
  if(saving)return;const changes=[];
  for(const [index,draft] of drafts.entries()){
   const amount=draft.unknown?null:Number(draft.amount);
   if(!draft.unknown&&(!draft.amount||!Number.isFinite(amount)||amount===null||amount<=0||amount>1000000)){setError("양을 입력하거나 ‘양 미확인’을 선택해 주세요.");return;}
   const original=ingredients[index];const unit=draft.unknown?original.unit:draft.unit;
   if(original.amount!==amount||original.unit!==unit)changes.push({row_index:index,amount,unit});
  }
  if(!changes.length){onClose();return;}
  setSaving(true);setError(null);
  try{await onSave(changes);onClose();}catch(cause){setError(cause instanceof Error?cause.message:"저장하지 못했어요. 다시 시도해 주세요.");}finally{setSaving(false);}
 };
 return <AppBottomSheet ariaLabelledBy="execution-quantity-title" title="이번 요리 재료 수정" titleRef={titleRef} titleTabIndex={-1} panelRef={panelRef} panelClassName="sm:max-w-[640px]" onClose={saving?()=>{}:onClose} closeDisabled={saving}
  description="이번 요리의 영양과 예상무게에만 반영해요. 원본 레시피는 그대로예요." footer={<button className="min-h-12 w-full rounded-xl bg-[var(--brand)] px-4 font-bold text-white disabled:opacity-50" disabled={saving} onClick={()=>void save()} type="button">{saving?"저장 중…":"이번 요리에 적용"}</button>}>
  <p className="mb-4 text-sm text-[var(--text-2)]">현재 요리 인분의 양을 입력하세요. g↔kg·ml↔L는 자동 환산하며, 다른 단위로 바꾸면 새 양을 입력해 주세요.</p>
  {error?<p role="alert" className="mb-3 text-sm text-[var(--danger)]">{error}</p>:null}
  <div className="space-y-4">{ingredients.map((row,index)=>{
   const draft=drafts[index];const units=[...new Set([row.unit??"g","g","kg","ml","L"])];
   return <fieldset className="rounded-xl border border-[var(--line)] p-3" key={index} disabled={saving}>
    <legend className="px-1 font-bold">{row.standard_name}</legend>
    <div className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">{row.standard_name} 양</span><input className="min-h-11 w-full rounded-lg border border-[var(--line)] p-2" type="number" inputMode="decimal" min="0.000001" max="1000000" step="any" value={draft.amount} disabled={draft.unknown} onChange={event=>update(index,{...draft,amount:event.target.value})}/></label>
    <label><span className="sr-only">{row.standard_name} 단위</span><select className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2" value={draft.unit} disabled={draft.unknown} onChange={event=>update(index,changeExecutionUnit(draft,event.target.value))}>{units.map(unit=><option key={unit}>{unit}</option>)}</select></label></div>
    <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.unknown} onChange={event=>update(index,{...draft,unknown:event.target.checked})}/>양 미확인</label>
   </fieldset>;
  })}</div>
 </AppBottomSheet>;
}
