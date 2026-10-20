// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ExecutionQuantityInline, executionQuantityText } from '@/components/cooking/execution-quantity-inline';
// Responsive styles are verified in Chrome; this suite checks edit behavior.
vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
import { SnapshotV2CookModeView } from '@/components/cooking/snapshot-v2-cook-mode-view';
import type { CookingModeIngredient, SnapshotV2CookModeData } from '@/types/cooking';
import { toCookingModeIngredient } from '@/lib/server/cooking';
const row: CookingModeIngredient = { ingredient_id: 'tofu', standard_name: '두부', amount: 200, unit: 'g', ingredient_type: 'QUANT', scalable: false, display_text: null };
afterEach(cleanup);
it('opens in the ingredient row, saves a fraction without rounding and prevents completion until closed', async () => {
 const save=vi.fn().mockResolvedValue(undefined), user=userEvent.setup();
 const data: SnapshotV2CookModeData={session_id:'session',contract_version:'snapshot_v2',mode:'standalone',status:'in_progress',recipe:{id:'recipe',title:'두부 요리',cooking_servings:2,ingredients:[row],steps:[]},pantry_candidates:[]};
 render(<SnapshotV2CookModeView data={data} onCancel={vi.fn()} onComplete={vi.fn()} onSaveIngredients={save}/>);
 await user.click(screen.getByRole('button',{name:'두부 수량 수정'}));
 expect(screen.queryByRole('dialog')).toBeNull();
 expect((screen.getByRole('button',{name:'요리 완료'}) as HTMLButtonElement).disabled).toBe(true);
 const input=screen.getByRole('textbox',{name:'두부 양'}); await user.clear(input); await user.type(input,'1/3');
 await user.click(screen.getByRole('button',{name:'저장'}));
 expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:0,amount:1/3,unit:'g'}]);
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'두부 수량 수정'})));
 expect(executionQuantityText({...row,amount:1/3})).toBe('1/3');
 expect(executionQuantityText({...row,amount:1/2})).toBe('1/2');
 expect(executionQuantityText({...row,amount:3/2})).toBe('3/2');
});
it('converts a fraction between compatible units and requires new input for another dimension', async()=>{
 const save=vi.fn().mockResolvedValue(undefined), user=userEvent.setup(); render(<ExecutionQuantityInline ingredient={{...row,amount:1/3,unit:'kg'}} index={2} onSave={save} onClose={vi.fn()}/>);
 await user.selectOptions(screen.getByRole('combobox'),'g');
 expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(String(1000/3));
 await user.selectOptions(screen.getByRole('combobox'),'ml');
 await user.click(screen.getByRole('button',{name:'저장'})); expect(save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeTruthy();
 await user.click(screen.getByRole('checkbox',{name:'양 미확인'})); await user.click(screen.getByRole('button',{name:'저장'}));
 expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:2,amount:null,unit:'kg'}]);
});
it('keeps a failed draft and supports Escape without writing',async()=>{
 const save=vi.fn().mockRejectedValue(new Error('다른 탭에서 수정됐어요.')), close=vi.fn(),user=userEvent.setup();
 render(<ExecutionQuantityInline ingredient={row} index={0} onSave={save} onClose={close}/>);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'190');await user.click(screen.getByRole('button',{name:'저장'}));
 expect((await screen.findByRole('alert')).textContent).toContain('다른 탭'); expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('190');expect(close).not.toHaveBeenCalled();
 await user.keyboard('{Escape}');expect(close).toHaveBeenCalledOnce();
});
it('offers a return link after completed cooking without recording consumption',()=>{
 const data: SnapshotV2CookModeData={session_id:'session',contract_version:'snapshot_v2',mode:'standalone',status:'completed',recipe:{id:'recipe',title:'요리',cooking_servings:2,ingredients:[row],steps:[]},pantry_candidates:[]};
 render(<SnapshotV2CookModeView data={data} onCancel={vi.fn()} returnHref='/recipes/youtube/saved/source'/>);
 expect(screen.getByRole('link',{name:'돌아가기'}).getAttribute('href')).toBe('/recipes/youtube/saved/source');expect(screen.getByRole('link',{name:'식사 기록하기'})).toBeTruthy();
});
it('renders the exact saved fraction after the server projection creates a rounded display label',()=>{
 const projected=toCookingModeIngredient({row:{id:'row',ingredient_id:'tofu',amount:1/3,unit:'g',ingredient_type:'QUANT',scalable:false,display_text:null,ingredients:{standard_name:'두부'}},baseServings:2,cookingServings:2});
 const data:SnapshotV2CookModeData={session_id:'session',contract_version:'snapshot_v2',mode:'standalone',status:'completed',recipe:{id:'recipe',title:'요리',cooking_servings:2,ingredients:[projected],steps:[]},pantry_candidates:[]};
 render(<SnapshotV2CookModeView data={data} onCancel={vi.fn()}/>);
 expect(screen.getByText('1/3g')).toBeTruthy();
 expect(projected.amount).toBe(1/3);
});
