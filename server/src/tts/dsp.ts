import type {Scene} from './shared/scene.js';
export const RATE=44100;
export type Alignment={characters:string[];character_start_times_seconds:number[];character_end_times_seconds:number[]};
export function finalWordTiming(alignment:Alignment|null|undefined):{start:number;end:number}|null {
  if(!alignment)return null;
  const text=alignment.characters.join('');
  const last=[...text.matchAll(/[\p{L}\p{N}']+/gu)].pop();
  if(!last)return null;
  const start=alignment.character_start_times_seconds[last.index!];
  const end=alignment.character_end_times_seconds[last.index!+last[0].length-1];
  return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&start>=0?{start,end}:null;
}
export function readWav(bytes:Buffer):Float32Array {
  if(bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Invalid decoded WAV.');
  let pos=12;
  while(pos+8<=bytes.length){const size=bytes.readUInt32LE(pos+4);if(bytes.toString('ascii',pos,pos+4)==='data'){const samples=new Float32Array(Math.floor(size/2));for(let i=0;i<samples.length;i++)samples[i]=bytes.readInt16LE(pos+8+i*2)/32768;return samples;}pos+=8+size+(size%2);}
  throw new Error('Decoded WAV contains no audio.');
}
export function writeWav(samples:Float32Array):Buffer {
  const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(RATE,24);b.writeUInt32LE(RATE*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.round(Math.max(-0.98,Math.min(0.98,samples[i]))*32767),44+i*2);return b;
}
export function channelFilter(scene:Scene,opts:{pitchShift?:boolean;strainDb?:number}={}):string {
  const filters=['aresample=44100'];
  // A voice that was deliberately created for a character is already the right
  // pitch. Shifting it again only smears it, so callers can switch shifting off.
  const pitch=opts.pitchShift===false?1:characterPitch(scene);
  if(pitch!==1){
    // Lower pitch and formants, then restore the original tempo. These core
    // FFmpeg filters are available on Render without optional audio libraries.
    filters.push(`asetrate=${Math.round(RATE*pitch)}`,'aresample=44100',`atempo=${(1/pitch).toFixed(6)}`);
  }
  if(scene.channel==='intercom')filters.push('highpass=f=420','lowpass=f=2800','acompressor=threshold=0.08:ratio=5:attack=5:release=70:makeup=2','asoftclip=type=tanh:threshold=0.4:output=0.85','equalizer=f=1500:t=q:w=1:g=5');
  // The voice model reads a screamed line as a clean, raised voice, which is what
  // sounds thin. Measured against a real scream, the difference is roughness (broadband
  // strain), not pitch or tags. So push the voice hard into a saturator, squash it, then
  // take the top end back down to where a real scream sits.
  if(opts.strainDb&&opts.strainDb>0)filters.push(...strainFilters(opts.strainDb));
  if(scene.distant)filters.push('lowpass=f=2200','volume=0.55');
  return filters.join(',');
}
/** Saturation chain that gives a voice the rough, strained texture of shouting. */
export function strainFilters(driveDb:number):string[] {
  return [`volume=${driveDb.toFixed(1)}dB`,'asoftclip=type=atan:threshold=0.1','acompressor=threshold=0.04:ratio=8:attack=2:release=50:makeup=2','equalizer=f=3200:t=q:w=1:g=-4','lowpass=f=6500'];
}
export function characterPitch(scene:Scene):number {
  // A model's long explanation of a performance often says "deep voice" about a
  // character that has nothing to do with pitch. Read only the character name
  // for planned scenes; the user's own short direction for local ones.
  const identity=(scene.character||'').slice(0,60);
  const direction=`${identity} ${scene.prepared?'':scene.delivery||''}`.toLowerCase();
  if(/\b(?:giant|huge|massive)\s+(?:cave\s+)?(?:troll|ogre|monster|demon)\b/.test(direction))return 0.72;
  if(/\b(?:troll|ogre|monster|demon)\b/.test(direction))return 0.76;
  if(/\b(?:giant|huge|massive)\b/.test(direction))return 0.8;
  if(/\b(?:deep|very low|low-pitched|low pitched|gravelly)\s+(?:voice|voiced)?\b/.test(direction))return 0.84;
  return 1;
}
// A room is a reverb time, a spread of reflection delays, how much high end it
// keeps, and how loud it is. The default is the general room used everywhere
// before; a cathedral is long, wide and bright, which a small-room reverb
// cannot imitate no matter how it is turned up.
export type RoomProfile={decay:number;level:number;delayScale:number;damping:number;predelay:number};
export function roomProfile(scene:Scene):RoomProfile {
  const extreme=scene.effectStrength==='extreme';
  // A sound effect has no last word to repeat, and copies of the whole sound sound
  // like it is layered on top of itself. So an echo on a sound is the room fading
  // away slowly and smoothly: longer and wider than plain reverb.
  const soundEcho=!scene.dialogue.trim()&&(scene.effect==='echo'||scene.effect==='both');
  let profile:RoomProfile;
  if(scene.room==='cathedral')profile={decay:extreme?7:4.8,level:extreme?0.8:0.62,delayScale:1.9,damping:0.28,predelay:0.045};
  // A small, close room: short decay, reflections arrive quickly.
  else if(scene.room==='indoor')profile={decay:extreme?1.8:1.1,level:extreme?0.42:0.3,delayScale:0.7,damping:0.42,predelay:0.012};
  // Down a well: narrow and hollow, dull and boomy, with a short early reflection.
  else if(scene.room==='well')profile={decay:extreme?2.6:1.6,level:extreme?0.48:0.36,delayScale:0.55,damping:0.62,predelay:0.008};
  else if(soundEcho)profile={decay:extreme?4.2:2.8,level:extreme?0.55:0.42,delayScale:1.5,damping:0.45,predelay:0.03};
  else profile={decay:extreme?3.2:1.8,level:extreme?0.5:0.32,delayScale:1,damping:0.35,predelay:0.025};
  if(soundEcho&&scene.room)profile={...profile,decay:profile.decay*1.4,level:profile.level*1.15};
  if(soundEcho&&scene.effect==='both')profile={...profile,decay:profile.decay*1.25,level:profile.level*1.15};
  return profile;
}
// Echo repeats only the end of speech. Room reverb is continuous through the utterance.
export function effectTail(dry:Float32Array,scene:Scene,timing:{start:number;end:number}|null,onDurationExpanded?:(naturalSeconds:number,requestedSeconds:number)=>void):Float32Array {
  const spoken=!!scene.dialogue.trim();
  if(spoken && scene.effect!=='none' && !timing)throw new Error('Speech timing was unavailable. Cannot place the effect after the final word.');
  let waveformEnd=dry.length;
  if(spoken&&timing){
    waveformEnd=0;
    // Preserve any audible provider output beyond its reported alignment. This
    // is common with screams, breaths and expressive word endings.
    for(let i=dry.length-1;i>=0;i--){if(Math.abs(dry[i])>0.0005){waveformEnd=i+1;break;}}
  }
  const end=spoken&&timing?Math.min(dry.length,Math.max(waveformEnd,Math.ceil((timing.end+0.12)*RATE))):dry.length;
  // Timestamp trimming must not cut a nonzero waveform directly to silence.
  // Taper only the trailing guard after the aligned word, preserving its consonants.
  if(spoken&&timing){
    dry=dry.slice();
    const fadeStart=Math.max(Math.ceil(timing.end*RATE),end-Math.round(0.025*RATE));
    const fadeLength=end-fadeStart;
    for(let i=fadeStart;i<end;i++){
      const t=(i-fadeStart)/Math.max(1,fadeLength-1);
      dry[i]*=0.5*(1+Math.cos(Math.PI*t));
    }
  }
  const natural=end/RATE;
  // An authored duration is the complete scene length, matching the way the
  // prompt reads: speech/source first, then the effect decays in the time left.
  // Without a duration, preserve the natural source and add an automatic tail.
  const automaticTail=scene.effect==='none'?0:scene.effectStrength==='extreme'?3:2;
  const requestedSeconds=scene.duration??natural+automaticTail;
  // Provider generation is already billable at this point. Never discard good
  // audio merely because its natural performance ran past the requested time.
  // Preserve every spoken word and surface a warning instead.
  // Ignore tiny encoder/alignment drift. It is not actionable and previously
  // produced a warning for virtually every generated scene.
  const overrunTolerance=Math.max(0.35,requestedSeconds*0.05);
  const seconds=natural>requestedSeconds+0.05?natural:requestedSeconds;
  if(natural>requestedSeconds+overrunTolerance)onDurationExpanded?.(natural,requestedSeconds);
  const output=new Float32Array(Math.round(seconds*RATE));output.set(dry.subarray(0,Math.min(end,output.length)));
  if(scene.effect!=='none') {
    const start=spoken?Math.max(0,Math.floor(timing!.start*RATE)):0;
    const seed=dry.subarray(start,end);const onset=Math.min(output.length,end+Math.round(0.12*RATE));
    const remaining=(output.length-onset)/RATE;
    // Echo and room are independent, so they can be combined.
    const wantsEcho=scene.effect==='echo'||scene.effect==='both';
    // Speech repeats its last word. A sound effect's echo is the room fading away (see roomProfile).
    const spokenEcho=wantsEcho&&spoken;
    const wantsReverb=scene.effect==='reverb'||scene.effect==='both'||(wantsEcho&&!spoken);
    if(spokenEcho&&remaining>0) {
      const spacing=Math.max(0.3,seed.length/RATE+0.13);
      for(let repeat=0;onset+repeat*spacing*RATE<output.length;repeat++){
        const offset=onset+Math.round(repeat*spacing*RATE);const progress=(offset-onset)/Math.max(1,output.length-onset);
        // A reflection is quieter and loses high frequencies on each return.
        // The tail window controls decay time, not a fixed-volume sample loop.
        const gain=0.3*Math.exp(-progress*6.9);
        const cutoff=Math.max(350,3200*Math.pow(0.7,repeat));
        const alpha=1-Math.exp(-2*Math.PI*cutoff/RATE);let low=0;
        const attack=Math.min(seed.length*.3,RATE*0.06);
        const release=Math.min(seed.length*.3,RATE*.08);
        for(let j=0;j<seed.length&&offset+j<output.length;j++){
          low+=alpha*(seed[j]-low);
          const envelope=Math.min(1,j/Math.max(1,attack),(seed.length-1-j)/Math.max(1,release));
          output[offset+j]+=low*gain*Math.max(0,envelope);
        }
      }
    }
    if(wantsReverb) {
      // Parallel damped combs with all-pass diffusion: a dense decay instead of discrete word repeats.
      // Drive the room with the whole utterance, including the scream's onset.
      // This prevents a disconnected repeat of the final syllable when the tail starts.
      // Room reflections also exist during the source, so a provider overrun
      // must not disable the cave sound merely because no decay time remains.
      // With an echo as well, the room is fed the source and its echoes together.
      const room=roomProfile(scene);
      const drive=spokenEcho?output.slice():dry;
      const driveEnd=spokenEcho?drive.length:end;
      const roomOnset=Math.round(room.predelay*RATE);
      const wet=new Float32Array(Math.max(0,output.length-roomOnset));
      const delays=[0.0297,0.0371,0.0411,0.0437,0.0531,0.0617,0.0713,0.0797];
      for(const baseDelay of delays){const delay=baseDelay*room.delayScale;const size=Math.round(delay*RATE);const ring=new Float32Array(size);let low=0;
        const feedback=Math.pow(0.001,delay/room.decay);
        for(let i=0;i<wet.length;i++){const at=i%size;const value=ring[at];low=room.damping*low+(1-room.damping)*value;ring[at]=(i<driveEnd?drive[i]:0)+low*feedback;wet[i]+=value/4;}
      }
      for(const delay of [0.005,0.0017]){const ring=new Float32Array(Math.round(delay*RATE));for(let i=0;i<wet.length;i++){const at=i%ring.length;const value=wet[i];const delayed=ring[at];wet[i]=delayed-0.5*value;ring[at]=value+0.5*wet[i];}}
      // Keep the room gain constant across the speech boundary: no tail volume swell.
      for(let i=0;i<wet.length;i++){
        const at=roomOnset+i;
        // The echo already fills the space, so the room is a little quieter beside it.
        const level=room.level*(spokenEcho?0.8:1);
        // Speech needs a clearly audible room without washing out consonants.
        // The former 0.4 multiplier made normal cave reverb easy to miss.
        output[at]+=wet[i]*level*(spoken?0.6:1);
      }
    }
    // The last echo or room reflection must reach silence at the authored
    // boundary instead of being sliced at an arbitrary waveform sample.
    const fade=Math.min(Math.round(0.35*RATE),Math.floor(output.length/4));
    for(let i=output.length-fade;i<output.length;i++){
      const progress=(i-(output.length-fade))/Math.max(1,fade-1);
      output[i]*=0.5*(1+Math.cos(Math.PI*progress));
    }
  }
  return output;
}
export function finish(samples:Float32Array):Float32Array {
  let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));const gain=peak>0.95?0.95/peak:1;
  const fade=Math.min(Math.round(RATE*0.07),Math.floor(samples.length/2));
  for(let i=0;i<samples.length;i++){const edge=Math.min(1,i/(RATE*0.008),(samples.length-1-i)/fade);samples[i]*=gain*Math.max(0,edge);}return samples;
}

// --- Loudness ---------------------------------------------------------------
// ITU-R BS.1770 K-weighted loudness, so every scene can be balanced by how loud
// it sounds rather than by its peak. Speech and generated effects arrive at very
// different levels, and a dense effect like animal screams is far louder than
// speech at the same peak.
type Biquad={b0:number;b1:number;b2:number;a1:number;a2:number};
function kWeighting(rate:number):Biquad[] {
  const shelfK=Math.tan(Math.PI*1681.974450955533/rate),Vh=Math.pow(10,3.999843853973347/20),Vb=Math.pow(Vh,0.4996667741545416),Q1=0.7071752369554196;
  const a0=1+shelfK/Q1+shelfK*shelfK;
  const shelf:Biquad={b0:(Vh+Vb*shelfK/Q1+shelfK*shelfK)/a0,b1:2*(shelfK*shelfK-Vh)/a0,b2:(Vh-Vb*shelfK/Q1+shelfK*shelfK)/a0,a1:2*(shelfK*shelfK-1)/a0,a2:(1-shelfK/Q1+shelfK*shelfK)/a0};
  const hpK=Math.tan(Math.PI*38.13547087602444/rate),Q2=0.5003270373238773;
  const hpA0=1+hpK/Q2+hpK*hpK;
  const highpass:Biquad={b0:1,b1:-2,b2:1,a1:2*(hpK*hpK-1)/hpA0,a2:(1-hpK/Q2+hpK*hpK)/hpA0};
  return [shelf,highpass];
}
/** Integrated loudness in LUFS (mono), or -Infinity for silence. */
export function integratedLoudness(samples:Float32Array,rate=RATE):number {
  if(!samples.length)return -Infinity;
  let signal=Float64Array.from(samples);
  for(const f of kWeighting(rate)){
    const out=new Float64Array(signal.length);let x1=0,x2=0,y1=0,y2=0;
    for(let i=0;i<signal.length;i++){const x=signal[i];const y=f.b0*x+f.b1*x1+f.b2*x2-f.a1*y1-f.a2*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
    signal=out;
  }
  const prefix=new Float64Array(signal.length+1);
  for(let i=0;i<signal.length;i++)prefix[i+1]=prefix[i]+signal[i]*signal[i];
  const block=Math.round(0.4*rate),step=Math.round(0.1*rate);
  const powers:number[]=[];
  if(signal.length<block)powers.push(prefix[signal.length]/signal.length);
  else for(let start=0;start+block<=signal.length;start+=step)powers.push((prefix[start+block]-prefix[start])/block);
  const toLufs=(power:number)=>-0.691+10*Math.log10(power);
  const absolute=powers.filter(power=>power>0&&toLufs(power)>-70);
  if(!absolute.length)return -Infinity;
  const relativeGate=toLufs(absolute.reduce((sum,power)=>sum+power,0)/absolute.length)-10;
  const gated=absolute.filter(power=>toLufs(power)>relativeGate);
  return toLufs((gated.length?gated:absolute).reduce((sum,power)=>sum+power,0)/(gated.length?gated.length:absolute.length));
}
/** Smoothly bends peaks over the knee toward the ceiling instead of hard clipping them. */
export function softLimit(samples:Float32Array,ceiling=0.97,knee=0.7):Float32Array {
  const out=new Float32Array(samples.length),room=ceiling-knee;
  for(let i=0;i<samples.length;i++){const v=samples[i],a=Math.abs(v);out[i]=a<=knee?v:Math.sign(v)*(knee+room*Math.tanh((a-knee)/room));}
  return out;
}
/** Returns a copy at the target loudness. Silence and near-silence are left alone. */
export function normalizeLoudness(samples:Float32Array,targetLufs:number,maxBoostDb=24,peakCeiling=0.97):Float32Array {
  const loudness=integratedLoudness(samples);
  if(!Number.isFinite(loudness))return samples;
  const gainDb=Math.min(maxBoostDb,targetLufs-loudness);
  const gain=Math.pow(10,gainDb/20);
  const scaled=new Float32Array(samples.length);
  for(let i=0;i<samples.length;i++)scaled[i]=samples[i]*gain;
  return softLimit(scaled,peakCeiling,peakCeiling*0.72);
}

/** How loud the voice is moment to moment, 0..1. Fast to rise, slower to fall. */
export function speechEnvelope(speech:Float32Array,rate=RATE):Float32Array {
  const env=new Float32Array(speech.length);
  const attack=1-Math.exp(-1/(0.005*rate)),release=1-Math.exp(-1/(0.12*rate));
  let level=0,peak=0;
  for(let i=0;i<speech.length;i++){const x=Math.abs(speech[i]);level+=(x>level?attack:release)*(x-level);env[i]=level;if(level>peak)peak=level;}
  if(peak>0)for(let i=0;i<env.length;i++)env[i]/=peak;
  return env;
}
/**
 * Mixes a wordless layer under speech, only where the voice is speaking, at
 * about the voice's own loudness scaled by gain. The layer follows the words
 * instead of playing over them as a separate voice.
 */
export function layerUnderSpeech(speech:Float32Array,layer:Float32Array,gain:number):Float32Array {
  const speechLoudness=integratedLoudness(speech);
  if(!Number.isFinite(speechLoudness)||!layer.length)return speech;
  const matched=normalizeLoudness(layer.length>speech.length?layer.subarray(0,speech.length):layer,speechLoudness);
  const env=speechEnvelope(speech);
  const out=new Float32Array(speech.length);
  for(let i=0;i<out.length;i++)out[i]=speech[i]+(i<matched.length?matched[i]*env[i]*gain:0);
  return out;
}

/**
 * Comfort limiter. Pulls down any moment that is much louder than the rest of
 * the clip, measured the way ears hear it (K-weighting emphasises exactly the
 * sharp 2-5 kHz region that makes shrieks painful). Averages hide this: an
 * animal scream can sit at a fine average level and still stab for a few
 * milliseconds. maxOverLu is how far above the clip's typical loudness a moment
 * is allowed to rise. "Typical" is the 70th percentile of short moments, not the
 * average: the spikes would otherwise drag the average up and hide themselves.
 */
export function tameSpikes(samples:Float32Array,maxOverLu:number,rate=RATE):Float32Array {
  if(samples.length<rate*0.2)return samples;
  let signal=Float64Array.from(samples);
  for(const f of kWeighting(rate)){
    const out=new Float64Array(signal.length);let x1=0,x2=0,y1=0,y2=0;
    for(let i=0;i<signal.length;i++){const x=signal[i];const y=f.b0*x+f.b1*x1+f.b2*x2-f.a1*y1-f.a2*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
    signal=out;
  }
  const prefix=new Float64Array(signal.length+1);
  for(let i=0;i<signal.length;i++)prefix[i+1]=prefix[i]+signal[i]*signal[i];
  const window=Math.round(0.1*rate),hop=Math.round(0.025*rate),frames=Math.ceil(samples.length/hop)+1;
  const loudnessOf=new Float64Array(frames).fill(-Infinity);
  for(let k=0;k<frames;k++){
    const centre=k*hop,start=Math.max(0,centre-Math.round(window/2)),end=Math.min(samples.length,centre+Math.round(window/2));
    if(end<=start)continue;
    const power=(prefix[end]-prefix[start])/(end-start);
    if(power>0)loudnessOf[k]=-0.691+10*Math.log10(power);
  }
  const audible=[...loudnessOf].filter(value=>value>-70).sort((a,b)=>a-b);
  if(!audible.length)return samples;
  const reference=audible[Math.floor(audible.length*0.7)];
  const reduction=new Float64Array(frames);
  let any=false;
  for(let k=0;k<frames;k++){
    reduction[k]=Math.max(0,loudnessOf[k]-(reference+maxOverLu));
    if(reduction[k]>0)any=true;
  }
  if(!any)return samples;
  // Start turning down slightly before the spike and release slowly, so it never pumps.
  const held=new Float64Array(frames);
  for(let k=0;k<frames;k++){let m=0;for(let j=Math.max(0,k-4);j<=Math.min(frames-1,k+4);j++)m=Math.max(m,reduction[j]);held[k]=m;}
  const smooth=new Float64Array(frames);
  for(let k=0;k<frames;k++){let sum=0,count=0;for(let j=Math.max(0,k-2);j<=Math.min(frames-1,k+2);j++){sum+=held[j];count++;}smooth[k]=sum/count;}
  const out=new Float32Array(samples.length);
  for(let i=0;i<samples.length;i++){
    const position=i/hop,k=Math.floor(position),fraction=position-k;
    const db=smooth[k]*(1-fraction)+(smooth[Math.min(frames-1,k+1)])*fraction;
    out[i]=samples[i]*Math.pow(10,-db/20);
  }
  return out;
}

// --- Scream tone -------------------------------------------------------------
// Measured on a real recording of one person speaking and then screaming, the
// spectrum shifts in a consistent way: chest and low-mid energy falls away, the
// 500-2000 Hz body comes forward, and almost nothing is left above 4-5 kHz. That
// is why a real scream sounds clear rather than bright. Reproducing that shape
// on a voice is clean (no distortion); saturating it instead sounds crunchy.
type BiquadKind='peak'|'lowshelf'|'highshelf'|'lowpass'|'highpass';
function biquad(kind:BiquadKind,hz:number,q:number,gainDb:number,x:Float32Array,rate=RATE):Float32Array {
  const A=Math.pow(10,gainDb/40),w=2*Math.PI*hz/rate,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*q);
  let b0=1,b1=0,b2=0,a0=1,a1=0,a2=0;
  if(kind==='peak'){b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;}
  else if(kind==='lowshelf'){const t=2*Math.sqrt(A)*alpha;b0=A*((A+1)-(A-1)*c+t);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-t);a0=(A+1)+(A-1)*c+t;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-t;}
  else if(kind==='highshelf'){const t=2*Math.sqrt(A)*alpha;b0=A*((A+1)+(A-1)*c+t);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-t);a0=(A+1)-(A-1)*c+t;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-t;}
  else if(kind==='lowpass'){b0=(1-c)/2;b1=1-c;b2=(1-c)/2;a0=1+alpha;a1=-2*c;a2=1-alpha;}
  else {b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;a0=1+alpha;a1=-2*c;a2=1-alpha;}
  const out=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<x.length;i++){const y=(b0*x[i]+b1*x1+b2*x2-a1*y1-a2*y2)/a0;x2=x1;x1=x[i];y2=y1;y1=y;out[i]=y;}
  return out;
}
/** Gives a raised or screamed voice the spectrum of a real scream. amount scales the shaping: 0 leaves the voice alone. */
export function screamTone(samples:Float32Array,amount=1):Float32Array {
  if(!(amount>0)||!samples.length)return samples;
  const a=amount;
  let out=biquad('highpass',160,0.7,0,samples);
  out=biquad('lowshelf',450,0.7,-5*a,out);
  out=biquad('peak',800,0.8,2*a,out);
  out=biquad('peak',1500,0.8,1.5*a,out);
  out=biquad('peak',3000,0.9,-3*a,out);
  out=biquad('highshelf',4500,0.7,-6*a,out);
  return biquad('lowpass',9000,0.7,0,out);
}
