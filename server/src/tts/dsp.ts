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
export function channelFilter(scene:Scene):string {
  const filters=['aresample=44100'];
  const pitch=characterPitch(scene);
  if(pitch!==1){
    // Lower pitch and formants, then restore the original tempo. These core
    // FFmpeg filters are available on Render without optional audio libraries.
    filters.push(`asetrate=${Math.round(RATE*pitch)}`,'aresample=44100',`atempo=${(1/pitch).toFixed(6)}`);
  }
  if(scene.channel==='intercom')filters.push('highpass=f=420','lowpass=f=2800','acompressor=threshold=0.08:ratio=5:attack=5:release=70:makeup=2','asoftclip=type=tanh:threshold=0.4:output=0.85','equalizer=f=1500:t=q:w=1:g=5');
  if(scene.distant)filters.push('lowpass=f=2200','volume=0.55');
  return filters.join(',');
}
export function characterPitch(scene:Scene):number {
  const direction=`${scene.character||''} ${scene.delivery||''}`.toLowerCase();
  if(/\b(?:giant|huge|massive)\s+(?:cave\s+)?(?:troll|ogre|monster|demon)\b/.test(direction))return 0.72;
  if(/\b(?:troll|ogre|monster|demon)\b/.test(direction))return 0.76;
  if(/\b(?:giant|huge|massive)\b/.test(direction))return 0.8;
  if(/\b(?:deep|very low|low-pitched|low pitched|gravelly)\s+(?:voice|voiced)?\b/.test(direction))return 0.84;
  return 1;
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
  const seconds=natural>requestedSeconds+0.05?natural:requestedSeconds;
  if(seconds!==requestedSeconds)onDurationExpanded?.(natural,requestedSeconds);
  const output=new Float32Array(Math.round(seconds*RATE));output.set(dry.subarray(0,Math.min(end,output.length)));
  if(scene.effect!=='none') {
    const start=spoken?Math.max(0,Math.floor(timing!.start*RATE)):0;
    const seed=dry.subarray(start,end);const onset=Math.min(output.length,end+Math.round(0.12*RATE));
    const remaining=(output.length-onset)/RATE;
    if(scene.effect==='echo'&&remaining>0) {
      const spacing=Math.max(0.3,seed.length/RATE+0.13);
      for(let repeat=0;onset+repeat*spacing*RATE<output.length;repeat++){
        const offset=onset+Math.round(repeat*spacing*RATE);const progress=(offset-onset)/Math.max(1,output.length-onset);
        // A reflection is quieter and loses high frequencies on each return.
        // The tail window controls decay time, not a fixed-volume sample loop.
        const gain=(spoken?0.3:scene.effectStrength==='extreme'?0.6:0.45)*Math.exp(-progress*6.9);
        const cutoff=Math.max(350,3200*Math.pow(0.7,repeat));
        const alpha=1-Math.exp(-2*Math.PI*cutoff/RATE);let low=0;
        const attack=Math.min(seed.length*.3,RATE*(spoken?0.06:0.025));
        const release=Math.min(seed.length*.3,RATE*.08);
        for(let j=0;j<seed.length&&offset+j<output.length;j++){
          low+=alpha*(seed[j]-low);
          const envelope=Math.min(1,j/Math.max(1,attack),(seed.length-1-j)/Math.max(1,release));
          output[offset+j]+=low*gain*Math.max(0,envelope);
        }
      }
    } else if(scene.effect==='reverb') {
      // Parallel damped combs with all-pass diffusion: a dense decay instead of discrete word repeats.
      // Drive the room with the whole utterance, including the scream's onset.
      // This prevents a disconnected repeat of the final syllable when the tail starts.
      // Room reflections also exist during the source, so a provider overrun
      // must not disable the cave sound merely because no decay time remains.
      const roomOnset=Math.round(0.025*RATE);
      const wet=new Float32Array(Math.max(0,output.length-roomOnset));
      const delays=[0.0297,0.0371,0.0411,0.0437,0.0531,0.0617,0.0713,0.0797];
      for(const delay of delays){const size=Math.round(delay*RATE);const ring=new Float32Array(size);let low=0;
        const roomDecay=scene.effectStrength==='extreme'?3.2:1.8;
        const feedback=Math.pow(0.001,delay/roomDecay);
        for(let i=0;i<wet.length;i++){const at=i%size;const value=ring[at];low=0.35*low+0.65*value;ring[at]=(i<end?dry[i]:0)+low*feedback;wet[i]+=value/4;}
      }
      for(const delay of [0.005,0.0017]){const ring=new Float32Array(Math.round(delay*RATE));for(let i=0;i<wet.length;i++){const at=i%ring.length;const value=wet[i];const delayed=ring[at];wet[i]=delayed-0.5*value;ring[at]=value+0.5*wet[i];}}
      // Keep the room gain constant across the speech boundary: no tail volume swell.
      for(let i=0;i<wet.length;i++){
        const at=roomOnset+i;
        const level=scene.effectStrength==='extreme'?0.5:0.32;
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
