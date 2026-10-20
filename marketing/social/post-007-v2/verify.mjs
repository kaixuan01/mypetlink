import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.POST007_V2_ROOT||'D:/Project/MyPetLink/Marketing/Videos/post-007-v2',repo=process.env.MYPETLINK_REPO_ROOT||'C:/Project/MyPetLink';
const require=createRequire(repo+'/package.json'),ffmpeg=require('ffmpeg-static'),probe=require('ffprobe-static').path,sharp=require('sharp'),{chromium}=require('playwright-core');
const jsQR=createRequire('D:/Project/MyPetLink/Marketing/Videos/post-006/project/v2/tools/package.json')('jsqr');
const run=(cmd,args)=>new Promise((res,rej)=>{const p=spawn(cmd,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});const out=[];let err='';p.stdout.on('data',d=>out.push(d));p.stderr.on('data',d=>err+=d);p.on('error',rej);p.on('close',c=>c?rej(Error(err.slice(-3000))):res({out:Buffer.concat(out),err}));});
const file=root+'/output/MyPetLink_TikTok_Post_007_v2.mp4';
const journey=JSON.parse(await readFile(root+'/source/public-profile-journey-verification.json','utf8'));
if(!journey.qrDecodedFromOriginalPixels||!journey.navigationUsedDecodedUrl||!journey.anonymousBrowser||!journey.finderContentAbsent||journey.httpStatus!==200||!new URL(journey.finalUrl).pathname.startsWith('/p/'))throw Error('Public-profile journey not verified');
const composition=await readFile(root+'/source/index.html','utf8');
if(/class="scene safety"|WhatsApp Owner|safety-hold|contact-halo/.test(composition))throw Error('Finder scene remains in composition');
const meta=JSON.parse((await run(probe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file])).out.toString());
const v=meta.streams.find(x=>x.codec_type==='video'),a=meta.streams.find(x=>x.codec_type==='audio');
if(v.width!==1080||v.height!==1920||v.avg_frame_rate!=='30/1'||+v.nb_read_frames!==840||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||a.codec_name!=='aac'||a.channels!==2||Math.abs(+meta.format.duration-28)>.04)throw Error('Technical verification failed');
await writeFile(root+'/source/technical-verification.json',JSON.stringify(meta,null,2));
const decode=await run(ffmpeg,['-v','error','-i',file,'-f','null','-']);if(decode.err.trim())throw Error('Decode errors');
const black=await run(ffmpeg,['-hide_banner','-i',file,'-vf','blackdetect=d=0.03:pix_th=0.05','-an','-f','null','-']);if(/black_start:/.test(black.err))throw Error('Black frame detected');
const blueScan=(await run(ffmpeg,['-v','error','-i',file,'-vf','scale=36:64','-an','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])).out;
let blueMax=0;for(let frame=0;frame<840;frame++){let count=0;for(let j=0;j<2304;j++){const offset=(frame*2304+j)*3,r=blueScan[offset],g=blueScan[offset+1],b=blueScan[offset+2];if(b>100&&g>60&&r<70&&b>r*1.5&&g>r*1.2)count++;}blueMax=Math.max(blueMax,count/2304);}if(blueMax>.85)throw Error('Full-blue frame detected');
const audio=await run(ffmpeg,['-hide_banner','-i',file,'-af','loudnorm=I=-17:TP=-1.5:LRA=6:print_format=json','-vn','-f','null','-']);
const levels=JSON.parse(audio.err.slice(audio.err.lastIndexOf('{')));if(+levels.input_tp>-.5||+levels.input_i< -22)throw Error('Audio level failed');
const sha=b=>createHash('sha256').update(b).digest('hex');const originalSha=sha(await readFile('D:/Project/MyPetLink/MyPetLink_TikTok_Post_007.mp4'));
if(originalSha!==(await readFile(root+'/source/original-v1-sha256.txt','utf8')).trim())throw Error('V1 was changed');
const samples=[.5,2.5,3.5,5.5,6.5,7.5,8.5,9.5,10.5,12.5,13.8,14.5,15.5,16.5,18.5,19.8,20.2,20.9,22.5,23.8,24.5,26.5,27.5];
const thumbs=[];for(let i=0;i<samples.length;i++){const t=samples[i],name=root+'/review/export-'+t+'.jpg';await run(ffmpeg,['-v','error','-y','-ss',String(t),'-i',file,'-frames:v','1','-q:v','2',name]);thumbs.push({input:await sharp(name).resize(216,384).toBuffer(),left:i%5*216,top:Math.floor(i/5)*384});}
await sharp({create:{width:1080,height:1920,channels:3,background:'#fff8f2'}}).composite(thumbs).jpeg({quality:90}).toFile(root+'/review/export-contact-sheet.jpg');
const qrResults={};for(const [label,p] of [['source',root+'/assets/linko-share-card.jpg'],['export16.5',root+'/review/export-16.5.jpg'],['export18.5',root+'/review/export-18.5.jpg'],['export19.8',root+'/review/export-19.8.jpg']]){const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data;qrResults[label]=decoded;if(decoded!=='https://mypetlink.com.my/p/linko-p3nj5udj5dzpyb7cg')throw Error('Card QR mismatch '+label);}
const report={status:'PASS',durationSeconds:+meta.format.duration,resolution:[v.width,v.height],fps:30,frames:+v.nb_read_frames,videoCodec:v.codec_name,audioCodec:a.codec_name,audioSampleRate:+a.sample_rate,audioChannels:a.channels,integratedLUFS:+levels.input_i,truePeakDbTP:+levels.input_tp,audioTempo:120,audioTimeStretch:false,fullDecode:'passed',blackFrames:false,fullBlueFlashes:false,maximumBluePixelFraction:blueMax,originalV1Unchanged:true,originalV1Sha256:originalSha,shareCardSha256:sha(await readFile(root+'/assets/linko-share-card.jpg')),qrResults,publicProfileJourney:{url:journey.finalUrl,anonymousVisit:true,qrDecodedFromOriginalPixels:true,httpStatus:journey.httpStatus,finderSceneRemoved:true},reviewedExportTimes:samples,fileBytes:(await stat(file)).size};
await writeFile(root+'/source/final-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--playback')){
 const html='<!doctype html><html><body style="margin:0;background:#111"><video id="v" controls style="height:95vh" src="../output/MyPetLink_TikTok_Post_007_v2.mp4"></video><button id="play" onclick="document.querySelector(\'#v\').play()">Play V2</button></body></html>';
 await writeFile(root+'/review/playback.html',html);
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
 try{const page=await browser.newPage();await page.goto(pathToFileURL(root+'/review/playback.html').href);await page.evaluate(()=>{window.playback={waiting:0,stalled:0,errors:[],times:[]};const v=document.querySelector('video');v.muted=false;v.volume=1;v.playbackRate=1;v.addEventListener('waiting',()=>window.playback.waiting++);v.addEventListener('stalled',()=>window.playback.stalled++);v.addEventListener('error',()=>window.playback.errors.push(v.error?.message));v.addEventListener('timeupdate',()=>window.playback.times.push(v.currentTime));});await page.click('#play');await page.waitForFunction(()=>document.querySelector('video').ended,{},{timeout:40000});const playback=await page.evaluate(()=>{const v=document.querySelector('video');return{...window.playback,ended:v.ended,duration:v.duration,endedAt:v.currentTime,playbackRate:v.playbackRate,muted:v.muted,width:v.videoWidth,height:v.videoHeight,quality:v.getVideoPlaybackQuality().toJSON?.()||{frames:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames}};});await writeFile(root+'/source/playback-review.json',JSON.stringify(playback,null,2));if(!playback.ended||playback.errors.length)throw Error('Playback failed');console.log('Normal-speed playback completed with audio unmuted.');}finally{await browser.close();}
}
