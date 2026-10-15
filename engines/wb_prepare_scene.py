import argparse,json
from pathlib import Path
import cv2,numpy as np
p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--audio-duration',type=float,required=True);p.add_argument('--annotation',required=True);p.add_argument('--duration-ms',type=int,required=True);p.add_argument('--regions');a=p.parse_args()
image=Path(a.image); src=cv2.imread(str(image),cv2.IMREAD_COLOR)
if src is None: raise SystemExit('Cannot read scene image')
h,w=src.shape[:2]; bg_color=(215,235,245)
if not a.regions:
 corners=np.concatenate([src[:20,:20],src[:20,-20:],src[-20:,:20],src[-20:,-20:]]).reshape(-1,3)
 bg=np.median(corners,axis=0); bg_color=tuple(map(int,np.round(bg)))
 mask=((np.sum(np.abs(src.astype(float)-bg),axis=2)>40)*255).astype(np.uint8)
 mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
 pts=cv2.findNonZero(mask)
 if pts is not None:
  bx,by,bw,bh=cv2.boundingRect(pts); pad_x,pad_y=round(bw*0.04),round(bh*0.04)
  x0,y0=max(0,bx-pad_x),max(0,by-pad_y); x1,y1=min(w,bx+bw+pad_x),min(h,by+bh+pad_y)
  src=src[y0:y1,x0:x1]; h,w=src.shape[:2]
band_top,band_bottom=470,1500; scale=min(1000/w,(band_bottom-band_top)/h); nw,nh=max(1,round(w*scale)),max(1,round(h*scale)); resized=cv2.resize(src,(nw,nh),interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
canvas=np.full((1920,1080,3),bg_color,dtype=np.uint8); ox=(1080-nw)//2; oy=band_top+(band_bottom-band_top-nh)//2; canvas[oy:oy+nh,ox:ox+nw]=resized
if a.regions:
 regions=json.loads(a.regions); sx=nw/w; sy=nh/h
 boxes=[{'x':round(ox+r['x']*sx),'y':round(oy+r['y']*sy),'width':round(r['width']*sx),'height':round(r['height']*sy),'label':r.get('label','line art')} for r in regions]
else:
 gray=cv2.cvtColor(canvas,cv2.COLOR_BGR2GRAY); mask=cv2.threshold(gray,170,255,cv2.THRESH_BINARY_INV)[1]; mask[:band_top]=0; mask[band_bottom:]=0; mask=cv2.dilate(mask,np.ones((21,21),np.uint8),iterations=1)
 count,labels,stats,_=cv2.connectedComponentsWithStats(mask,8); boxes=[]
 for x,y,bw,bh,area in stats[1:]:
  if area>2200: boxes.append([int(x),int(y),int(bw),int(bh),int(area)])
 if not boxes: boxes=[[ox,oy,nw,nh,1]]
 while len(boxes)>8:
  boxes.sort(key=lambda b:b[4]); small=boxes.pop(0); j=min(range(len(boxes)),key=lambda k:(boxes[k][0]-small[0])**2+(boxes[k][1]-small[1])**2); q=boxes[j]; x0=min(q[0],small[0]);y0=min(q[1],small[1]);x1=max(q[0]+q[2],small[0]+small[2]);y1=max(q[1]+q[3],small[1]+small[3]);boxes[j]=[x0,y0,x1-x0,y1-y0,q[4]+small[4]]
 boxes.sort(key=lambda b:(round(b[1]/120),b[0]));boxes=[{'x':b[0],'y':b[1],'width':b[2],'height':b[3],'area':b[4],'label':f'area-{i+1}'} for i,b in enumerate(boxes)]
image.write_bytes(cv2.imencode('.png',canvas)[1].tobytes())
total=max(a.duration_ms,1000); weights=[max(1,r.get('area',r['width']*r['height'])) for r in boxes];den=sum(weights);start=0;elements=[]
for i,r in enumerate(boxes):
 duration=round(total*weights[i]/den);elements.append({'id':r.get('label',f'area-{i+1}'),'sequence':i+1,'region':{k:r[k] for k in ('x','y','width','height')},'reveal':{'startMs':start,'durationMs':duration}});start+=duration
Path(a.annotation).write_text(json.dumps({'canvas':{'width':1080,'height':1920},'sceneDurationMs':round(a.audio_duration*1000),'elements':elements},ensure_ascii=False),encoding='utf-8')
