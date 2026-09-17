import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Scene } from './shared/scene.js';
import { speechRequest, type Casting } from './casting.js';
import { RATE, readWav, writeWav, channelFilter, effectTail, finish, finalWordTiming, type Alignment } from './dsp.js';
export const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
// Keep alerts present in a stream mix while retaining expressive dynamics and
// a true-peak safety margin. The OBS volume control still defaults to 25%.
export const FINAL_TTS_FILTER='loudnorm=I=-14:TP=-1.5:LRA=15';
let ffmpegReadiness:Promise<boolean>|undefined;
export function ffmpegAvailable():Promise<boolean>{
 if(!ffmpegReadiness)ffmpegReadiness=new Promise(resolve=>{
  const child=spawn(ffmpeg,['-version'],{windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>{child.kill();resolve(false);},5000);
  child.once('error',()=>{clearTimeout(timer);resolve(false);});
  child.once('close',code=>{clearTimeout(timer);resolve(code===0);});
 });
 return ffmpegReadiness;
}
export function run(args:string[]):Promise<void> {
  return new Promise((resolve,reject)=>{
    const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-y',...args],{windowsHide:true});
    let error=''; const timer=setTimeout(()=>{child.kill();reject(new Error('Audio processing timed out.'));},120000);
    child.stderr.on('data',d=>{error=(error+d).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(new Error(`FFmpeg could not start: ${e.message}`));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Audio processing failed: ${error}`));});
  });
}
export async function eleven(pathname:string,key:string,body?:unknown):Promise<Response> {
  const response=await fetch(`https://api.elevenlabs.io/v1/${pathname}`,{method:body?'POST':'GET',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
  if(!response.ok) {
    throw new Error(await elevenErrorMessage(response));
  }
  return response;
}
export async function elevenErrorMessage(response:Response):Promise<string> {
  // Provider error metadata is safe to surface; request bodies and credentials
  // are deliberately never included.
  const payload=await response.json().catch(()=>null) as {detail?:{code?:string;message?:string;status?:string;request_id?:string}}|null;
  const detail=payload?.detail;
  const requestId=detail?.request_id?` Request ID: ${detail.request_id}.`:'';
  if(detail?.status==='missing_permissions'||/missing the permission/i.test(detail?.message||'')) {
    const permission=detail?.message?.match(/permission\s+([a-z_]+)/i)?.[1];
    const names:Record<string,string>={
      text_to_speech:'Text to Speech',
      sound_generation:'Sound Effects',
      voices_read:'Voices Read',
      models_read:'Models Read',
    };
    const label=permission?(names[permission]||permission.replaceAll('_',' ')):'the required generation';
    return `ElevenLabs API key is missing the ${label} permission${permission?` (${permission})`:''}. Update the key restrictions in ElevenLabs, then restart or redeploy the server.${requestId}`;
  }
  const messages:Record<number,string>={
    401:'ElevenLabs rejected the server API key. Confirm the key is active and restart or redeploy the server.',
    403:'The ElevenLabs API key or plan does not allow this voice or generation request.',
    429:'ElevenLabs quota or rate limit reached. Wait briefly or check the account usage limit.',
  };
  return `${messages[response.status]||`ElevenLabs returned HTTP ${response.status}. Check the account and voice access.`}${requestId}`;
}
const transientSound=/\b(fart|burp|belch|explosion|blast|thunder|gunshot|shot|slam|impact|bang|crash|burst|pop)\b/i;
export function activeSoundDuration(scene:Scene,hasSpeech:boolean):number {
  const requested=scene.soundDuration??(!hasSpeech&&scene.effect!=='none'?Math.max(0.5,Math.min(1.5,(scene.duration??5)*0.25)):scene.duration??5);
  if(scene.effect==='none'||!scene.duration)return requested;
  // A generated source that fills the whole scene leaves no audible decay.
  // Short impacts reserve most of the scene for the room; sustained ambience
  // keeps more source audio while still guaranteeing an effect tail.
  const sourceLimit=transientSound.test(scene.sound)
    ? Math.max(0.5,Math.min(2,scene.duration*0.3))
    : Math.max(0.5,scene.duration-Math.min(3,Math.max(1,scene.duration*0.35)));
  return Math.min(requested,sourceLimit);
}
export function speechTempo(scene:Scene,naturalSeconds:number):number {
  if(!scene.duration||naturalSeconds<=scene.duration)return 1;
  // An explicit duration describes the complete scene. Fit the paid performance
  // rather than truncating words or silently making the result much longer.
  // Room reverb is audible during speech, so only a short decay needs reserving.
  const tail=scene.effect==='echo'
    ? Math.min(1,scene.duration*0.15)
    : scene.effect==='reverb'
      ? Math.min(0.75,scene.duration*0.1)
      : 0;
  return Math.max(1,naturalSeconds/Math.max(0.5,scene.duration-tail));
}
export function atempoFilters(tempo:number):string[] {
  const filters:string[]=[];
  let remaining=Math.max(1,tempo);
  // Chaining atempo at 2x or below avoids FFmpeg's high-ratio sample skipping.
  while(remaining>2){filters.push('atempo=2');remaining/=2;}
  if(remaining>1.001)filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters;
}
export async function renderAudio(opts:{id:string;scenes:Scene[];mode:'demo'|'elevenlabs';key:string;voices:Record<string,string>;casting?:Casting[];dataDir:string;progress:(message:string)=>void;warning?:(message:string)=>void}) {
  const temp=path.join(opts.dataDir,'work',opts.id); await mkdir(temp,{recursive:true});
  const output=path.join(opts.dataDir,'clips',`${opts.id}.wav`);
  let complete=false;
  try {
    const segments:Float32Array[]=[];
    for(const [index,scene] of opts.scenes.entries()) {
      if(scene.sound==='__silence__'&&!scene.dialogue.trim()) {
        const seconds=scene.duration??1;
        opts.progress(`Scene ${index+1}/${opts.scenes.length}: adding ${seconds}s pause`);
        segments.push(new Float32Array(Math.round(seconds*RATE)));
        continue;
      }
      opts.progress(`Scene ${index+1}/${opts.scenes.length}: generating dry audio`);
      let speech:Float32Array|null=null,sound:Float32Array|null=null;
      let timing:{start:number;end:number}|null=null;
      if(scene.dialogue.trim()) {
        const raw=path.join(temp,`${index}-speech.mp3`),decoded=path.join(temp,`${index}-speech.wav`);
        if(opts.mode==='demo') {
          const length=Math.min(8,Math.max(1,scene.dialogue.length/16));
          await run(['-f','lavfi','-i',`sine=frequency=${scene.voice==='voice1'?220:330}:sample_rate=44100:duration=${length}`,'-af','volume=0.2',raw]);
          timing={start:Math.max(0,length-0.3),end:length};
        } else {
          const voiceId=opts.casting?.find(c=>c.scene===index)?.voiceId || opts.voices[scene.voice];
          if(!voiceId)throw new Error('No voice could be selected for this scene.');
          let response:Response;
          try {response=await eleven(`text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,opts.key,speechRequest(scene));}
          catch(error){throw new Error(`Scene ${index+1} speech generation failed: ${error instanceof Error?error.message:'ElevenLabs request failed.'}`);}
          const payload=await response.json() as {audio_base64:string;alignment?:Alignment;normalized_alignment?:Alignment};
          if(!payload.audio_base64)throw new Error('ElevenLabs returned no speech audio.');
          timing=finalWordTiming(payload.normalized_alignment)||finalWordTiming(payload.alignment);
          await writeFile(raw,Buffer.from(payload.audio_base64,'base64'));
        }
        await run(['-i',raw,'-af',channelFilter(scene),'-ar','44100','-ac','1','-c:a','pcm_s16le',decoded]);
        speech=readWav(await readFile(decoded));
        // Provider character alignment can finish before the real waveform.
        // Measure the decoded file itself so time fitting never clips a word.
        const naturalSpeechSeconds=speech.length/RATE;
        const tempo=speechTempo(scene,naturalSpeechSeconds);
        if(timing&&tempo>1.001) {
          const fitted=path.join(temp,`${index}-speech-fitted.wav`);
          await run(['-i',decoded,'-af',atempoFilters(tempo).join(','),'-ar','44100','-ac','1','-c:a','pcm_s16le',fitted]);
          speech=readWav(await readFile(fitted));
          timing={start:timing.start/tempo,end:timing.end/tempo};
          opts.warning?.(`Scene ${index+1} performance was time-fitted from ${naturalSpeechSeconds.toFixed(1)}s so the complete scene stays within the requested ${scene.duration}s${scene.effect!=='none'?' with room for the effect':''}.`);
        }
      }
      if(scene.sound.trim()) {
        const raw=path.join(temp,`${index}-sound.mp3`),decoded=path.join(temp,`${index}-sound.wav`);
        // Standalone echo needs a dry burst and room for its repeats, not eight seconds of pre-echoed noise.
        const soundDuration=activeSoundDuration(scene,!!speech);
        if(opts.mode==='demo')await run(['-f','lavfi','-i',`anoisesrc=color=pink:sample_rate=44100:duration=${soundDuration}`,'-af','volume=0.12',raw]);
        else {
          const dryDescription=scene.sound.replace(/\b(?:with\s+)?(?:extreme\s+)?(?:echo(?:ing)?|reverb)\b/gi,'').trim();
          let response:Response;
          try {response=await eleven('sound-generation',opts.key,{text:`${dryDescription}. Dry recording, no echo or reverberation.`,duration_seconds:soundDuration,model_id:'eleven_text_to_sound_v2',prompt_influence:0.6});}
          catch(error){throw new Error(`Scene ${index+1} sound generation failed: ${error instanceof Error?error.message:'ElevenLabs request failed.'}`);}
          await writeFile(raw,Buffer.from(await response.arrayBuffer()));
        }
        await run(['-i',raw,'-af','aresample=44100','-ar','44100','-ac','1','-c:a','pcm_s16le',decoded]);
        sound=readWav(await readFile(decoded));
      }
      opts.progress(`Scene ${index+1}/${opts.scenes.length}: applying ${scene.channel==='intercom'?'intercom and ':''}${scene.effect} / ${scene.duration??'natural'}s`);
      let segment:Float32Array;
      try {segment=effectTail(speech||sound!,scene,timing,(natural,requested)=>{
        opts.warning?.(`Scene ${index+1} was requested as ${requested}s, but the generated ${speech?'speech':'sound'} naturally needed ${natural.toFixed(1)}s. The full audio was kept instead of being discarded${scene.effect!=='none'?', leaving less time for the effect decay':''}.`);
      });}
      catch(error){throw new Error(`Scene ${index+1} audio processing failed: ${error instanceof Error?error.message:'The scene could not be processed.'}`);}
      if(speech&&sound){
        if(!scene.duration&&sound.length>segment.length){const expanded=new Float32Array(sound.length);expanded.set(segment);segment=expanded;}
        for(let i=0;i<Math.min(segment.length,sound.length);i++)segment[i]+=sound[i]*scene.backgroundVolume;
      }
      segments.push(finish(segment));
    }
    opts.progress('Saving the finished clip');
    const samples=new Float32Array(segments.reduce((sum,s)=>sum+s.length,0));let offset=0;
    for(const segment of segments){samples.set(segment,offset);offset+=segment.length;}
    await writeFile(output,writeWav(samples));complete=true;return samples.length/RATE;
  } finally {await rm(temp,{recursive:true,force:true});if(!complete) await rm(output,{force:true});}
}
