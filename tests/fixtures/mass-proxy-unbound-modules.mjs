// Test-only copies exercise an unbound PIN regardless of the operating pin state.
import{mkdtempSync,readFileSync,writeFileSync,rmSync}from'node:fs';
import{join,resolve,dirname}from'node:path';
import{pathToFileURL}from'node:url';
export async function unboundMassProxyModules(){
 const root=mkdtempSync('/tmp/hc-mass-proxy-unbound-');
 const sources=['scripts/lib/cooked-weight-mass-proxy-maintenance.mjs','scripts/lib/prelaunch-web-deploy.mjs','scripts/lib/prelaunch-database.mjs','scripts/deploy-prelaunch-web.mjs'];
 const copies=Object.fromEntries(sources.map((source,index)=>[resolve(source),join(root,`${index}.mjs`)]));
 for(const source of sources){let code=readFileSync(source,'utf8');
  if(source.endsWith('/cooked-weight-mass-proxy-maintenance.mjs'))code=code.replace(/^export const MASS_PROXY_REVIEW_PIN = Object\.freeze\(\{[^\n]*\}\);$/gmu,'export const MASS_PROXY_REVIEW_PIN = Object.freeze({ path: null, sha256: null });').replace('new URL("./cooked-weight-mass-proxy-source.json", import.meta.url)',`new URL(${JSON.stringify(pathToFileURL(resolve('scripts/lib/cooked-weight-mass-proxy-source.json')).href)})`);
  code=code.replace(/from (["'])(\.{1,2}\/[^"'\n]+)\1/gu,(_all,_quote,path)=>{const absolute=resolve(dirname(source),path);return`from "${pathToFileURL(copies[absolute]??absolute).href}"`;});
  writeFileSync(copies[resolve(source)],code,{mode:0o600});
 }
 return{feature:await import(pathToFileURL(copies[resolve(sources[0])]).href),web:await import(pathToFileURL(copies[resolve(sources[1])]).href),database:await import(pathToFileURL(copies[resolve(sources[2])]).href),cli:copies[resolve(sources[3])],cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
