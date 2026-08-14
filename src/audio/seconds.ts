export type SecondsSoundStyle =
  | 'cinematic'
  | 'mechanical'
  | 'off'
  | 'textured';

type EnabledSecondsSoundStyle = Exclude<SecondsSoundStyle, 'off'>;

function getFrequencies(style: EnabledSecondsSoundStyle, step: number) {
  if (style === 'cinematic') {
    return step === 0
      ? [3149, 2852, 1847, 1177]
      : [3110, 2919, 1646, 1149];
  }

  return step === 0 ? [3392, 2230, 1560] : [1443, 2370, 2080];
}

function playNoiseTexture(
  context: AudioContext,
  startTime: number,
  step: number,
) {
  const duration = 0.025;
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  for (let index = 0; index < samples.length; index += 1) {
    const envelope = 1 - index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }

  source.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = step === 0 ? 1800 : 1400;
  gain.gain.setValueAtTime(0.025, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

export function playSecondsSound(
  context: AudioContext | null,
  style: SecondsSoundStyle,
  step: number,
) {
  if (!context || style === 'off') return;

  const startTime = context.currentTime;
  const cinematic = style === 'cinematic';
  const duration = cinematic ? 0.11 : 0.065;
  const frequencies = getFrequencies(style, step);

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const level = (cinematic ? 0.045 : 0.035) / (index + 1);

    oscillator.type = index === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.96,
      startTime + duration,
    );

    gain.gain.setValueAtTime(level, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });

  const clickOscillator = context.createOscillator();
  const clickGain = context.createGain();

  clickOscillator.type = 'square';
  clickOscillator.frequency.setValueAtTime(
    cinematic ? (step === 0 ? 4180 : 3940) : step === 0 ? 6200 : 5100,
    startTime,
  );
  clickGain.gain.setValueAtTime(cinematic ? 0.009 : 0.012, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.012);

  clickOscillator.connect(clickGain);
  clickGain.connect(context.destination);
  clickOscillator.start(startTime);
  clickOscillator.stop(startTime + 0.012);

  if (style === 'textured') {
    playNoiseTexture(context, startTime, step);
  }
}
