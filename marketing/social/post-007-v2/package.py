from pathlib import Path
import zipfile,json,hashlib
root=Path('D:/Project/MyPetLink/Marketing/Videos/post-007-v2')
archive=root/'output/MyPetLink_Post_007_v2_Editable_Project.zip'
files=[]
for folder in ['source','assets','frames','recordings']:
    files += [p for p in (root/folder).rglob('*') if p.is_file() and p.suffix!='.log' and not any('safety' in part.lower() for part in p.relative_to(root).parts) and p.name!='delivery-manifest.json']
files += [root/n for n in ['README.md','timeline.md','implementation-report.md']]
files += [root/'output/subtitles.srt',root/'output/caption.txt']
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
    for p in files:z.write(p,p.relative_to(root))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'source/playback-review.json' in z.namelist()
    assert 'assets/linko-share-card.jpg' in z.namelist()
    assert 'source/public-profile-journey-verification.json' in z.namelist()
    assert 'assets/ui/recipient-profile-identity.png' in z.namelist()
    assert not any('safety' in name.lower() for name in z.namelist())
manifest={str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [archive,root/'output/MyPetLink_TikTok_Post_007_v2.mp4']}
(root/'source/delivery-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),'zipVerified':True},indent=2))
