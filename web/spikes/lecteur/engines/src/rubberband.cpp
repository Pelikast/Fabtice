// Fabtice spike: Rubber Band Library 4.0 (GPL-2.0-or-later) behind the common "fe_*" C API
// used by the player worklet. variant 0: R3 "finer" engine, variant 1: R2 "faster" engine.
#include <rubberband/RubberBandStretcher.h>
#include <vector>
#include <cmath>
#include <cstring>
#include <algorithm>

#define EXPORT(name) __attribute__((export_name(name)))

using RubberBand::RubberBandStretcher;
static const int CAP = 16384;      // frames per channel in the in/out scratch buffers
static const int FIFO = 1 << 16;   // output FIFO frames per channel (power of two)
static const int PREFILL = 1024;   // frames

struct Inst {
	RubberBandStretcher *rb = nullptr;
	std::vector<float> inb, outb;
	std::vector<std::vector<float>> fifo;
	size_t rd = 0, wr = 0; // absolute counters
	int ch, sr, variant;
	double ratio = 1, pitch = 1, lastRate = 1, lastSemis = 0;
	int formant = 0;
	long skip = 0; // output frames still to drop after reset (start delay)
	bool primed = false; // output is only consumed once the FIFO holds PREFILL frames (elastic buffer against bursts)
	std::vector<float *> inp, retr;
	std::vector<float> retrBuf;
};

static void make(Inst *s) {
	delete s->rb;
	int opt = RubberBandStretcher::OptionProcessRealTime | RubberBandStretcher::OptionThreadingNever
		| RubberBandStretcher::OptionPitchHighConsistency;
	if (s->variant == 0) opt |= RubberBandStretcher::OptionEngineFiner;
	else opt |= RubberBandStretcher::OptionEngineFaster | RubberBandStretcher::OptionTransientsCrisp
		| RubberBandStretcher::OptionWindowStandard;
	opt |= s->formant ? RubberBandStretcher::OptionFormantPreserved : RubberBandStretcher::OptionFormantShifted;
	s->rb = new RubberBandStretcher(s->sr, s->ch, opt, s->ratio, s->pitch);
	s->rb->setMaxProcessSize(1024);
	s->rd = s->wr = 0;
}

static void drain(Inst *s) {
	int av;
	while ((av = s->rb->available()) > 0) {
		int n = std::min(av, 1024);
		for (int c = 0; c < s->ch; ++c) s->retr[c] = s->retrBuf.data() + c * 1024;
		n = (int)s->rb->retrieve(s->retr.data(), n);
		if (n <= 0) break;
		int from = 0;
		if (s->skip > 0) { int d = (int)std::min<long>(s->skip, n); s->skip -= d; from = d; }
		for (int i = from; i < n; ++i) {
			for (int c = 0; c < s->ch; ++c) s->fifo[c][(s->wr) & (FIFO - 1)] = s->retrBuf[c * 1024 + i];
			++s->wr;
		}
	}
}

static void feed(Inst *s, const float *const *in, int n) {
	// process() accepts at most the max process size per call
	for (int off = 0; off < n; off += 1024) {
		int m = std::min(1024, n - off);
		const float *ptrs[8];
		for (int c = 0; c < s->ch; ++c) ptrs[c] = in[c] + off;
		s->rb->process(ptrs, m, false);
		drain(s);
	}
}

extern "C" {
EXPORT("fe_create") void *fe_create(int sr, int ch, int variant) {
	Inst *s = new Inst();
	s->ch = ch; s->sr = sr; s->variant = variant;
	s->inb.assign(CAP * ch, 0.f);
	s->outb.assign(CAP * ch, 0.f);
	s->fifo.assign(ch, std::vector<float>(FIFO, 0.f));
	s->retrBuf.assign(1024 * ch, 0.f);
	s->retr.assign(ch, nullptr);
	for (int c = 0; c < ch; ++c) s->inp.push_back(s->inb.data() + c * CAP);
	make(s);
	return s;
}
EXPORT("fe_destroy") void fe_destroy(void *p) { Inst *s = (Inst *)p; delete s->rb; delete s; }
EXPORT("fe_cap") int fe_cap() { return CAP; }
EXPORT("fe_in") float *fe_in(void *p) { return ((Inst *)p)->inb.data(); }
EXPORT("fe_out") float *fe_out(void *p) { return ((Inst *)p)->outb.data(); }

EXPORT("fe_reset") void fe_reset(void *p) {
	Inst *s = (Inst *)p;
	s->rb->reset();
	s->rd = s->wr = 0;
	s->primed = false;
	// Real-time alignment recipe from the Rubber Band docs: feed the preferred start pad
	// of silence and drop the start delay from the output.
	s->skip = (long)s->rb->getStartDelay();
	size_t pad = s->rb->getPreferredStartPad();
	std::vector<float> z(1024, 0.f);
	const float *zp[8];
	for (int c = 0; c < s->ch; ++c) zp[c] = z.data();
	for (size_t off = 0; off < pad; off += 1024) feed(s, zp, (int)std::min<size_t>(1024, pad - off));
}

EXPORT("fe_set") void fe_set(void *p, double semitones, double rate, int formant) {
	Inst *s = (Inst *)p;
	if ((formant != 0) != (s->formant != 0)) { // formant mode is only settable cleanly at construction here
		s->formant = formant;
		s->rb->setFormantOption(formant ? RubberBandStretcher::OptionFormantPreserved : RubberBandStretcher::OptionFormantShifted);
	}
	double pitch = std::pow(2.0, semitones / 12.0);
	double ratio = 1.0 / rate; // output length / input length
	if (std::fabs(pitch - s->pitch) > 1e-9) { s->pitch = pitch; s->rb->setPitchScale(pitch); }
	if (std::fabs(ratio - s->ratio) > 1e-6) { s->ratio = ratio; s->rb->setTimeRatio(ratio); }
}

// Feeds nIn input frames, then returns up to nOut frames (fewer if the engine has not produced them yet).
EXPORT("fe_process") int fe_process(void *p, int nIn, int nOut) {
	Inst *s = (Inst *)p;
	feed(s, s->inp.data(), nIn);
	int avail = (int)(s->wr - s->rd);
	if (!s->primed) { if (avail >= PREFILL) s->primed = true; else return 0; }
	int n = std::min(avail, nOut);
	for (int c = 0; c < s->ch; ++c)
		for (int i = 0; i < n; ++i) s->outb[c * CAP + i] = s->fifo[c][(s->rd + i) & (FIFO - 1)];
	s->rd += n;
	return n;
}
EXPORT("fe_fifo") int fe_fifo(void *p) { Inst *s = (Inst *)p; return (int)(s->wr - s->rd); }
EXPORT("fe_seek") void fe_seek(void *, int, double) {}
EXPORT("fe_seek_len") int fe_seek_len(void *p) { return 8192; }
EXPORT("fe_exact") int fe_exact() { return 0; }
}
