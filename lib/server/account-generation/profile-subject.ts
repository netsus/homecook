import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { createSessionAuthorityInternalRpcClient } from "@/lib/supabase/server";

/** Optional read metadata only. Missing proof never changes ordinary profile reads. */
export async function readProfileAccountGeneration(client: Parameters<typeof readVerifiedAccountGenerationSession>[0], user:{id:string;created_at?:string}):Promise<number|null> {
  if(typeof user.created_at!=="string")return null;
  try {
    const verified=await readVerifiedAccountGenerationSession(client,{id:user.id,created_at:user.created_at},{includeFullLocalSessionRecord:true});
    if(!verified.ok||verified.sessionAuthority.ownerUuid!==user.id)return null;
    const record=verified.sessionAuthority.fullLocalSessionRecord;
    if(!record||record.p_owner_uuid!==user.id)return null;
    const internal=createSessionAuthorityInternalRpcClient();if(!internal)return null;
    const result=await internal.rpc("assert_full_local_session_authority",{
      p_issuer:record.p_issuer,p_owner_uuid:record.p_owner_uuid,p_identity_created_at:record.p_identity_created_at,
      p_session_key_hash:record.p_session_key_hash,p_hmac_key_version:record.p_hmac_key_version,
      p_auth_cutover_epoch:record.p_auth_cutover_epoch,p_session_issued_at:record.p_session_issued_at,
    });
    if(result.error||!result.data||typeof result.data!=="object"||Array.isArray(result.data)
      ||!("binding_state" in result.data)||result.data.binding_state!=="active"
      ||!("expected_account_generation" in result.data)||typeof result.data.expected_account_generation!=="number"
      ||!Number.isSafeInteger(result.data.expected_account_generation)||result.data.expected_account_generation<1)return null;
    return result.data.expected_account_generation;
  }catch{return null;}
}
