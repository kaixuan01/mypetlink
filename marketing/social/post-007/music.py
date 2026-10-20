"""Original 120 BPM instrumental. All notes and percussion synthesized here; no samples."""
from pathlib import Path
import wave
import numpy as np
ROOT=Path(__file__).resolve().parent
if ROOT.name=='source': ROOT=ROOT.parent
else: ROOT=Path('D:/Project/MyPetLink/Marketing/Videos/post-007')
SR=48000; D=24; beat=.5
rng=np.random.default_rng(7007)
mix=np.zeros((SR*D,2),dtype=np.float64)
def put(at,x,gain=1,pan=0):
    i=round(at*SR); n=min(len(x),len(mix)-i)
    if n>0: mix[i:i+n]+=x[:n,None]*gain*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])
def note(n,d=.55,kind='pluck'):
    t=np.arange(round(d*SR))/SR; f=440*2**((n-69)/12)
    env=(1-np.exp(-t*450))*np.exp(-t*(7 if kind=='pluck' else 4))
    return env*(np.sin(2*np.pi*f*t)+.22*np.sin(2*np.pi*f*2*t)*np.exp(-t*12)+.08*np.sin(2*np.pi*f*3*t))
chords=[(48,[60,64,67,72]),(43,[59,62,67,71]),(45,[60,64,69,72]),(41,[60,65,69,72])]
melody=[[76,79,81,79,76,74,72,74],[74,79,83,81,79,74,71,74],[76,81,84,83,81,76,72,76],[77,81,84,81,79,77,76,72]]
for bar in range(12):
    at=bar*2; bass,chord=chords[bar%4]
    for step in range(8):
        when=at+step*.25
        put(when,note(melody[bar%4][step],.45),.1 if step%2==0 else .06,(-1)**step*.2)
        if step%2==0:
            for j,n in enumerate(chord): put(when+j*.012,note(n,.32),.025,(-1)**j*.3)
        noise=rng.normal(0,1,SR//20); t=np.arange(len(noise))/SR
        put(when,np.diff(noise,prepend=0)*np.exp(-t*140),.005,.3)
    for b in range(4):
        t=np.arange(round(.18*SR))/SR
        if b%2==0:
            put(at+b*beat,np.sin(2*np.pi*(50*t+1.6*(1-np.exp(-t*40))))*np.exp(-t*28),.12)
            put(at+b*beat,note(bass,.4,'bass'),.12)
        else:
            noise=rng.normal(0,1,len(t)); clap=np.diff(noise,prepend=0)*np.exp(-t*52)
            put(at+b*beat,clap,.018)
for when in [3,7,10,12,14,16,18]:
    put(when,note(84,.2),.045)
t=np.arange(len(mix))/SR
mix*=np.minimum(t/.04,1)[:,None]*np.minimum((D-t)/.7,1)[:,None]
mix*=.75/np.max(np.abs(mix))
out=ROOT/'assets/original-oyen-pop-120bpm.wav';out.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((mix*32767).astype('<i2').tobytes())
print(out)
