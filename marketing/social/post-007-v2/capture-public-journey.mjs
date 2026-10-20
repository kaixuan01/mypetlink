import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.env.MYPETLINK_REPO_ROOT||'C:/Project/MyPetLink',root=process.env.POST007_V2_ROOT||'D:/Project/MyPetLink/Marketing/Videos/post-007-v2';
const require=createRequire(repo+'/package.json'),sharp=require('sharp'),{chromium}=require('playwright-core');
const jsQR=createRequire('D:/Project/MyPetLink/Marketing/Videos/post-006/project/v2/tools/package.json')('jsqr');
const {detectPrivateText}=await import(pathToFileURL(repo+'/marketing/demo/scripts/privacy-guard.mjs'));
const cardFile=root+'/assets/linko-share-card.jpg',bytes=await readFile(cardFile);
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height);
if(!decoded)throw Error('The existing Share Card QR could not be read');
const target=new URL(decoded.data);
if(target.origin!=='https://mypetlink.com.my'||!target.pathname.startsWith('/p/'))throw Error('Share Card does not point to a Share Profile');
await mkdir(root+'/recordings/public-profile-journey',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--hide-scrollbars']});
try{
 const context=await browser.newContext({viewport:{width:430,height:800},deviceScaleFactor:2,locale:'en-MY',recordVideo:{dir:root+'/recordings/public-profile-journey',size:{width:430,height:800}}});
 await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const response=await page.goto(decoded.data,{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('heading',{name:'Linko',exact:true}).waitFor();
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode?.().catch(()=>{})));});
 await page.waitForTimeout(350);
 const text=await page.locator('body').innerText();const privateFindings=detectPrivateText(text,['support@mypetlink.com.my']);
 if(privateFindings.length)throw Error(privateFindings.join(';'));
 if(/Found Linko\?|WhatsApp Owner|Send Found Location/.test(text))throw Error('Finder content appeared on the Share Profile');
 if(page.url()!==decoded.data)throw Error('Unexpected profile redirection');
 await page.screenshot({path:root+'/assets/ui/recipient-profile.png'});
 // Keep the public header, cover, portrait, pet name and metadata. The crop
 // ends above the incidental Smart Tag badge; no product DOM is altered.
 await page.screenshot({path:root+'/assets/ui/recipient-profile-identity.png',clip:{x:0,y:0,width:430,height:448}});
 const nameBox=await page.getByRole('heading',{name:'Linko',exact:true}).boundingBox();
 await page.waitForTimeout(700);
 const video=await page.video().path();
 const evidence={sourceCard:'assets/linko-share-card.jpg',sourceSha256:createHash('sha256').update(bytes).digest('hex'),qrPresent:true,qrDecodedFromOriginalPixels:true,decodedUrl:decoded.data,navigationUsedDecodedUrl:true,finalUrl:page.url(),httpStatus:response.status(),anonymousBrowser:true,cookiesBeforeNavigation:0,authenticatedStorageProvided:false,publicPetName:'Linko',nameBox,finderContentAbsent:true,privacyTextCheck:'passed',profileScreenshot:'assets/ui/recipient-profile.png',rawRecording:video,remoteWritesBlocked:true,messagesSent:0,scanPresentation:'Editorial crop and scan line over the original card QR; actual QR decoding opens the real anonymous browser destination. No phone-camera interface is simulated.'};
 await context.close();await writeFile(root+'/source/public-profile-journey-verification.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
