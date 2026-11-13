// Safety limiter for the mix bus: a look-ahead peak limiter that leaves the
// signal strictly untouched (a plain delay, gain exactly 1) while the peaks
// stay under the ceiling, and turns the gain down smoothly, before the peak
// arrives, when they would not. Output never exceeds the ceiling, so there is
// never hard clipping.
//
// Method: per sample, the gain a sample needs (ceiling / peak, or 1); the
// minimum of that over the last W samples; a quick-attack, slow-release
// follower (the release makes it recover over about 80 ms); then a moving
// average over W samples. The average of values that are each at most the
// need of the sample W-1 steps back guarantees gain <= need for that sample,
// which is the one coming out of the (W-1)-sample delay.

export const LIMITER_CEILING = 0.8913; // -1 dBFS
/** Look-ahead window in frames; the limiter delays the audio by `LIMITER_DELAY` frames. */
const W = 96;
export const LIMITER_DELAY = W - 1;

export class Limiter {
  private readonly dl = new Float32Array(W);
  private readonly dr = new Float32Array(W);
  private readonly need = new Float32Array(W).fill(1);
  private readonly env = new Float32Array(W).fill(1);
  private pos = 0;
  private follower = 1;
  private sum = W;
  /** Samples since the last one that needed (or still shows) any gain reduction. */
  private quiet = 1 << 30;
  private readonly release: number;
  /** Smallest gain applied since the last `takeMinGain()` (for the tests and diagnostics). */
  private minGain = 1;

  constructor(sampleRate: number) {
    this.release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  }

  reset(): void {
    this.dl.fill(0);
    this.dr.fill(0);
    this.need.fill(1);
    this.env.fill(1);
    this.follower = 1;
    this.sum = W;
    this.quiet = 1 << 30;
  }

  /** Limits `l` and `r` in place (n frames). */
  process(l: Float32Array, r: Float32Array, n: number): void {
    const { dl, dr, need, env } = this;
    let { pos, follower, sum, quiet } = this;
    for (let i = 0; i < n; i++) {
      const inL = l[i]!;
      const inR = r[i]!;
      dl[pos] = inL;
      dr[pos] = inR;
      const peak = Math.max(Math.abs(inL), Math.abs(inR));
      const nd = peak > LIMITER_CEILING ? LIMITER_CEILING / peak : 1;
      const next = pos + 1 === W ? 0 : pos + 1; // oldest sample of the delay line
      if (quiet >= 2 * W && nd === 1) {
        // Nothing to do: the delay line is all that is left (rings stay full of ones).
        l[i] = dl[next]!;
        r[i] = dr[next]!;
        pos = next;
        quiet++;
        continue;
      }
      if (quiet >= 2 * W) sum = W;
      need[pos] = nd;
      let m = 1;
      for (let k = 0; k < W; k++) {
        const v = need[k]!;
        if (v < m) m = v;
      }
      if (m < follower) follower = m;
      else {
        follower += (m - follower) * this.release;
        if (follower > 0.999999) follower = 1;
      }
      sum += follower - env[pos]!;
      env[pos] = follower;
      const g = sum / W;
      if (nd < 1 || follower < 1) quiet = 0;
      else quiet++;
      if (g < this.minGain) this.minGain = g;
      l[i] = dl[next]! * g;
      r[i] = dr[next]! * g;
      pos = next;
    }
    this.pos = pos;
    this.follower = follower;
    this.sum = sum;
    this.quiet = quiet;
  }

  takeMinGain(): number {
    const g = this.minGain;
    this.minGain = 1;
    return g;
  }
}
