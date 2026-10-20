import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo=process.env.MYPETLINK_REPO_ROOT||'C:/Project/MyPetLink';
const {detectPrivateText}=await import(pathToFileURL(path.join(repo,'marketing/demo/scripts/privacy-guard.mjs')));
const require=createRequire(path.join(repo,'package.json'));
const {chromium}=require('playwright-core');
const ffmpeg=require('ffmpeg-static');
const root=process.env.POST007_ROOT || 'D:/Project/MyPetLink/Marketing/Videos/post-007';
await mkdir(root+'/recordings/raw',{recursive:true});
await mkdir(root+'/assets/ui',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--hide-scrollbars']});
const checks=[];
function run(args){return new Promise((resolve,reject)=>{const p=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let e='';p.stderr.on('data',d=>e+=d);p.on('close',c=>c===0?resolve():reject(Error(e.slice(-2000))));});}
async function stable(p){
 await p.waitForLoadState('networkidle',{timeout:7000}).catch(()=>{});
 await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode?.().catch(()=>{})));});
 await p.addStyleTag({content:'nextjs-portal,[data-nextjs-dev-tools-button]{display:none!important} html,body,*{cursor:none!important}'});
}
async function guard(p,expected){
 const text=await p.locator('body').innerText();
 for(const s of expected)if(!text.includes(s))throw Error('Missing '+s);
 const findings=detectPrivateText(text,['+601110000000','support@mypetlink.com.my']);
 if(findings.length)throw Error(findings.join(';'));
 if(/something went wrong|couldn.t connect|could not load/i.test(text))throw Error('Unfinished screen');
 checks.push({expected,privacy:'passed',url:p.url()});
}
async function scroll(p,delta,ms=700){await p.evaluate(({delta,ms})=>new Promise(resolve=>{const y=scrollY,s=performance.now();function tick(now){const t=Math.min(1,(now-s)/ms);scrollTo(0,y+delta*t*t*(3-2*t));if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);}),{delta,ms});}
async function capture(name,route,expected,setup,perform,duration,authenticated=false){
 if(process.argv.includes('--remaining')&&name==='profile')return;
 const only=process.argv.indexOf('--scene');if(only>=0&&process.argv[only+1]!==name)return;
 console.log('Opening',name);
 const c=await browser.newContext({viewport:{width:430,height:700},deviceScaleFactor:2,locale:'en-MY',timezoneId:'Asia/Kuala_Lumpur',colorScheme:'light',permissions:['clipboard-read','clipboard-write'],recordVideo:{dir:root+'/recordings/raw',size:{width:860,height:1400}}});
 // Prevent all remote writes; demo media is served over loopback only.
 await c.route(/https?:\/\//,async r=>{const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&!['GET','HEAD'].includes(r.request().method()))return r.abort();return r.continue();});
 if(authenticated){const a=await(await c.request.post('http://localhost:5281/api/v1/dev-auth/admin-login',{timeout:15000})).json();if(!a.data?.accessToken)throw Error('Local login failed');await c.addInitScript(s=>localStorage.setItem('mypetlink_api_auth_session',JSON.stringify({...s,expiresAt:Date.now()+s.expiresIn*1000})),a.data);}
 const start=Date.now(),p=await c.newPage();p.setDefaultTimeout(15000);
 await p.goto('http://localhost:3000'+route);await stable(p);await p.getByText(expected[0],{exact:true}).first().waitFor();console.log('Ready',name);
 if(setup)await setup(p);await stable(p);await guard(p,expected);
 await p.screenshot({path:root+'/assets/ui/'+name+'.png'});
 const lead=(Date.now()-start)/1000;
 const actionStart=Date.now();await perform(p);
 const elapsed=(Date.now()-actionStart)/1000;
 if(elapsed<duration+.2)await p.waitForTimeout((duration+.2-elapsed)*1000);
 await guard(p,expected);
 await p.screenshot({path:root+'/assets/ui/'+name+'-end.png'});
 const raw=await p.video().path();await c.close();
 await run(['-v','error','-y','-ss',String(lead),'-i',raw,'-t',String(duration),'-vf','crop=430:700:0:0,scale=860:1400:flags=lanczos,fps=30,format=yuv420p','-c:v','libx264','-crf','18','-preset','fast','-an',root+'/recordings/'+name+'.mp4']);
 console.log('Captured',name,duration+'s');
}
try{
 await capture('profile','/p/linko-linkodemo',['Linko','Domestic Shorthair'],null,async p=>{await p.waitForTimeout(650);await scroll(p,110,1500);await p.waitForTimeout(1500);},4);
 await capture('create','/pets/new',['Pet details','Pet name'],async p=>{await p.locator('#create-pet-name').scrollIntoViewIfNeeded();await p.evaluate(()=>scrollBy(0,-230));},async p=>{
   await p.waitForTimeout(350);await p.getByLabel('Pet name',{exact:false}).pressSequentially('Linko',{delay:120});
   await p.getByRole('combobox',{name:'Pet type',exact:false}).click();await p.getByRole('option',{name:'Cat',exact:true}).click();
   await p.waitForTimeout(400);await scroll(p,-180,500);
   await p.locator('input[type=file]').first().setInputFiles(path.join(repo,'marketing/demo/assets/linko-profile.jpg'));
   await p.waitForTimeout(500);await p.screenshot({path:root+'/assets/ui/photo-preview.png'});
 },5,true);
 await capture('photos','/p/linko-linkodemo',['Linko','Moments'],async p=>{await p.getByRole('button',{name:'Moments',exact:true}).scrollIntoViewIfNeeded();},async p=>{
   await p.getByRole('button',{name:'Moments',exact:true}).click();
   await p.getByText('Meet Linko 🐾',{exact:true}).first().waitFor({timeout:10000});
   await scroll(p,220,900);await p.waitForTimeout(700);
 },2);
 await capture('share','/p/linko-linkodemo',['Linko','Copy Link'],async p=>{const button=p.getByRole('button',{name:'Copy Link',exact:true});await button.scrollIntoViewIfNeeded();await button.evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-280));},async p=>{
   await p.waitForTimeout(400);await p.getByRole('button',{name:'Copy Link',exact:true}).click();await p.waitForTimeout(950);
   const clip=await p.evaluate(()=>navigator.clipboard.readText());if(!clip.includes('/p/linko-linkodemo'))throw Error('Profile clipboard verification failed');
   checks.push({actualCopyClick:true,clipboardDestinationVerified:true});
 },2);
 await capture('safety','/q/linkodemo',['Found Linko?','WhatsApp Owner','Safety note'],async p=>{await p.evaluate(()=>scrollTo(0,130));},async p=>{await p.waitForTimeout(300);await scroll(p,100,1000);await p.waitForTimeout(600);},2);
 await writeFile(root+'/source/capture-verification.json',JSON.stringify({checks,recordings:'Actual local application, real API; no substituted responses',photoStep:'Actual local file selection and preview. No remote upload submitted.',messagesSent:0},null,2));
}finally{await browser.close();}
