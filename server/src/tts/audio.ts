import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Scene } from './shared/scene.js';
import { sceneIntensity, speechRequest, type Casting } from './casting.js';
import { RATE, readWav, writeWav, channelFilter, effectTail, finish, finalWordTiming, layerUnderSpeech, normalizeLoudness, screamTone, softLimit, tameSpikes, type Alignment } from './dsp.js';
import { buildSoundPrompt, isHugeSound, isSharpSound, screamLayerPrompt, soundDecodeFilter } from './sound.js';
export const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
// Keep alerts present in a stream mix while retaining expressive dynamics and
// a true-peak safety margin. The OBS volume control still defaults to 25%.
export const FINAL_TTS_FILTER='loudnorm=I=-14:TP=-1.5:LRA=15';
// Standalone effects sit lower than speech alerts, and retain extra peak
// headroom for sharp transients such as explosions and screams.
export const FINAL_SOUND_EFFECT_FILTER='loudnorm=I=-18:TP=-3:LRA=12';
export const MAX_AUTO_SPEECH_TEMPO=1.25;
// Every scene is balanced by how loud it sounds before the scenes are joined.
// Generated effects arrive far louder than speech at the same peak, so a clip
// like foxes / pirate / foxes used to jump out at the listener.
export const SPEECH_TARGET_LUFS=-14;
// A standalone effect sits below speech. Under speech it is set to the speech
// level first, then scaled by the scene's background volume.
export const SOUND_ONLY_TARGET_LUFS=-19;
// How much of the scream layer is heard under a shouted or screamed line.
// How far above its own average a moment of a clip may rise before it is turned
// down. Sharp effects get the tightest limit: a piercing spike makes people leave.
export const SHARP_SOUND_SPIKE_LU=3;
export const SOUND_SPIKE_LU=5;
export const SHOUTED_SPEECH_SPIKE_LU=6;
// The layer is texture under the voice, not a second voice: kept well below it.
export const SCREAM_LAYER_GAIN=0.35;
export const SHOUT_LAYER_GAIN=0.18;
function dial(name:string,fallback:number,max:number):number {
  const setting=(process.env[name]||'').trim().toLowerCase();
  if(!setting)return fallback;
  if(/^(?:off|false|no)$/.test(setting))return 0;
  const value=Number(setting);
  return Number.isFinite(value)?Math.min(max,Math.max(0,value)):fallback;
}
/**
 * TTS_SCREAM_LAYER: how much of a generated wordless scream is mixed under a
 * shouted line. Off by default: it reads as a second person screaming behind the
 * voice. 1 turns it on; 2 is twice as loud. It costs one extra sound-effect request.
 */
export const screamLayerScale=()=>dial('TTS_SCREAM_LAYER',0,3);
/** Drive, in dB, of the saturation that gives shouted and screamed speech its rough texture. */
export const SCREAM_STRAIN_DB=16;
export const SHOUT_STRAIN_DB=10;
/**
 * TTS_SCREAM_STRAIN scales that drive. Off by default: heavy saturation reads as
 * crunchy and harsh, and it cannot turn a calm voice into a scream. 1 is the full
 * effect, which is also what a "through a walkie talkie" style of scream sounds like.
 */
export const screamStrainScale=()=>dial('TTS_SCREAM_STRAIN',0,2);
/**
 * TTS_SCREAM_TONE scales the clean spectral shaping that makes a shouted line sound like
 * a scream instead of a raised voice: 0 or off skips it, 1 is the default, 2 is double.
 */
export const screamToneScale=()=>dial('TTS_SCREAM_TONE',1,2);
/** A shout gets less of the shaping than a scream. */
export const toneAmountFor=(intensity:'normal'|'shout'|'scream'):number=>intensity==='scream'?screamToneScale():intensity==='shout'?screamToneScale()*0.6:0;
export function strainDbFor(intensity:'normal'|'shout'|'scream'):number {
  return intensity==='scream'?SCREAM_STRAIN_DB*screamStrainScale():intensity==='shout'?SHOUT_STRAIN_DB*screamStrainScale():0;
}
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
  const sustained=/\b(?:sustained|drawn[- ]out|prolonged|rumbling|resonant|long|lasting|extended|extreme(?:ly)?)\b/i.test(scene.sound)||isHugeSound(scene.sound);
  let sourceLimit=transientSound.test(scene.sound)&&!sustained
    ? Math.max(0.5,Math.min(2,scene.duration*0.3))
    : Math.max(0.5,scene.duration-Math.min(3,Math.max(1,scene.duration*0.35)));
  // Echoes need room to be heard: half the scene at most is the source itself.
  if(scene.effect==='echo'||scene.effect==='both')sourceLimit=Math.min(sourceLimit,Math.max(0.5,scene.duration*0.5));
  // An oversized sound is slowed by 1/0.7 afterwards, so ask for less to end up at the right length.
  if(isHugeSound(scene.sound))sourceLimit=Math.max(0.5,sourceLimit*0.7);
  return Math.min(requested,sourceLimit);
}
export function speechTempo(scene:Scene,naturalSeconds:number):number {
  if(!scene.duration||naturalSeconds<=scene.duration)return 1;
  // An explicit duration describes the complete scene. Fit the paid performance
  // rather than truncating words or silently making the result much longer.
  // Room reverb is audible during speech, so only a short decay needs reserving.
  const tail=scene.effect==='echo'||scene.effect==='both'
    ? Math.min(1,scene.duration*0.15)
    : scene.effect==='reverb'
      ? Math.min(0.75,scene.duration*0.1)
      : 0;
  // Never turn an expressive delivery into rushed speech just to satisfy an
  // optimistic duration. The full performance is preserved when 1.25x is not
  // enough; the scene warning then suggests a longer authored duration.
  return Math.min(MAX_AUTO_SPEECH_TEMPO,Math.max(1,naturalSeconds/Math.max(0.5,scene.duration-tail)));
}
export function atempoFilters(tempo:number):string[] {
  const filters:string[]=[];
  let remaining=tempo;
  while(remaining<0.5){filters.push('atempo=0.5');remaining/=0.5;}
  // Chaining atempo at 2x or below avoids FFmpeg's high-ratio sample skipping.
  while(remaining>2){filters.push('atempo=2');remaining/=2;}
  if(Math.abs(remaining-1)>0.001)filters.push(`atempo=${remaining.toFixed(6)}`);
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
        await run(['-i',raw,'-af',channelFilter(scene,{pitchShift:!opts.casting?.find(c=>c.scene===index)?.pinned,strainDb:strainDbFor(sceneIntensity(scene))}),'-ar','44100','-ac','1','-c:a','pcm_s16le',decoded]);
        speech=readWav(await readFile(decoded));
        // Provider character alignment can finish before the real waveform.
        // Measure the decoded file itself so time fitting never clips a word.
        const naturalSpeechSeconds=speech.length/RATE;
        const tempo=scene.speechRate??speechTempo(scene,naturalSpeechSeconds);
        if(timing&&Math.abs(tempo-1)>0.001) {
          const fitted=path.join(temp,`${index}-speech-fitted.wav`);
          await run(['-i',decoded,'-af',atempoFilters(tempo).join(','),'-ar','44100','-ac','1','-c:a','pcm_s16le',fitted]);
          speech=readWav(await readFile(fitted));
          timing={start:timing.start/tempo,end:timing.end/tempo};
        }
        const intensity=sceneIntensity(scene);
        speech=normalizeLoudness(screamTone(speech,toneAmountFor(intensity)),SPEECH_TARGET_LUFS);
        const layerScale=screamLayerScale();
        if(opts.mode==='elevenlabs'&&intensity!=='normal'&&layerScale>0) {
          try {
            opts.progress(`Scene ${index+1}/${opts.scenes.length}: adding ${intensity==='scream'?'scream':'shout'} texture`);
            const layerRaw=path.join(temp,`${index}-layer.mp3`),layerDecoded=path.join(temp,`${index}-layer.wav`);
            const seconds=Math.min(30,Math.max(0.5,Math.ceil(speech.length/RATE*10)/10));
            const layerResponse=await eleven('sound-generation',opts.key,{text:screamLayerPrompt(scene.character,intensity),duration_seconds:seconds,model_id:'eleven_text_to_sound_v2',prompt_influence:0.7});
            await writeFile(layerRaw,Buffer.from(await layerResponse.arrayBuffer()));
            // Keep only the body of the scream, so it thickens the voice instead of adding a shriek on top.
            await run(['-i',layerRaw,'-af','aresample=44100,highpass=f=180,lowpass=f=4000','-ar','44100','-ac','1','-c:a','pcm_s16le',layerDecoded]);
            speech=normalizeLoudness(layerUnderSpeech(speech,readWav(await readFile(layerDecoded)),(intensity==='scream'?SCREAM_LAYER_GAIN:SHOUT_LAYER_GAIN)*layerScale),SPEECH_TARGET_LUFS);
            speech=tameSpikes(speech,SHOUTED_SPEECH_SPIKE_LU);
          } catch(error) {
            // The voice alone is still a valid result, and it has already been paid for.
            opts.warning?.(`Scene ${index+1}: the ${intensity} texture could not be added (${error instanceof Error?error.message:'request failed'}), so the voice alone was used.`);
          }
        }
      }
      if(scene.sound.trim()) {
        const raw=path.join(temp,`${index}-sound.mp3`),decoded=path.join(temp,`${index}-sound.wav`);
        // Standalone echo needs a dry burst and room for its repeats, not eight seconds of pre-echoed noise.
        const soundDuration=activeSoundDuration(scene,!!speech);
        if(opts.mode==='demo')await run(['-f','lavfi','-i',`anoisesrc=color=pink:sample_rate=44100:duration=${soundDuration}`,'-af','volume=0.12',raw]);
        else {
          const soundPrompt=buildSoundPrompt(scene.sound);
          let response:Response;
          try {response=await eleven('sound-generation',opts.key,{text:soundPrompt,duration_seconds:soundDuration,model_id:'eleven_text_to_sound_v2',prompt_influence:0.6});}
          catch(error){throw new Error(`Scene ${index+1} sound generation failed: ${error instanceof Error?error.message:'ElevenLabs request failed.'}`);}
          await writeFile(raw,Buffer.from(await response.arrayBuffer()));
        }
        await run(['-i',raw,'-af',soundDecodeFilter(scene.sound),'-ar','44100','-ac','1','-c:a','pcm_s16le',decoded]);
        // Sharp effects keep extra headroom: their spikes, not their average, are what hurts.
        const sharp=isSharpSound(scene.sound);
        sound=normalizeLoudness(readWav(await readFile(decoded)),(speech?SPEECH_TARGET_LUFS:SOUND_ONLY_TARGET_LUFS)-(sharp?2:0),24,sharp?0.45:0.6);
        sound=tameSpikes(sound,sharp?SHARP_SOUND_SPIKE_LU:SOUND_SPIKE_LU);
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
      // Echoes and a room can stack up beyond the raw sound. Hold a finished sound
      // effect to the same comfort limit as the sound it was built from.
      // Then bend any single loud sample instead of letting it through; a brief peak
      // is what stabs even when the loudness is fine.
      if(!speech&&sound)segment=softLimit(tameSpikes(segment,isSharpSound(scene.sound)?SHARP_SOUND_SPIKE_LU:SOUND_SPIKE_LU),0.72,0.5);
      const finished=finish(segment);
      segments.push(finished);
    }
    opts.progress('Saving the finished clip');
    const samples=new Float32Array(segments.reduce((sum,s)=>sum+s.length,0));let offset=0;
    for(const segment of segments){samples.set(segment,offset);offset+=segment.length;}
    await writeFile(output,writeWav(samples));complete=true;return samples.length/RATE;
  } finally {await rm(temp,{recursive:true,force:true});if(!complete) await rm(output,{force:true});}
}
