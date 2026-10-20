import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const source=path.dirname(fileURLToPath(import.meta.url));
const root=source.endsWith('source')?path.dirname(source):(process.env.POST007_V2_ROOT||'D:/Project/MyPetLink/Marketing/Videos/post-007-v2');
const repo=process.env.MYPETLINK_REPO_ROOT||'C:/Project/MyPetLink';
const require=createRequire(repo+'/package.json'),{chromium}=require('playwright-core'),ffmpeg=require('ffmpeg-static');
const run=(cmd,args)=>new Promise((res,rej)=>{const p=spawn(cmd,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',rej);p.on('close',c=>c?rej(Error(err.slice(-3000))):res(out));});
await Promise.all(['source','output','review'].map(p=>mkdir(root+'/'+p,{recursive:true})));
if(path.resolve(source)!==path.resolve(root+'/source'))for(const f of ['index.html','render.mjs','capture.mjs','capture-public-journey.mjs','prepare.mjs','music.py','preview.html'])await copyFile(source+'/'+f,root+'/source/'+f);
await run('python',[root+'/source/music.py']);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files','--hide-scrollbars']});
const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
await page.goto(pathToFileURL(root+'/source/index.html').href);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode()));});
const textChecks=[];
for(const t of [.5,3.5,6.5,10.5,14.5,20.5,24.5]){await page.evaluate(t=>render(t),t);textChecks.push(...await page.evaluate(()=>[...document.querySelectorAll('.scene.on .title,.scene.on .sub')].map(e=>{const range=document.createRange();range.selectNodeContents(e);const b=range.getBoundingClientRect();return{text:e.textContent,right:b.right,bottom:b.bottom,lines:Math.round(b.height/parseFloat(getComputedStyle(e).lineHeight))};})));}
if(textChecks.some(x=>x.right>910))throw Error('Caption exceeds right-side safe area');
await writeFile(root+'/source/text-layout.json',JSON.stringify(textChecks,null,2));
const times=[0,.5,2.8,3.4,5.8,6.4,7.5,8.5,9.8,10.2,12,13.8,14.4,14.8,15.5,16.2,18,19.8,20.2,20.9,22,23.8,24.5,26,27.8];
for(const t of times){await page.evaluate(t=>render(t),t);await page.screenshot({path:root+'/review/'+String(t).replace('.','_')+'.jpg',type:'jpeg',quality:90});}
if(process.argv.includes('--stills')){await browser.close();console.log('V2 review stills ready');process.exit(0);}
const silent=root+'/output/picture-v2.mp4';
const enc=spawn(ffmpeg,['-v','error','-y','-f','image2pipe','-vcodec','mjpeg','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-r','30','-movflags','+faststart',silent],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let errors='';enc.stderr.on('data',d=>errors+=d);const done=new Promise((res,rej)=>enc.on('close',c=>c?rej(Error(errors)):res()));
try{for(let i=0;i<840;i++){await page.evaluate(t=>render(t),i/30);const frame=await page.screenshot({type:'jpeg',quality:94});if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(i%120===0)console.log('Rendered',i,'/ 840');}enc.stdin.end();await done;}finally{await browser.close();}
const final=root+'/output/MyPetLink_TikTok_Post_007_v2.mp4';
await run(ffmpeg,['-v','error','-y','-i',silent,'-i',root+'/assets/original-oyen-pop-120bpm.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-17:TP=-1.5:LRA=6','-c:a','aac','-b:a','192k','-ar','48000','-t','28','-movflags','+faststart',final]);
console.log('DONE',final);
