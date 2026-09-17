import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { postgresConfigured } from "../db/postgres.js";
import { audioUrl, deleteUploadedClip, discordStorageConfigured } from "./discord.js";
import { ffmpegAvailable } from "./audio.js";
import { getTtsPlaybackState, jobs, pauseTtsPlayback, preview, resumeTtsPlayback, setTtsPlaybackEnabled, setTtsPlaybackVolume, stopTtsPlayback, submit } from "./service.js";
import { deleteClip, getClip, listClips, ttsMetadataStorageConfigured } from "./store.js";

export const ttsRouter = Router();
const audioAccess = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

async function status() {
  const services = {
    openai: !!process.env.OPENAI_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    ffmpeg: await ffmpegAvailable(),
    metadata: ttsMetadataStorageConfigured(),
    audioStorage: discordStorageConfigured(),
  };
  return {
    configured: Object.values(services).every(Boolean),
    canReplay: services.metadata && services.audioStorage,
    storageProvider: `Discord attachments + ${postgresConfigured() ? "Neon" : "local"} index`,
    services,
  };
}

// Audio URLs are unguessable clip capabilities, usable by the OBS browser source.
ttsRouter.get('/clips/:id/audio',audioAccess,async(req,res)=>{try{if(!/^[a-f0-9]{32}$/.test(req.params.id)){res.sendStatus(400);return;}const clip=await getClip(req.params.id);if(!clip){res.sendStatus(404);return;}res.setHeader('Cache-Control','no-store');res.redirect(await audioUrl(clip));}catch{res.status(502).json({error:'Saved audio could not be loaded from Discord.'});}});
ttsRouter.use(requireAuth);
ttsRouter.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
const expensive=rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
ttsRouter.get('/status',async(_req,res)=>res.json(await status()));
ttsRouter.get('/state',async(_req,res)=>{try{const [readiness,clips]=await Promise.all([status(),listClips()]);res.json({status:readiness,playback:getTtsPlaybackState(),clips,jobs:[...jobs.values()].reverse().slice(0,20)});}catch{res.status(503).json({error:'TTS storage unavailable. Check DATABASE_URL and the server logs.'});}});
ttsRouter.get('/clips',async(_req,res)=>{try{res.json(await listClips());}catch{res.status(503).json({error:'TTS storage unavailable. Check DATABASE_URL.'});}});
ttsRouter.get('/jobs',(_req,res)=>res.json([...jobs.values()].reverse().slice(0,20)));
ttsRouter.post('/preview',expensive,async(req,res)=>{try{const {prompt}=z.object({prompt:z.string().trim().min(1).max(6000)}).parse(req.body);res.json(await preview(prompt,req.authUser!.id));}catch(e){res.status(400).json({error:e instanceof z.ZodError?'Invalid prompt.':e instanceof Error?e.message:'Preview failed.'});}});
ttsRouter.post('/generate',expensive,async(req,res)=>{try{const input=z.object({prompt:z.string().trim().min(1).max(6000),planId:z.string().uuid().optional(),play:z.boolean().default(true),volume:z.number().min(0).max(1).default(0.25)}).parse(req.body);const {job}=submit({...input,owner:req.authUser!.id,sender:req.authUser!.displayName||req.authUser!.login});res.status(202).json(job);}catch(e){res.status(400).json({error:e instanceof z.ZodError?'Invalid TTS request.':e instanceof Error?e.message:'Generation failed.'});}});
ttsRouter.post('/stop',(_req,res)=>res.json({stopped:stopTtsPlayback()}));
ttsRouter.post('/playback', (req,res)=>{try{
  const input=z.discriminatedUnion('action',[
    z.object({action:z.literal('pause')}),
    z.object({action:z.literal('resume')}),
    z.object({action:z.literal('enable'),enabled:z.boolean()}),
    z.object({action:z.literal('volume'),volume:z.number().min(0).max(1)}),
  ]).parse(req.body);
  const before=getTtsPlaybackState();
  let changed=false;
  if(input.action==='pause')changed=pauseTtsPlayback();
  else if(input.action==='resume')changed=resumeTtsPlayback();
  else if(input.action==='volume')changed=setTtsPlaybackVolume(input.volume);
  else {setTtsPlaybackEnabled(input.enabled);changed=before.enabled!==input.enabled;}
  res.json({changed,state:getTtsPlaybackState()});
}catch(error){res.status(400).json({error:error instanceof Error?error.message:'Invalid playback control.'});}});
ttsRouter.delete('/clips/:id',async(req,res)=>{try{if(!/^[a-f0-9]{32}$/.test(req.params.id)){res.status(400).json({error:'Invalid TTS clip ID.'});return;}const clip=await getClip(req.params.id);if(!clip){res.status(404).json({error:'That saved TTS clip no longer exists.'});return;}await deleteUploadedClip(clip.discordMessageId);await deleteClip(clip.id);res.json({deleted:true});}catch(error){res.status(502).json({error:error instanceof Error?error.message:'Could not delete the saved clip.'});}});
