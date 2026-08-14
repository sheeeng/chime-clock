export type ChimeStyle =
  | 'bell'
  | 'classic'
  | 'cuckoo'
  | 'modern'
  | 'westminster';

export type ChimePlayback = {
  stop: () => void;
};

export type ChimeTiming = 'half-hour' | 'hour' | 'quarter';

type Partial = {
  frequency: number;
  level: number;
};

type BellPartial = Partial & {
  decay: number;
};

const classicBellPartials: BellPartial[] = [
  { frequency: 1181, level: 1, decay: 3.94 },
  { frequency: 772, level: 0.89, decay: 3.6 },
  { frequency: 1410, level: 0.55, decay: 2.4 },
  { frequency: 968, level: 0.43, decay: 3 },
  { frequency: 2490, level: 0.32, decay: 1.25 },
  { frequency: 1655, level: 0.22, decay: 1.8 },
];

const cuckooCallTimes = [
  0, 0.99, 1.89, 2.76, 3.66, 4.52, 5.42, 6.29, 7.19, 8.04, 8.94, 9.79,
];

const cuckooHighPartials: Partial[] = [
  { frequency: 611, level: 1 },
  { frequency: 2451, level: 0.027 },
];

const cuckooLowPartials: Partial[] = [
  { frequency: 495, level: 1 },
  { frequency: 993, level: 0.02 },
  { frequency: 1491, level: 0.029 },
  { frequency: 2663, level: 0.024 },
];

function playModernChime(
  context: AudioContext,
  destination: AudioNode,
  sources: AudioScheduledSourceNode[],
  count: number,
) {
  const playNote = (frequency: number, delay: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0, context.currentTime + delay);
    gain.gain.linearRampToValueAtTime(
      0.15,
      context.currentTime + delay + 0.05,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + delay + 2,
    );

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + 2);
    sources.push(oscillator);
  };

  for (let strike = 0; strike < count; strike += 1) {
    const delay = strike * 2.4;
    playNote(523.25, delay);
    playNote(659.25, delay + 0.4);
  }
}

function playCuckooChime(
  context: AudioContext,
  destination: AudioNode,
  sources: AudioScheduledSourceNode[],
  count: number,
) {
  const output = context.createGain();
  const filter = context.createBiquadFilter();

  output.gain.value = 0.7;
  filter.type = 'lowpass';
  filter.frequency.value = 5000;
  filter.Q.value = 0.4;
  output.connect(filter);
  filter.connect(destination);

  const playNote = (
    partials: Partial[],
    delay: number,
    level: number,
  ) => {
    const noteTime = context.currentTime + delay;
    const duration = 0.19;

    partials.forEach(({ frequency, level: partialLevel }, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const stopTime = noteTime + duration;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * 1.012, noteTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency,
        noteTime + 0.045,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.997,
        stopTime,
      );

      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.exponentialRampToValueAtTime(
        level * partialLevel,
        noteTime + 0.028,
      );
      gain.gain.setValueAtTime(
        level * partialLevel * (index === 0 ? 0.82 : 0.65),
        noteTime + 0.13,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(noteTime);
      oscillator.stop(stopTime);
      sources.push(oscillator);
    });
  };

  cuckooCallTimes.slice(0, count).forEach((delay) => {
    playNote(cuckooHighPartials, delay, 0.13);
    playNote(cuckooLowPartials, delay + 0.31, 0.17);
  });
}

let classicBuffersPromise: Promise<AudioBuffer[]> | null = null;

function playClassicRecording(
  context: AudioContext,
  destination: AudioNode,
  sources: AudioScheduledSourceNode[],
  count: number,
  isCancelled: () => boolean,
) {
  const output = context.createGain();

  output.gain.value = 1.2;
  output.connect(destination);

  classicBuffersPromise ??= Promise.all(
    ['s1', 's2', 's3', 's4'].map((segment) =>
      fetch(`/audio/classic/${segment}.wav`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Classic audio request failed: ${response.status}.`,
            );
          }
          return response.arrayBuffer();
        })
        .then((audioData) => context.decodeAudioData(audioData)),
    ),
  );

  void classicBuffersPromise
    .then((buffers) => {
      if (isCancelled()) return;

      // The APK uses s1 and s4 at half hours. At full hours, it uses
      // s1, s2, one s3 for each hour after the second, and then s4.
      const sequence =
        count === 1
          ? [0, 3]
          : [0, 1, ...Array(count - 2).fill(2), 3];
      let startTime = context.currentTime + 0.01;

      sequence.forEach((segmentIndex) => {
        const source = context.createBufferSource();
        const buffer = buffers[segmentIndex];

        source.buffer = buffer;
        source.connect(output);
        source.start(startTime);
        sources.push(source);
        startTime += buffer.duration;
      });
    })
    .catch((error: unknown) => {
      classicBuffersPromise = null;
      console.error('Classic audio playback failed.', error);
    });
}

function playSynthesizedClassicChime(
  context: AudioContext,
  destination: AudioNode,
  sources: AudioScheduledSourceNode[],
) {
  const output = context.createGain();
  const compressor = context.createDynamicsCompressor();

  output.gain.value = 1.15;
  compressor.threshold.value = -10;
  compressor.knee.value = 10;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  output.connect(compressor);
  compressor.connect(destination);

  classicBellPartials.forEach(({ frequency, level, decay }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteTime = context.currentTime;
    const stopTime = noteTime + decay;
    const peakLevel = level * 0.18;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteTime);

    gain.gain.setValueAtTime(0.0001, noteTime);
    gain.gain.exponentialRampToValueAtTime(peakLevel, noteTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(
      peakLevel * 0.23,
      noteTime + 0.2,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(noteTime);
    oscillator.stop(stopTime);
    sources.push(oscillator);
  });
}

let bellBufferPromise: Promise<AudioBuffer> | null = null;

function playBellRecording(
  context: AudioContext,
  destination: AudioNode,
  sources: AudioScheduledSourceNode[],
  count: number,
  isCancelled: () => boolean,
) {
  const output = context.createGain();

  output.gain.value = 1.2;
  output.connect(destination);

  bellBufferPromise ??= fetch('/audio/bell/bell.wav')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Bell audio request failed: ${response.status}.`);
      }
      return response.arrayBuffer();
    })
    .then((audioData) => context.decodeAudioData(audioData));

  void bellBufferPromise
    .then((buffer) => {
      if (isCancelled()) return;

      const firstStartTime = context.currentTime + 0.01;
      for (let strike = 0; strike < count; strike += 1) {
        const source = context.createBufferSource();

        source.buffer = buffer;
        source.connect(output);
        source.start(firstStartTime + strike * buffer.duration);
        sources.push(source);
      }
    })
    .catch((error: unknown) => {
      bellBufferPromise = null;
      console.error('Bell audio playback failed.', error);
    });
}

let westminsterBufferPromise: Promise<AudioBuffer> | null = null;

function playWestminsterRecording(context: AudioContext): ChimePlayback {
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;

  westminsterBufferPromise ??= fetch('/audio/westminster.mp3')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Westminster audio request failed: ${response.status}.`);
      }
      return response.arrayBuffer();
    })
    .then((audioData) => context.decodeAudioData(audioData));

  void westminsterBufferPromise
    .then((buffer) => {
      if (stopped) return;

      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    })
    .catch((error: unknown) => {
      westminsterBufferPromise = null;
      console.error('Westminster audio playback failed.', error);
    });

  return {
    stop: () => {
      stopped = true;
      source?.stop();
      source = null;
    },
  };
}

export function playChime(
  context: AudioContext | null,
  style: ChimeStyle,
  count = 1,
  timing: ChimeTiming = 'quarter',
): ChimePlayback | null {
  if (!context) return null;

  if (context.state === 'suspended') {
    context.resume();
  }

  if (style === 'westminster') {
    return playWestminsterRecording(context);
  }

  const output = context.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  const strikeCount = Math.min(12, Math.max(1, Math.floor(count)));
  let stopped = false;

  output.connect(context.destination);

  if (style === 'bell') {
    playBellRecording(
      context,
      output,
      sources,
      strikeCount,
      () => stopped,
    );
  } else if (style === 'modern') {
    playModernChime(context, output, sources, strikeCount);
  } else if (style === 'cuckoo') {
    playCuckooChime(context, output, sources, strikeCount);
  } else if (timing === 'quarter') {
    playSynthesizedClassicChime(context, output, sources);
  } else {
    playClassicRecording(
      context,
      output,
      sources,
      strikeCount,
      () => stopped,
    );
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;

      const stopTime = context.currentTime + 0.03;
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(output.gain.value, context.currentTime);
      output.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      sources.forEach((source) => {
        try {
          source.stop(stopTime);
        } catch {
          // The source has already stopped.
        }
      });
    },
  };
}
