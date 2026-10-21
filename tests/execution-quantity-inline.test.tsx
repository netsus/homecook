// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ExecutionQuantityInline, executionQuantityText } from '@/components/cooking/execution-quantity-inline';
// Responsive styles are verified in Chrome; this suite checks edit behavior.
vi.mock('@/components/cooking/cook-mode-layout.module.css', () => ({ default: {} }));
import { SnapshotV2CookModeView } from '@/components/cooking/snapshot-v2-cook-mode-view';
import type { CookingModeIngredient, SnapshotV2CookModeData } from '@/types/cooking';
import { toCookingModeIngredient } from '@/lib/server/cooking';
const row: CookingModeIngredient = { ingredient_id: 'tofu', standard_name: '두부', amount: 200, unit: 'g', ingredient_type: 'QUANT', scalable: false, display_text: null };
const data: SnapshotV2CookModeData={session_id:'session',contract_version:'snapshot_v2',mode:'standalone',status:'in_progress',recipe:{id:'recipe',title:'두부 요리',cooking_servings:2,ingredients:[row],steps:[]},pantry_candidates:[]};
afterEach(cleanup);
it('replaces only the number, submits a fraction on Enter, and restores focus', async () => {
 const save=vi.fn().mockResolvedValue(undefined), user=userEvent.setup();
 render(<SnapshotV2CookModeView data={data} onCancel={vi.fn()} onComplete={vi.fn()} onSaveIngredients={save}/>);
 await user.click(screen.getByRole('button',{name:'두부 수량 수정'}));
 const form=screen.getByRole('form',{name:'두부 수량 수정'}), input=within(form).getByRole('textbox',{name:'두부 양'});
 expect(screen.queryByRole('dialog')).toBeNull();expect(within(form).queryByRole('button')).toBeNull();
 expect(within(form).queryByRole('combobox')).toBeNull();expect(within(form).queryByRole('checkbox')).toBeNull();
 expect(within(form).getByText('g')).toBeTruthy();expect(input.getAttribute('enterkeyhint')).toBe('done');
 expect((screen.getByRole('button',{name:'요리 완료'}) as HTMLButtonElement).disabled).toBe(true);
 await user.clear(input); await user.type(input,'1/3{Enter}');
 expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:0,amount:1/3,unit:'g'}]);
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'두부 수량 수정'})));
 expect(executionQuantityText({...row,amount:1/3})).toBe('1/3');expect(executionQuantityText({...row,amount:1/2})).toBe('1/2');expect(executionQuantityText({...row,amount:3/2})).toBe('3/2');
});
it.each(['','0','-1','1/0','abc','1000001','Infinity','1e3'])('keeps invalid input %s visible without saving zero or changing units',async value=>{
 const save=vi.fn(), close=vi.fn(), user=userEvent.setup();render(<ExecutionQuantityInline ingredient={{...row,unit:'ml'}} index={2} onSave={save} onClose={close}/>);
 const input=screen.getByRole('textbox');await user.clear(input);if(value)await user.type(input,value);await user.keyboard('{Enter}');
 expect(save).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();expect((input as HTMLInputElement).value).toBe(value);
});
it('keeps a decimal and the original nullable unit instead of inventing g',async()=>{
 const save=vi.fn().mockResolvedValue(undefined),user=userEvent.setup();render(<ExecutionQuantityInline ingredient={{...row,unit:null}} index={2} onSave={save} onClose={vi.fn()}/>);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'0.25{Enter}');
 expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:2,amount:0.25,unit:null}]);
});
it('keeps a failed draft and supports Escape without another write',async()=>{
 const save=vi.fn().mockRejectedValue(new Error('다른 탭에서 수정됐어요.')), close=vi.fn(),user=userEvent.setup();
 render(<ExecutionQuantityInline ingredient={row} index={0} onSave={save} onClose={close}/>);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'190{Enter}');
 expect((await screen.findByRole('alert')).textContent).toContain('다른 탭');expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('190');expect(close).not.toHaveBeenCalled();
 await user.keyboard('{Escape}');expect(close).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledTimes(1);
});
it('does not submit an IME composition Enter or duplicate a pending save',async()=>{
 let finish!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})), close=vi.fn(),user=userEvent.setup();
 render(<ExecutionQuantityInline ingredient={row} index={0} onSave={save} onClose={close}/>);const input=screen.getByRole('textbox');
 await user.clear(input);await user.type(input,'150');expect(fireEvent.keyDown(input,{key:'Enter',isComposing:true,cancelable:true})).toBe(false);expect(save).not.toHaveBeenCalled();
 await user.keyboard('{Enter}{Enter}{Escape}');expect(save).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
 finish();await waitFor(()=>expect(close).toHaveBeenCalledOnce());
});
it('submits the single-input form used by mobile Done without changing the unit',async()=>{
 const save=vi.fn().mockResolvedValue(undefined),user=userEvent.setup();render(<ExecutionQuantityInline ingredient={{...row,unit:'ml'}} index={0} onSave={save} onClose={vi.fn()}/>);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'0.125');fireEvent.submit(screen.getByRole('form'));
 await waitFor(()=>expect(save).toHaveBeenCalledExactlyOnceWith([{row_index:0,amount:0.125,unit:'ml'}]));
});
it('cancels an unsubmitted number on blur without saving',async()=>{
 const save=vi.fn(),close=vi.fn(),user=userEvent.setup();render(<><ExecutionQuantityInline ingredient={row} index={0} onSave={save} onClose={close}/><button>다른 곳</button></>);
 await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'99');await user.click(screen.getByRole('button',{name:'다른 곳'}));expect(save).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
});
it('does not steal focus back after clicking outside the inline editor',async()=>{
 const user=userEvent.setup(),save=vi.fn();render(<><SnapshotV2CookModeView data={data} onCancel={vi.fn()} onSaveIngredients={save}/><button>다른 곳</button></>);
 await user.click(screen.getByRole('button',{name:'두부 수량 수정'}));await user.clear(screen.getByRole('textbox'));await user.type(screen.getByRole('textbox'),'99');
 const outside=screen.getByRole('button',{name:'다른 곳'});await user.click(outside);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 expect(document.activeElement).toBe(outside);expect(screen.queryByRole('textbox')).toBeNull();expect(save).not.toHaveBeenCalled();
});
it('preserves nonnumeric amounts as text without offering extra editing tools',()=>{
 const unknown={...row,ingredient_id:'salt',standard_name:'소금',amount:null,unit:null,ingredient_type:'TO_TASTE' as const,display_text:'소금 적당량'};
 render(<SnapshotV2CookModeView data={{...data,recipe:{...data.recipe,ingredients:[unknown]}}} onCancel={vi.fn()} onSaveIngredients={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'소금 수량 수정'})).toBeNull();expect(screen.getByText('적당량')).toBeTruthy();
});
it('offers exactly two adjacent post-cook actions without recording consumption',()=>{
 render(<SnapshotV2CookModeView data={{...data,status:'completed'}} onCancel={vi.fn()} returnHref='/recipes/youtube/saved/source'/>);
 const nav=screen.getByRole('navigation',{name:'요리 후 다음 행동'}), back=within(nav).getByRole('link',{name:'돌아가기'}), record=within(nav).getByRole('link',{name:'식사 기록하기'});
 expect(within(nav).getAllByRole('link')).toHaveLength(2);expect(back.parentElement).toBe(record.parentElement);expect(back.getAttribute('href')).toBe('/recipes/youtube/saved/source');expect(record.getAttribute('href')).toBe('/planner?segment=log');
});
it('renders the exact saved fraction after the server projection creates a rounded display label',()=>{
 const projected=toCookingModeIngredient({row:{id:'row',ingredient_id:'tofu',amount:1/3,unit:'g',ingredient_type:'QUANT',scalable:false,display_text:null,ingredients:{standard_name:'두부'}},baseServings:2,cookingServings:2});
 render(<SnapshotV2CookModeView data={{...data,status:'completed',recipe:{...data.recipe,ingredients:[projected]}}} onCancel={vi.fn()}/>);
 expect(screen.getByText('1/3g')).toBeTruthy();expect(projected.amount).toBe(1/3);
});
