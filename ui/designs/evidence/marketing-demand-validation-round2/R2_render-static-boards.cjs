// Static SVG design evidence only. No app, browser, network, or product behavior.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('/Users/cwj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs');
const root = path.resolve(__dirname, '../../../..');
const C = { ink: '#212529', muted: '#495057', blue: '#00A1FF', pale: '#EBF8FF', line: '#495057', soft: '#F8F9FA', white: '#FFFFFF' };
const assets = {};
const assetFiles={logo:'brand/mumeok-logo-horizontal.png',food:'food/jeyuk-recipe-clean.webp',mascot:'characters/beta-success-mascot.webp'};
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const topics = {
  recording: { label:'집밥 영양 기록', title:['내 레시피로 만든 집밥,','먹은 만큼 영양 기록'], desc:'레시피의 재료 정보를 가져와 확인하고, 완성한 요리와 먹은 분량을 기록으로 연결해요.', strip:['내 레시피 → 먹은 분량','추정 영양 기록'], done:'내 레시피부터 먹은 분량의 추정 영양 기록까지 살펴봤어요.', example:['재료와 양 확인','완성한 요리 무게·먹은 양 입력','추정 영양 기록'], caveat:'재료와 양을 확인·수정하고 완성한 요리의 무게와 먹은 양을 직접 입력해요. 영양 정보는 추정치예요.' },
  homeflow: { label:'집밥 준비 흐름', title:['뭐 먹을지 정한 다음,','장보기부터 남은 요리까지'], desc:'요리 계획에 필요한 재료를 모으고, 집에 있는 재료를 빼서 장보고, 남은 요리를 다음 식사로 이어가요.', strip:['계획 → 재료 제외·장보기','요리 → 남은 요리 관리'], done:'계획하고, 집에 있는 재료를 빼고 장본 뒤 요리와 남은 요리 관리까지 살펴봤어요.', example:['요리 계획','보유 재료를 직접 확인·제외한 장보기','요리 완료·남은 요리의 다음 식사'], caveat:'보유 재료를 직접 확인하고 요리 완료와 남은 요리 상태를 표시해요. 냉장고를 자동으로 감지하지 않아요.' }
};
const order=['MENU','LEAD_DONE','EXAMPLE_DONE','SURVEY_DONE','EXAMPLE','SURVEY','LEAD','RECOVERY'];
const geometry=[];
function panel(topic, state, w, completed=false) {
  const t=topics[topic], p=w===320?16:20, cw=w-2*p;
  const a=[];
  function rect(x,y,width,height,fill,stroke='none',r=8){a.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`);}
  function line(s,x,y,size=16,weight=400,fill=C.ink){a.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`);}
  function wrap(s,max,size){let rows=[],row='',n=0;for(const ch of s){const v=/[\u0000-\u007f]/.test(ch)?0.54:1;if(n+v>max/size&&row){rows.push(row);row='';n=0;}row+=ch;n+=v;}if(row)rows.push(row);return rows;}
  function para(s,y,size=16,leading=24,weight=400,fill=C.muted){const rows=Array.isArray(s)?s:wrap(s,cw,size);rows.forEach((r,i)=>line(r,p,y+i*leading,size,weight,fill));return y+rows.length*leading;}
  function img(key,x,y,width,height){a.push(`<image href="${assets[key]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`);}
  function button(s,y,kind='secondary',height=48){if(completed){if(s==='베타 오픈 알림 받기'){s='알림 신청 접수 확인';kind='secondary';}if(s==='의견만 남기기 · 4문항')s='의견 접수 확인';if(s==='사용 예시 먼저 보기'||s==='사용 예시 보기')s='사용 예시 다시 보기';}if(kind!=='text')rect(p,y,cw,height,kind==='primary'?C.blue:C.white,kind==='primary'?'none':C.line);a.push(`<text x="${w/2}" y="${y+height/2+6}" text-anchor="middle" font-size="16" font-weight="700" fill="${C.ink}">${esc(s)}</text>`);geometry.push({topic,state,completed_variant:completed,width:w,label:s,x:p,y,width_px:cw,height_px:height});return y+height;}
  rect(0,0,w,844,C.white,'none',0);img('logo',p,16,120,36);
  line('베타 준비 중'+(state==='MENU'||state==='EXAMPLE'?' · 사용 예시':''),p,80,14,600,C.ink);
  if(state==='MENU'){
    let y=para(t.title,116,w===320?22:24,w===320?30:32,700,C.ink)+4;
    y=para(t.desc,y,16,24)+8;
    rect(p,y,cw,72,C.soft);img('food',p+4,y+4,82,64);t.strip.forEach((r,i)=>line(r,p+94,y+28+i*22,w===320?13:14,600));y+=84;
    y=button('베타 오픈 알림 받기',y,'primary',52)+8;
    y=button('사용 예시 먼저 보기',y)+4;
    y=button('의견만 남기기 · 4문항',y,'text',44)+20;
    y=para(completed?'신청과 의견 접수는 완료됐어요.':'하나만 해도 괜찮아요. 순서는 자유예요.',y,14,22,600,C.ink)+6;
    y=para('현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.',y,14,22)+6;
    button('개인정보처리방침',y,'text',44);
  } else if(state.endsWith('_DONE')){
    line(t.label,p,108,14,600);img('mascot',p,124,64,72);
    const titles={LEAD_DONE:['베타 오픈 알림 신청을','접수했어요'],EXAMPLE_DONE:['사용 예시를 확인했어요'],SURVEY_DONE:['의견을 남겨주셔서','감사해요']};
    let y=para(titles[state],228,w===320?22:24,32,700,C.ink)+8;
    y=para(state==='LEAD_DONE'?'베타 오픈 시 입력한 이메일로 안내드릴게요.':state==='EXAMPLE_DONE'?t.done:'보내주신 의견을 접수했어요. 현재는 답변을 바꾸거나 다시 보낼 수 없어요.',y)+24;
    y=para('여기서 마쳐도 괜찮아요.',y,16,24,700,C.ink)+8;
    y=para('원한다면 다른 활동도 둘러보세요.',y,14,22)+14;
    y=button('메뉴로 돌아가기',y,'primary',52)+8;
    if(state!=='LEAD_DONE')y=button('베타 오픈 알림 받기',y)+4;
    y=button(state==='EXAMPLE_DONE'?'예시 다시 보기':'사용 예시 보기',y,state==='LEAD_DONE'?'secondary':'text',state==='LEAD_DONE'?48:44)+4;
    if(state!=='SURVEY_DONE')button('의견만 남기기 · 4문항',y,'text',44);
  } else if(state==='EXAMPLE'){
    let y=para('사용 예시 · 흐름 요약',120,22,30,700,C.ink)+8;
    y=para('실제 서비스가 아닌 준비된 예시예요.',y,14,22)+8;
    img('food',p,y,96,76);line(t.label,p+108,y+38,14,700);y+=96;
    t.example.forEach((s,i)=>{y=para((i+1)+'. '+s,y,16,26,600,C.ink)+12;});
    y=para(t.caveat,y,14,22)+20;
    y=button('예시 확인 완료',y,'primary',52)+8;
    y=button('이전 장면',y)+4;
    button('메뉴로 돌아가기',y,'text',44);
  } else if(state==='SURVEY'){
    line('의견만 남기기 · 1 / 4',p,120,22,700);
    let y=para('최근 7일 동안 집에서 직접 만든 식사를 몇 번 먹었나요?',162,22,30,700,C.ink)+16;
    ['0번','1~2번','3~5번','6번 이상'].forEach((s,i)=>{rect(p,y,cw,52,i===1?C.pale:C.white,C.line);a.push(`<circle cx="${p+24}" cy="${y+26}" r="9" fill="white" stroke="${C.ink}"/>`);if(i===1)a.push(`<circle cx="${p+24}" cy="${y+26}" r="5" fill="${C.ink}"/>`);line(s,p+46,y+32,16,i===1?700:400);y+=60;});
    y=button('다음',y+8,'primary',52)+4;y=button('메뉴로 돌아가기',y,'text',44)+20;
    para('문항·선택지는 미승인 계약 초안입니다. 최종 카피는 계약 승인 후 동기화합니다.',y,14,22);
  } else {
    let y=para('베타 오픈 알림 받기',120,22,30,700,C.ink)+8;
    y=para('다른 활동을 먼저 하지 않아도 신청할 수 있어요.',y,16,24)+12;
    line('이메일',p,y,16,600);y+=14;rect(p,y,cw,52,C.white,C.line);line('you@example.com',p+12,y+33,16,400,C.muted);y+=78;
    rect(p,y-15,20,20,C.white,C.line,3);line('베타 오픈 알림 목적에 동의 (필수)',p+30,y,w===320?14:16,500);y+=32;
    y=para('동의·보관 종료일·개인정보 안내는 승인 계약의 정확한 내용으로 표시합니다.',y,14,22)+10;
    y=button('개인정보처리방침 보기',y,'text',44)+12;
    rect(p,y,cw,60,C.soft);line('보안 확인 영역',p+12,y+25,14,600);line('실제 검증 UI는 Stage 4에서 확인',p+12,y+46,13,400,C.muted);y+=82;
    if(state==='RECOVERY'){
      y=para('아직 저장되지 않았어요.',y,18,26,700,C.ink)+2;
      y=para('연결을 확인한 뒤 다시 시도해 주세요. 입력은 이 탭에서만 유지되며 새로고침하면 지워져요.',y,14,22)+12;
      y=button('다시 시도',y,'primary',52)+4;
    }else{y=button('알림 신청하기',y,'primary',52)+4;}
    button('메뉴로 돌아가기',y,'text',44);
  }
  return a.join('');
}
function luminance(hex){const a=hex.match(/\w\w/g).map(s=>parseInt(s,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
function contrast(a,b){const v=[luminance(a),luminance(b)].sort((x,y)=>y-x);return Number(((v[0]+.05)/(v[1]+.05)).toFixed(2));}
(async()=>{
  for(const [key,file] of Object.entries(assetFiles)){
    const png=await sharp(fs.readFileSync(path.join(root,'public/assets/funnel',file))).png().toBuffer();
    assets[key]='data:image/png;base64,'+png.toString('base64');
  }
  for(const topic of Object.keys(topics))for(const w of [390,320]){
    const gap=24, margin=24, W=margin*2+4*w+3*gap,H=1880;
    let body=`<rect width="${W}" height="${H}" fill="#F1F3F5"/><text x="24" y="36" font-size="24" font-weight="700" fill="${C.ink}">무먹 R2 · ${topics[topic].label} · ${w}px 정적 설계 초안</text><text x="24" y="66" font-size="16" fill="${C.muted}">각 도면 ${w}×844 · 실제 브라우저 캡처 아님 · 독립 authority pending · 2026-09-11</text>`;
    order.forEach((state,i)=>{const x=margin+(i%4)*(w+gap),y=108+Math.floor(i/4)*880;body+=`<text x="${x}" y="${y-10}" font-size="15" font-weight="700" fill="${C.ink}">${state}</text><g transform="translate(${x} ${y})">${panel(topic,state,w)}</g>`;});
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${body}</svg>`;
    const base=path.join(__dirname,`R2_${topic}_${w}`);fs.writeFileSync(base+'.svg',svg);await sharp(Buffer.from(svg)).png().toFile(base+'.png');
  }
  let variants='<rect width="1400" height="1880" fill="#F1F3F5"/><text x="24" y="36" font-size="24" font-weight="700">무먹 R2 · 완료 상태 보존 · 320px 정적 설계 초안</text><text x="24" y="66" font-size="16">서버 완료가 확인된 경우 · 접수 확인은 입력 폼이 아닌 완료 화면으로 이동 · 실제 동작 검증 아님</text>';
  Object.keys(topics).forEach((topic,row)=>order.slice(0,4).forEach((state,col)=>{const x=24+col*344,y=108+row*880;variants+=`<text x="${x}" y="${y-10}" font-size="14" font-weight="700">${topic} / ${state}</text><g transform="translate(${x} ${y})">${panel(topic,state,320,true)}</g>`;}));
  const variantSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1880" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${variants}</svg>`;
  fs.writeFileSync(path.join(__dirname,'R2_completed-state-variants_320.svg'),variantSvg);
  await sharp(Buffer.from(variantSvg)).png().toFile(path.join(__dirname,'R2_completed-state-variants_320.png'));
  fs.writeFileSync(path.join(__dirname,'R2_static-geometry.json'),JSON.stringify({kind:'static_design_not_runtime',viewports:[320,390],panel_height:844,contrast:{ink_on_blue:contrast('212529','00A1FF'),white_on_blue:contrast('FFFFFF','00A1FF'),body_on_white:contrast('495057','FFFFFF')},controls:geometry},null,2)+'\n');
  console.log('Created four SVG/PNG static boards and static geometry evidence. No browser or service was run.');
})();
