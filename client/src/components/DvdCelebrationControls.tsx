import { Headphones, Square, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DvdCelebrationSettings } from "../types";
import { getFileLabel } from "../canvas/config";
import { useToast } from "./ToastProvider";

interface Props { settings: DvdCelebrationSettings; uploading: boolean; onChange: (settings: DvdCelebrationSettings) => void; onSoundUpload: (event: React.ChangeEvent<HTMLInputElement>) => void; }

export function DvdCelebrationControls({ settings, uploading, onChange, onSoundUpload }: Props) {
  const toast = useToast();
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopPreview = () => {
    previewRef.current?.pause();
    previewRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    setPlaying(false);
  };
  useEffect(() => stopPreview, []);
  const preview = () => {
    if (playing) {
      stopPreview();
      return;
    }
    if (settings.soundUrl) {
      const audio = new Audio(settings.soundUrl);
      audio.volume = settings.volume;
      previewRef.current = audio;
      const finished = () => previewRef.current === audio && stopPreview();
      audio.addEventListener("ended", finished, { once: true });
      audio.addEventListener("error", finished, { once: true });
      setPlaying(true);
      void audio.play().then(() => toast.info("Previewing DVD corner sound locally"), () => { finished(); toast.error("DVD sound preview could not be played"); });
      return;
    }
    const context = new AudioContext();
    contextRef.current = context;
    [659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + index * 0.11;
      oscillator.type = "triangle"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(Math.max(0.001, settings.volume * 0.22), start); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.21);
    });
    timerRef.current = window.setTimeout(stopPreview, 600);
    setPlaying(true);
    toast.info("Previewing built-in DVD corner chime locally");
  };
  return <div className="dvd-inline-settings">
    <div className="dvd-inline-settings__sound"><span>Corner sound</span><strong title={settings.soundUrl ?? undefined}>{settings.soundUrl ? getFileLabel(settings.soundUrl) : "Built-in chime"}</strong><button className="ui-icon-button" onClick={preview} title={playing ? "Stop the preview" : "Preview corner sound on this dashboard"}>{playing ? <Square size={11} fill="currentColor"/> : <Headphones size={13}/>}</button></div>
    <label><span>Volume</span><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => onChange({ ...settings, volume: Number(event.target.value) })}/><output>{Math.round(settings.volume * 100)}%</output></label>
    <label><span>Counter</span><select value={settings.counterPosition} onChange={(event) => { onChange({ ...settings, counterPosition: event.target.value as DvdCelebrationSettings["counterPosition"] }); toast.success(`DVD counter moved to ${event.target.options[event.target.selectedIndex].text.toLowerCase()}`); }} title="Choose the corner counter position"><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
    <div className="dvd-inline-settings__actions"><label className="ui-button ui-button--compact" title="Upload a DVD corner sound"><Upload size={12}/>{uploading ? "Uploading…" : settings.soundUrl ? "Replace sound" : "Upload sound"}<input hidden type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" disabled={uploading} onChange={onSoundUpload}/></label><button className="ui-button ui-button--compact" disabled={!settings.soundUrl} onClick={() => { onChange({ ...settings, soundUrl: null }); toast.success("Using the built-in DVD corner chime"); }}>Built-in chime</button></div>
  </div>;
}
