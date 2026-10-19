import {beforeEach,describe,expect,it,vi} from 'vitest';
const {spawn}=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawnSync:spawn}));
import {readV85Approval,registerV85Approval} from '../scripts/lib/youtube-v85-approval.mjs';
const hash='a'.repeat(64);
beforeEach(()=>{spawn.mockReset();spawn.mockReturnValue({status:0,stdout:hash+'\n'});});
describe('independent v85 authorization anchors without actual Keychain access',()=>{
 it('reads only the exact named service and approved account',()=>{expect(readV85Approval()).toBe(hash);expect(spawn.mock.calls[0][0]).toBe('/usr/bin/security');expect(spawn.mock.calls[0][1]).toContain('homecook-youtube-v85-gen50-v1');expect(spawn.mock.calls[0][1]).toContain('approved-plan-sha256');});
 it('creates without update/replace and verifies the persisted non-secret digest',()=>{registerV85Approval(hash);const args=spawn.mock.calls[0][1];expect(args[0]).toBe('add-generic-password');expect(args).not.toContain('-U');expect(spawn).toHaveBeenCalledTimes(2);});
 it('uses a distinct activation seal',()=>{registerV85Approval(hash,'activation-sha256');expect(spawn.mock.calls[0][1]).toContain('activation-sha256');});
 it('uses a distinct create-only continuation anchor while keeping the original account',()=>{registerV85Approval(hash,'approved-continuation-sha256');expect(spawn.mock.calls[0][1]).toContain('approved-continuation-sha256');expect(spawn.mock.calls[0][1]).not.toContain('-U');});
 it('keeps auth successor approval create-only under a third fixed account',()=>{registerV85Approval(hash,'approved-auth-successor-20261018-sha256');expect(spawn.mock.calls[0][1]).toContain('approved-auth-successor-20261018-sha256');expect(spawn.mock.calls[0][1]).not.toContain('-U');});
 it('keeps exact normal-data approval create-only under a fourth fixed account',()=>{registerV85Approval(hash,'approved-normal-data-successor-20261019-sha256');expect(spawn.mock.calls[0][1]).toContain('approved-normal-data-successor-20261019-sha256');expect(spawn.mock.calls[0][1]).not.toContain('-U');});
 it('treats only OS item-not-found as an absent optional fourth anchor',()=>{
  spawn.mockReturnValue({status:44,stdout:''});expect(readV85Approval('approved-normal-data-successor-20261019-sha256',true)).toBeNull();
  expect(()=>readV85Approval('approved-normal-data-successor-20261019-sha256')).toThrow();
  for(const status of [1,36,128]){spawn.mockReturnValue({status,stdout:''});expect(()=>readV85Approval('approved-normal-data-successor-20261019-sha256',true)).toThrow();}
 });
 it('rejects an existing different authorization without replacing it',()=>{spawn.mockReturnValueOnce({status:45,stdout:''}).mockReturnValue({status:0,stdout:'b'.repeat(64)});expect(()=>registerV85Approval(hash)).toThrow();expect(spawn.mock.calls.filter(c=>c[1][0]==='add-generic-password')).toHaveLength(1);});
 it.each(['bad','key','token'])('never opens Keychain for invalid %s input',value=>{expect(()=>registerV85Approval(value)).toThrow();expect(()=>readV85Approval(value)).toThrow();expect(spawn).not.toHaveBeenCalled();});
 it('fails closed when the existing approval cannot be read',()=>{spawn.mockReturnValue({status:1,stdout:''});expect(()=>readV85Approval()).toThrow();});
});
