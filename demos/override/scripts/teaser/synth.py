"""Local fallback audio for the teaser: an 8-bit music bed and SFX, synthesized with numpy.

Writes cache/{music,pop,glitch,final,whoosh}.wav (48 kHz mono). The bed runs at 120 bpm so the
storyboard beats (2.5 / 4.0 / 5.5 s testimony cuts, 7.0 s end card) fall on the beat.
"""
import pathlib, wave
import numpy as np

SR = 48000
CACHE = pathlib.Path(__file__).parent / 'cache'
rng = np.random.default_rng(7)


def hz(note):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def t_of(seconds):
    return np.arange(int(seconds * SR)) / SR


def envelope(n, attack=0.004, decay=0.08, sustain=0.6, release=0.03):
    t = np.arange(n) / SR
    env = np.minimum(1, t / attack) * (sustain + (1 - sustain) * np.exp(-t / decay))
    tail = int(release * SR)
    if tail and n > tail:
        env[-tail:] *= np.linspace(1, 0, tail)
    return env


def pulse(freq, seconds, duty=0.25):
    phase = (t_of(seconds) * freq) % 1
    return np.where(phase < duty, 1.0, -1.0)


def triangle(freq, seconds):
    phase = (t_of(seconds) * freq) % 1
    return 4 * np.abs(phase - 0.5) - 1


def noise(seconds):
    return rng.uniform(-1, 1, int(seconds * SR))


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def echo(x, delay=0.11, feedback=0.35, taps=4):
    out = np.concatenate([x, np.zeros(int(delay * taps * SR))])
    step = int(delay * SR)
    for k in range(1, taps + 1):
        out[k * step:k * step + len(x)] += x * feedback ** k
    return out


def place(track, clip, at):
    start = int(at * SR)
    end = min(len(track), start + len(clip))
    track[start:end] += clip[:end - start]


def bell_tone(freq, seconds, decay=0.9):
    t = t_of(seconds)
    partials = [(0.5, 0.35, 1.4), (1.0, 1.0, 1.0), (1.19, 0.45, 0.7), (1.5, 0.3, 0.6), (2.0, 0.5, 0.5), (2.74, 0.25, 0.35), (5.4, 0.12, 0.15)]
    x = sum(amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (decay * life)) for ratio, amp, life in partials)
    x[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return x / np.max(np.abs(x))


def music():
    beat, eighth = 0.5, 0.25
    track = np.zeros(int(10.2 * SR))

    def lead(note, at, length, duty=0.25, vol=0.16):
        n = int(length * SR)
        place(track, pulse(hz(note), length, duty) * envelope(n, decay=0.09, sustain=0.45) * vol, at)

    def bass(note, at, length=0.2, vol=0.3):
        n = int(length * SR)
        place(track, triangle(hz(note), length) * envelope(n, decay=0.12, sustain=0.5, release=0.02) * vol, at)

    def hat(at, vol=0.05):
        n = int(0.035 * SR)
        place(track, np.diff(noise(0.035), prepend=0) * np.exp(-np.arange(n) / SR / 0.01) * vol, at)

    def snare(at, vol=0.1):
        n = int(0.12 * SR)
        place(track, noise(0.12) * np.exp(-np.arange(n) / SR / 0.035) * vol, at)

    # The detective tune (A minor) from frame 0 to the end: two 4 s passes, then the first phrase again,
    # landing on A at 9.5 s. Bass on eighths, hats on the off-beats, a soft backbeat from the second pass.
    phrase_one = [('A4', 1), ('C5', 1), ('E5', 1), ('D5', .5), ('C5', .5), ('B4', 1), ('G#4', 1), ('A4', 2)]
    phrase_two = [('C5', 1), ('E5', 1), ('A5', 1), ('G5', .5), ('F5', .5), ('E5', 1), ('D#5', 1), ('E5', 2)]
    at = 0.0
    for note, eighths in (phrase_one + phrase_two) * 2 + phrase_one:
        length = eighths * eighth
        lead(note, at, length * 0.9 if at < 9.5 else 0.5)
        at += length
    walk = ['A2', 'E3', 'A2', 'E3', 'G#2', 'E3', 'A2', 'E3', 'F2', 'C3', 'F2', 'C3', 'E2', 'B2', 'E2', 'B2']
    for i in range(38):
        bass(walk[i % 16], i * eighth)
        hat(i * eighth + eighth / 2)
    for i in range(6):
        snare(4.5 + i * beat * 2, vol=0.05)

    # 7.0 s: a cymbal accent on the cut to the end card (the tune keeps going).
    n = int(1.2 * SR)
    place(track, lowpass(noise(1.2), 7000) * np.exp(-np.arange(n) / SR / 0.35) * 0.09, 7.0)

    # 9.5 s: the tune resolves on A with a bright chord and a sparkle.
    n = int(0.6 * SR)
    for note in ['A4', 'C#5', 'E5']:
        place(track, pulse(hz(note), 0.6, 0.5) * np.exp(-np.arange(n) / SR / 0.5) * 0.07, 9.5)
    place(track, triangle(hz('A2'), 0.6) * np.exp(-np.arange(n) / SR / 0.6) * 0.34, 9.5)
    for i, note in enumerate(['A5', 'C#6', 'E6']):
        lead(note, 9.5 + i * 0.06, 0.2, duty=0.125, vol=0.06)

    return lowpass(track, 9000)[:int(10 * SR)]


def pop():
    t = t_of(0.09)
    freq = 380 + 1300 * (t / t[-1]) ** 0.6
    x = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.03)
    return x * 0.9


def glitch():
    parts = []
    for _ in range(9):
        length = rng.choice([0.03, 0.045, 0.06])
        f = rng.choice([110, 220, 330, 880, 1760])
        seg = pulse(f, length, rng.choice([0.125, 0.5])) * 0.5 + noise(length) * 0.25
        seg = np.round(seg * 4) / 4  # bit-crush
        parts.append(seg * (1 if rng.random() > 0.3 else 0))
    t = t_of(0.28)
    freq = 900 * np.exp(-t * 7) + 120
    scratch = (np.sin(2 * np.pi * np.cumsum(freq) / SR) * 0.6 + lowpass(noise(0.28), 3000) * 0.5) * np.exp(-t / 0.12)
    return np.concatenate(parts + [scratch]) * 0.8


def final():
    x = bell_tone(hz('A5'), 2.4, decay=0.9) + 0.6 * bell_tone(hz('E6'), 2.4, decay=0.7)
    return echo(x / np.max(np.abs(x)) * 0.6)


def whoosh():
    t = t_of(0.5)
    x = np.diff(lowpass(noise(0.5), 2500), prepend=0) * 6
    return x * (t / t[-1]) ** 2 * 0.5


def write(name, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(CACHE / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    print(f'wrote cache/{name}.wav ({len(x) / SR:.2f} s)')


if __name__ == '__main__':
    CACHE.mkdir(exist_ok=True)
    for name, make in [('music', music), ('pop', pop), ('glitch', glitch), ('final', final), ('whoosh', whoosh)]:
        if not (CACHE / f'{name}.mp3').exists():
            write(name, make())
