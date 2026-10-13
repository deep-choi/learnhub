import { useEffect, useRef, useState } from "react";
import { studyPost } from "../../services/studyImport";
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  abort: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useVoiceConversation(
  onTurn: (text: string) => Promise<string | void>,
) {
  const [state, setState] = useState<
    "off" | "listening" | "thinking" | "speaking"
  >("off");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false),
    epoch = useRef(0),
    recognition = useRef<Recognition | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    submitRef = useRef(onTurn);
  submitRef.current = onTurn;
  const stop = () => {
    active.current = false;
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    recognition.current?.abort();
    recognition.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    abort.current?.abort();
    window.speechSynthesis?.cancel();
    setState("off");
    setTranscript("");
  };
  const fail = (message: string) => {
    stop();
    setError(message);
  };
  const consume = async (text: string, run: number) => {
    if (!active.current || run !== epoch.current) return;
    const clean = text.trim();
    if (!clean) {
      fail("음성을 인식하지 못했습니다. 다시 시작해 주세요.");
      return;
    }
    setTranscript(clean);
    setState("thinking");
    try {
      const reply = await submitRef.current(clean);
      if (!active.current || run !== epoch.current) return;
      if (reply && window.speechSynthesis) {
        setState("speaking");
        const utterance = new SpeechSynthesisUtterance(
          reply.replace(/[#*`]|\[\d+\]/g, "").slice(0, 4000),
        );
        utterance.lang = "ko-KR";
        utterance.voice =
          window.speechSynthesis
            .getVoices()
            .find((v) => v.lang.startsWith("ko")) || null;
        utterance.onend = () => {
          if (active.current && run === epoch.current) void listen(run);
        };
        utterance.onerror = () => {
          if (active.current && run === epoch.current)
            fail("음성 재생을 완료하지 못했습니다.");
        };
        window.speechSynthesis.speak(utterance);
      } else void listen(run);
    } catch {
      if (active.current && run === epoch.current)
        fail("음성 대화를 완료하지 못했습니다.");
    }
  };
  const listen = async (run: number) => {
    if (!active.current || run !== epoch.current) return;
    setTranscript("");
    setState("listening");
    const Constructor =
      (window as VoiceWindow).SpeechRecognition ||
      (window as VoiceWindow).webkitSpeechRecognition;
    if (Constructor) {
      const rec = new Constructor();
      recognition.current = rec;
      rec.lang = "ko-KR";
      rec.continuous = false;
      rec.interimResults = true;
      let final = "";
      rec.onresult = (e) => {
        let interim = "";
        let settled = "";
        for (let i = 0; i < e.results.length; i++) {
          interim += e.results[i][0].transcript;
          if (e.results[i].isFinal) settled += e.results[i][0].transcript;
        }
        final = settled;
        setTranscript(interim);
      };
      rec.onerror = (e) => {
        if (active.current && run === epoch.current)
          fail(
            e.error === "not-allowed"
              ? "마이크 권한이 필요합니다."
              : "음성을 인식하지 못했습니다. 다시 시작해 주세요.",
          );
      };
      rec.onend = () => {
        recognition.current = null;
        if (active.current && run === epoch.current) void consume(final, run);
      };
      try {
        rec.start();
      } catch {
        fail("음성 입력을 시작하지 못했습니다.");
      }
    } else {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
          throw new Error();
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active.current || run !== epoch.current) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = mic;
        const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        );
        const rec = new MediaRecorder(
          mic,
          mime ? { mimeType: mime } : undefined,
        );
        recorder.current = rec;
        const chunks: BlobPart[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.onerror = () => fail("녹음을 완료하지 못했습니다.");
        rec.onstop = async () => {
          if (timer.current) clearTimeout(timer.current);
          mic.getTracks().forEach((t) => t.stop());
          stream.current = null;
          if (!active.current || run !== epoch.current) return;
          setState("thinking");
          try {
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
            if (bytes.length > 4_000_000) throw new Error();
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192)
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            const controller = new AbortController();
            abort.current = controller;
            const result = await studyPost(
              "study-import",
              { mimeType: rec.mimeType.split(";")[0], data: btoa(binary) },
              controller.signal,
            );
            await consume(result.text, run);
          } catch {
            if (active.current && run === epoch.current)
              fail("음성을 인식하지 못했습니다.");
          }
        };
        rec.start();
        timer.current = setTimeout(() => {
          if (rec.state === "recording") rec.stop();
        }, 30_000);
      } catch {
        if (active.current && run === epoch.current)
          fail("마이크 권한과 브라우저 지원을 확인해 주세요.");
      }
    }
  };
  const start = () => {
    stop();
    setError("");
    active.current = true;
    void listen(epoch.current);
  };
  const interrupt = () => {
    stop();
    setError("");
    active.current = true;
    void listen(epoch.current);
  };
  const finishRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return {
    state,
    transcript,
    error,
    start,
    stop,
    interrupt,
    finishRecording,
    recording:
      state === "listening" &&
      !!recorder.current &&
      recorder.current.state === "recording",
    clearError: () => setError(""),
  };
}
