from pathlib import Path
import json,zipfile,hashlib
root=Path('D:/Project/MyPetLink/Marketing/Videos/post-007')
archive=root/'output/MyPetLink_Post_007_Editable_Project.zip'
files=[]
for folder in ['source','assets','frames']:
    for p in (root/folder).rglob('*'):
        if not p.is_file() or p.suffix=='.log' or p.name.startswith('probe-'):continue
        files.append(p)
files += list((root/'recordings').glob('*.mp4'))
files += [root/'README.md',root/'implementation-report.md',root/'output/caption.txt',root/'output/subtitles.srt',root/'output/MyPetLink_Post_007_Cover.png']
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
    for p in files:z.write(p,p.relative_to(root))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'source/index.html' in z.namelist() and 'source/preview.html' in z.namelist()
manifest={str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [root/'output/MyPetLink_Post_007_Si_Bulus_Punya_Profil_Sendiri.mp4',archive,root/'output/MyPetLink_Post_007_Cover.png']}
(root/'source/delivery-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),'zipVerified':True},indent=2))
