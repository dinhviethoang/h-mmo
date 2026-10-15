import argparse, json
from pathlib import Path
import cv2
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--prepare',required=True);p.add_argument('--audio-duration',type=float,required=True);p.add_argument('--annotation',required=True);p.add_argument('--duration-ms',type=int,required=True);a=p.parse_args()
img=Path(a.prepare); im=cv2.imread(str(img),cv2.IMREAD_COLOR)
if im is None: raise SystemExit('Cannot read line art image')
h,w=im.shape[:2]; paper=(215,235,245)
# Scale/crop source into y=520..1500, keeping margins clear for title/subtitles.
band_h=980; scale=min(1080/w,band_h/h); nw,nh=round(w*scale),round(h*scale); resized=cv2.resize(im,(nw,nh),interpolation=cv2.INTER_AREA)
canvas=np.full((1920,1080,3),paper,dtype=np.uint8); x=(1080-nw)//2; y=520+(band_h-nh)//2
canvas[y:y+nh,x:x+nw]=resized
gray=cv2.cvtColor(canvas,cv2.COLOR_BGR2GRAY); mask=cv2.threshold(gray,150,255,cv2.THRESH_BINARY_INV)[1]
mask[:510]=0;mask[1510:]=0;mask=cv2.dilate(mask,np.ones((17,17),np.uint8),iterations=2)
n,labels,stats,_=cv2.connectedComponentsWithStats(mask,8); boxes=[]
for x0,y0,bw,bh,area in stats[1:]:
 if area>1800: boxes.append([int(x0),int(y0),int(bw),int(bh),int(area)])
if not boxes: boxes=[[x,y,nw,nh,1]]
while len(boxes)>6:
 boxes.sort(key=lambda b:b[4]); small=boxes.pop(0); c=min(range(len(boxes)),key=lambda i:(boxes[i][0]+boxes[i][2]/2-small[0]-small[2]/2)**2+(boxes[i][1]+boxes[i][3]/2-small[1]-small[3]/2)**2); q=boxes[c];x0=min(q[0],small[0]);y0=min(q[1],small[1]);x1=max(q[0]+q[2],small[0]+small[2]);y1=max(q[1]+q[3],small[1]+small[3]);boxes[c]=[x0,y0,x1-x0,y1-y0,q[4]+small[4]]
boxes.sort(key=lambda b:(round(b[1]/180),b[0])); total=max(a.duration_ms,3000); areas=[max(1,b[4]) for b in boxes];den=sum(areas);start=200;els=[]
for i,b in enumerate(boxes):
 dur=round(total*areas[i]/den);els.append({'id':f'area-{i+1}','sequence':i+1,'region':{'x':b[0],'y':b[1],'width':b[2],'height':b[3]},'reveal':{'startMs':start,'durationMs':dur}});start+=dur
img.write_bytes(cv2.imencode('.png',canvas)[1].tobytes())
Path(a.annotation).write_text(json.dumps({'canvas':{'width':1080,'height':1920},'sceneDurationMs':round(a.audio_duration*1000),'elements':els},ensure_ascii=False,indent=2),encoding='utf-8')
