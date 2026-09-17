import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {interpretPrompt} from './interpreter.js';
import {eleven,FINAL_TTS_FILTER,renderAudio,run} from './audio.js';
import {castScenes,type AccountVoice} from './casting.js';
import {scenesSchema,type Scene} from './shared/scene.js';
import {getClip,saveClip,type TtsClip} from './store.js';
import {deleteUploadedClip,uploadClip} from './discord.js';

export type TtsJob={id:string;createdAt:string;status:'queued'|'running'|'complete'|'failed';message:string;clip?:TtsClip;error?:string;warning?:string};
export const jobs=new Map<string,TtsJob>();
const plans=new Map<string,{prompt:string;scenes:Scene[];owner:string;expires:number}>();
let chain:Promise<unknown>=Promise.resolve();let pending=0;let previews=0;
let play:((clip:TtsClip,volume:number)=>Promise<void>)|undefined;
export type TtsPlaybackState={enabled:boolean;active:boolean;paused:boolean;volume?:number;clipId?:string;prompt?:string;sender?:string};
type PlaybackController={
 stop:()=>boolean;
 pause:()=>boolean;
 resume:()=>boolean;
 setVolume:(volume:number)=>boolean;
 setEnabled:(enabled:boolean)=>TtsPlaybackState;
 state:()=>TtsPlaybackState;
};
let playbackController:PlaybackController|undefined;
export function setTtsPlayer(player:(clip:TtsClip,volume:number)=>Promise<void>){play=player;}
export function setTtsPlaybackController(controller:PlaybackController){playbackController=controller;}
export function stopTtsPlayback(){return playbackController?.stop()??false;}
export function pauseTtsPlayback(){return playbackController?.pause()??false;}
export function resumeTtsPlayback(){return playbackController?.resume()??false;}
export function setTtsPlaybackVolume(volume:number){return playbackController?.setVolume(volume)??false;}
export function setTtsPlaybackEnabled(enabled:boolean){return playbackController?.setEnabled(enabled)??{enabled,active:false,paused:false};}
export function getTtsPlaybackState(){return playbackController?.state()??{enabled:true,active:false,paused:false};}
export function replayId(text:string){return text.trim().match(/^\(?TTS:([a-f0-9]{32})\)?$/i)?.[1].toLowerCase();}
async function voices(){const data=await (await eleven('voices',process.env.ELEVENLABS_API_KEY||'')).json() as {voices:AccountVoice[]};return data.voices;}
export async function preview(prompt:string,owner:string){
 z.string().trim().min(1).max(6000).parse(prompt);
 if(previews>=2)throw new Error('Two previews are already running. Please wait.');
 previews++;
 try{
  const plan=await interpretPrompt(prompt,process.env.OPENAI_API_KEY||'',await voices());
  for(const [id,p] of plans)if(p.expires<Date.now())plans.delete(id);
  if(plans.size>=100)plans.delete(plans.keys().next().value!);
  const planId=randomUUID();plans.set(planId,{prompt,scenes:plan.scenes,owner,expires:Date.now()+15*60*1000});
  return {planId,...plan};
 }finally{previews--;}
}
export function submit(input:{prompt:string;sender:string;owner:string;planId?:string;play:boolean;volume?:number}){
 z.string().trim().min(1).max(6000).parse(input.prompt);
 const volume=z.number().min(0).max(1).parse(input.volume??0.25);
 if(input.play&&!getTtsPlaybackState().enabled)throw new Error('TTS playback is turned off. Turn it on before using an OBS playback action.');
 if(pending>=10)throw new Error('The TTS queue is full. Try again after a clip finishes.');
 let prepared:Scene[]|undefined;
 if(input.planId){const p=plans.get(input.planId);if(!p||p.owner!==input.owner||p.prompt!==input.prompt||p.expires<Date.now())throw new Error('Preview expired or prompt changed. Preview again.');prepared=p.scenes;}
 const job:TtsJob={id:randomUUID(),createdAt:new Date().toISOString(),status:'queued',message:'Waiting in TTS queue'};
 jobs.set(job.id,job);pending++;
 if(jobs.size>100)for(const [id,j] of jobs){if(j.status==='complete'||j.status==='failed'){jobs.delete(id);break;}}
 const completion=chain.then(async()=>{
  job.status='running';let temp:string|undefined;
  const addWarning=(message:string)=>{job.warning=[job.warning,message].filter(Boolean).join(' ');};
  try{
   const token=replayId(input.prompt);let clip:TtsClip|undefined;
   if(token){job.message='Loading saved clip';clip=await getClip(token);if(!clip)throw new Error('TTS token not found.');}
   else{
    if(!process.env.OPENAI_API_KEY||!process.env.ELEVENLABS_API_KEY||!process.env.DISCORD_TTS_WEBHOOK_URL)throw new Error('Configure OpenAI, ElevenLabs and Discord TTS server keys first.');
    // Confirm persistent storage is available before spending generation credits.
    await getClip('storage-check');
    job.message='Interpreting performance';const catalog=await voices();
    const scenes=scenesSchema.parse(prepared||(await interpretPrompt(input.prompt,process.env.OPENAI_API_KEY,catalog)).scenes);
    temp=await mkdtemp(path.join(os.tmpdir(),'overlay-tts-'));await mkdir(path.join(temp,'clips'));
    const id=randomUUID().replaceAll('-','');
    const duration=await renderAudio({id,scenes,mode:'elevenlabs',key:process.env.ELEVENLABS_API_KEY,voices:{},casting:castScenes(scenes,catalog),dataDir:temp,progress:message=>{job.message=message;},warning:addWarning});
    job.message='Encoding and saving to Discord';
    const mp3=path.join(temp,`${id}.mp3`);await run(['-i',path.join(temp,'clips',`${id}.wav`),'-af',FINAL_TTS_FILTER,'-codec:a','libmp3lame','-b:a','128k',mp3]);
    const metadata={id,token:`(TTS:${id})`,prompt:input.prompt,sender:input.sender.slice(0,100),createdAt:new Date().toISOString(),duration};
    const discordMessageId=await uploadClip(await readFile(mp3),metadata);clip={...metadata,discordMessageId};
    try{await saveClip(clip);}catch(error){await deleteUploadedClip(discordMessageId).catch(()=>{});throw error;}
   }
   job.clip=clip;
   if(input.play){
    job.message='Playing on OBS';
    try{if(!play)throw new Error('OBS playback is unavailable.');await play(clip,volume);}
    catch(error){addWarning(error instanceof Error?error.message:'OBS playback failed.');}
   }
   job.status='complete';job.message=input.play?(job.warning?'Clip saved; OBS playback was unavailable':'Playback finished'):'Clip saved';
  }catch(e){job.status='failed';job.error=e instanceof Error?e.message:'TTS failed';job.message='TTS failed';}
  finally{pending--;if(temp)await rm(temp,{recursive:true,force:true});}
 });
 chain=completion.catch(()=>{});
 return {job,completion};
}
