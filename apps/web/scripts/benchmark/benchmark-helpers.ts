import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

export type StageTier = "stage-perfect" | "stage-acceptable" | "stage-unusable";
export type DawTier = "exact" | "close" | "fail";

export type BenchmarkHistoryEntry = {
  id: string;
  timestamp: string;
  gitCommit: string;
  note: string;
  summary: {
    totalMeasures: number;
    exactPct: number;
    closePct: number;
    failPct: number;
    meanMs: number;
    medianMs: number;
    p95Ms: number;
    dawGrade: {
      exactPct: number;
      closePct: number;
      failPct: number;
    };
    stageGrade: {
      perfectPct: number;
      acceptablePct: number;
      unusablePct: number;
    };
  };
  perSong: Record<
    string,
    {
      exactPct: number;
      meanMs: number;
      stageGrade: {
        perfectPct: number;
        acceptablePct: number;
        unusablePct: number;
      };
    }
  >;
};

export function atomicWriteFileSync(
  targetPath: string,
  data: string,
  options?: fs.WriteFileOptions,
): void {
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, data, options);
  fs.renameSync(tmpPath, targetPath);
}

export function parseTimecodeToMs(tc: string): number {
  const parts = tc.trim().split(":");
  if (parts.length >= 3) {
    const hrs = parseInt(parts[0]!, 10);
    const mins = parseInt(parts[1]!, 10);
    const secs = parseInt(parts[2]!, 10);
    let extraMs = 0;
    if (parts[3]) {
      const val = parseFloat(parts[3]);
      extraMs = (val / 25) * 1000;
    }
    const totalMs = (hrs * 3600 + mins * 60 + secs) * 1000 + extraMs;
    return totalMs - 3_600_000;
  }
  return 0;
}

export function parseRtfReference(rtfPath: string): {
  bar: number;
  beat: number;
  bpm: number;
  timecodeMs: number;
}[] {
  const content = fs.readFileSync(rtfPath, "utf-8");
  const lines = content.split("\n");
  const points: {
    bar: number;
    beat: number;
    bpm: number;
    timecodeMs: number;
  }[] = [];

  for (const line of lines) {
    const cleanLine = line
      .replace(/\\tab\s?/g, "\t")
      .replace(/\\[a-z0-9]+\s?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\\$/g, "")
      .trim();
    const parts = cleanLine
      .split("\t")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const firstCol = parts[0]!;
      const barMatch = firstCol.match(/^(\d+)(?:\s+(\d+))?/);
      if (barMatch) {
        const barNum = parseInt(barMatch[1]!, 10);
        const beatNum = barMatch[2] ? parseInt(barMatch[2]!, 10) : 1;
        const bpmStr = parts[1]!.replace(",", ".");
        const bpmVal = parseFloat(bpmStr);
        const tc = parts[2] ?? "";
        const timecodeMs = tc ? parseTimecodeToMs(tc) : 0;
        if (!isNaN(barNum) && !isNaN(bpmVal) && bpmVal > 40 && bpmVal < 250) {
          points.push({ bar: barNum, beat: beatNum, bpm: bpmVal, timecodeMs });
        }
      }
    }
  }
  return points;
}

export function loadAudioBufferFromMp3(mp3Path: string): AudioBuffer {
  const tmpWav = path.join(
    process.cwd(),
    `node_modules/.cache/temp_rec_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
  );
  fs.mkdirSync(path.dirname(tmpWav), { recursive: true });
  try {
    execFileSync(
      "afconvert",
      ["-f", "WAVE", "-d", "LEF32@44100", "-c", "1", mp3Path, tmpWav],
      { stdio: "ignore" },
    );
  } catch {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", mp3Path, "-ar", "44100", "-ac", "1", "-f", "f32le", tmpWav],
      { stdio: "ignore" },
    );
  }
  const buf = fs.readFileSync(tmpWav);
  try {
    fs.unlinkSync(tmpWav);
  } catch (err) {
    void err;
  }

  const headerOffset = buf.toString("ascii", 0, 4) === "RIFF" ? 44 : 0;
  const dataBuf = buf.subarray(headerOffset);
  const floatData = new Float32Array(
    dataBuf.buffer,
    dataBuf.byteOffset,
    Math.floor(dataBuf.byteLength / 4),
  );
  const sampleRate = 44100;
  const duration = floatData.length / sampleRate;

  return {
    length: floatData.length,
    duration,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => floatData,
  } as unknown as AudioBuffer;
}

export function getGitCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export function parseCliNote(): string {
  const args = process.argv.slice(2);
  const noteIdx = args.indexOf("--note");
  if (noteIdx !== -1 && args[noteIdx + 1]) {
    return args[noteIdx + 1]!;
  }
  return "Benchmark Snapshot Run";
}

export function logExplainableDspTrace({
  baseName,
  analysis,
  barPoints,
  points,
  alignedBeatMs,
}: {
  baseName: string;
  analysis: {
    viterbiTrace?: readonly {
      beatIdx: number;
      selectedMs: number;
      candidates: readonly {
        status: string;
        tMs: number;
        rawScore: number;
        totalScore: number;
        rejectReason?: string;
      }[];
    }[];
  };
  barPoints: Array<{
    trackName: string;
    bar: number;
    errorMs: number;
    tier: DawTier;
  }>;
  points: Array<{ bar: number; timecodeMs: number }>;
  alignedBeatMs: number[];
}): void {
  console.log(
    `\n================================================================================`,
  );
  console.log(`🔍 EXPLAINABLE DSP DECISION TRACE: ${baseName}`);
  console.log(
    `================================================================================`,
  );

  console.log(`\n--- [INTRO PHASING TRACE: Beats 0..16] ---`);
  for (let beatIdx = 0; beatIdx <= 16; beatIdx += 4) {
    const traceLayer = analysis.viterbiTrace?.find(
      (vt) => vt.beatIdx === beatIdx,
    );
    if (traceLayer) {
      console.log(
        `\n[BeatIdx ${beatIdx} (Bar ${beatIdx / 4 + 1})] Selected DSP: ${traceLayer.selectedMs.toFixed(1)} ms`,
      );
      traceLayer.candidates.slice(0, 5).forEach((cand, cIdx) => {
        const statusTag =
          cand.status === "WINNER" ? "🟢 [WINNER]" : "🔴 [REJECTED]";
        const reasonMsg = cand.rejectReason ? ` -> ${cand.rejectReason}` : "";
        console.log(
          `   ${statusTag} #${cIdx + 1} @ ${cand.tMs.toFixed(1)} ms | RawScore: ${cand.rawScore.toFixed(2)}, TotalScore: ${cand.totalScore.toFixed(2)}${reasonMsg}`,
        );
      });
    }
  }

  console.log(`\n--- [FAILING BARS TRACE (DAW FAIL > 60 ms)] ---`);
  const failingBars = barPoints.filter((bp) => bp.tier === "fail").slice(0, 5);
  if (failingBars.length === 0) {
    console.log(`✅ Brak taktów przekraczających 60 ms w tym utworze!`);
  } else {
    for (const bp of failingBars) {
      const targetIdx = (bp.bar - 1) * 4;
      const refPt = points.find((p) => p.bar === bp.bar);
      const refMs = refPt?.timecodeMs ?? 0;
      const estMs = alignedBeatMs[targetIdx] ?? 0;
      console.log(
        `\n[Bar ${bp.bar}] Ref RTF: ${refMs.toFixed(1)} ms | Selected DSP: ${estMs.toFixed(1)} ms | Error: ${bp.errorMs.toFixed(1)} ms (DAW FAIL)`,
      );
      const traceLayer = analysis.viterbiTrace?.find(
        (vt) => vt.beatIdx === targetIdx,
      );
      if (traceLayer && traceLayer.candidates.length > 0) {
        console.log(
          `   Oceniani kandydaci Viterbiego (layer beatIdx ${targetIdx}):`,
        );
        traceLayer.candidates.slice(0, 5).forEach((cand, cIdx) => {
          const statusTag =
            cand.status === "WINNER" ? "🟢 [WINNER]" : "🔴 [REJECTED]";
          const reasonMsg = cand.rejectReason ? ` -> ${cand.rejectReason}` : "";
          console.log(
            `      ${statusTag} #${cIdx + 1} @ ${cand.tMs.toFixed(1)} ms | RawScore: ${cand.rawScore.toFixed(2)}, TotalScore: ${cand.totalScore.toFixed(2)}${reasonMsg}`,
          );
        });
      } else {
        console.log(
          `   (Brak rejestracji kandydatów dla beatIdx ${targetIdx})`,
        );
      }
    }
  }
  console.log(
    `================================================================================\n`,
  );
}
