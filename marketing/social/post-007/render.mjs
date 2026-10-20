import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const source=path.dirname(fileURLToPath(import.meta.url));
const root=source.endsWith('source')?path.dirname(source):(process.env.POST007_ROOT||'D:/Project/MyPetLink/Marketing/Videos/post-007');
const repo=process.env.MYPETLINK_REPO_ROOT||'C:/Project/MyPetLink';
const require=createRequire(repo+'/package.json');
const {chromium}=require('playwright-core'),ffmpeg=require('ffmpeg-static'),probe=require('ffprobe-static').path;
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err.slice(-2000))));});
await Promise.all(['assets','source','output','review','frames'].map(x=>mkdir(root+'/'+x,{recursive:true})));
if(source!==root+'/source'&&path.resolve(source)!==path.resolve(root+'/source'))for(const name of ['render.mjs','index.html','music.py','capture.mjs','preview.html'])await copyFile(source+'/'+name,root+'/source/'+name);
for(const [src,dst] of [['docs/branding/assets/mascots/linko-hero-master.png','linko-hero.png'],['docs/branding/assets/mascots/linko-celebrate-master.png','linko-celebrate.png'],['apps/web/public/logo-horizontal.svg','logo.svg']])await copyFile(repo+'/'+src,root+'/assets/'+dst);
for(const name of ['Poppins-ExtraBold.ttf','Poppins-SemiBold.ttf','OFL.txt'])if(!existsSync(root+'/assets/'+name)){const res=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/'+name);if(!res.ok)throw Error('Font download failed '+name);await writeFile(root+'/assets/'+name,Buffer.from(await res.arrayBuffer()));}
for(const [name,duration] of [['profile',4],['create',5],['photos',2],['share',2],['safety',2]]){
 await mkdir(root+'/frames/'+name,{recursive:true});
 if(process.argv.includes('--refresh')||!existsSync(root+'/frames/'+name+'/'+String(duration*30).padStart(4,'0')+'.jpg'))await run(ffmpeg,['-v','error','-y','-i',root+'/recordings/'+name+'.mp4','-vf','tpad=stop_mode=clone:stop_duration=0.1,fps=30','-frames:v',String(duration*30),'-q:v','3',root+'/frames/'+name+'/%04d.jpg']);
}
await run('python',[root+'/source/music.py']);
const browser=await chromium.launch({executablePath:process.env.MYPETLINK_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files','--hide-scrollbars']});
const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
await page.goto(pathToFileURL(root+'/source/index.html').href);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.src).map(i=>i.decode().catch(()=>{})));});
const times=[0,.5,1.5,3.6,5.8,7.7,9.3,10.8,12.8,14.9,16.9,18.7,21.5,23.8];
for(const t of times){await page.evaluate(t=>render(t),t);await page.screenshot({path:root+'/review/'+String(t).replace('.','_')+'.jpg',type:'jpeg',quality:87});}
await page.evaluate(()=>render(0,true));await page.screenshot({path:root+'/output/MyPetLink_Post_007_Cover.png'});
if(process.argv.includes('--stills')){await browser.close();console.log('Review stills ready');process.exit(0);}
const silent=root+'/output/.picture.mp4';
const encoder=spawn(ffmpeg,['-v','error','-y','-f','image2pipe','-vcodec','mjpeg','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-r','30','-movflags','+faststart',silent],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let error='';encoder.stderr.on('data',d=>error+=d);
const done=new Promise((res,rej)=>encoder.on('close',code=>code===0?res():rej(Error(error))));
for(let i=0;i<720;i++){
 await page.evaluate(t=>render(t),i/30);
 const jpg=await page.screenshot({type:'jpeg',quality:94});
 if(!encoder.stdin.write(jpg))await once(encoder.stdin,'drain');
 if(i%90===0)console.log('Rendered',i,'/ 720');
}
encoder.stdin.end();await done;await browser.close();
const final=root+'/output/MyPetLink_Post_007_Si_Bulus_Punya_Profil_Sendiri.mp4';
await run(ffmpeg,['-v','error','-y','-i',silent,'-i',root+'/assets/original-oyen-pop-120bpm.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-17:TP=-1.5:LRA=6','-c:a','aac','-b:a','192k','-ar','48000','-t','24','-movflags','+faststart',final]);
const metadata=JSON.parse(await run(probe,['-v','error','-show_streams','-show_format','-of','json',final]));
await writeFile(root+'/source/technical-verification.json',JSON.stringify(metadata,null,2));
await run(ffmpeg,['-v','error','-i',final,'-f','null','-']);
console.log('DONE',final);
