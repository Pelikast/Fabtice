// Fabtice spike: Signalsmith Stretch (MIT) behind the common "fe_*" C API
// used by the player worklet. See build.sh for compiler flags.
#include "signalsmith-stretch.h"
#include <vector>
#include <cmath>
#include <cstdlib>

#define EXPORT(name) __attribute__((export_name(name)))

using Stretch = signalsmith::stretch::SignalsmithStretch<float>;
static const int CAP = 16384; // frames per channel in the in/out scratch buffers

struct Inst {
	Stretch st;
	std::vector<float> inb, outb;
	std::vector<float *> inp, outp;
	int ch, sr;
	bool cheap;
};

extern "C" {
// variant 0: default preset, 1: cheaper preset
EXPORT("fe_create") void *fe_create(int sr, int ch, int variant) {
	Inst *s = new Inst();
	s->ch = ch; s->sr = sr; s->cheap = variant == 1;
	s->inb.assign(CAP * ch, 0.f);
	s->outb.assign(CAP * ch, 0.f);
	for (int c = 0; c < ch; ++c) {
		s->inp.push_back(s->inb.data() + c * CAP);
		s->outp.push_back(s->outb.data() + c * CAP);
	}
	// split computation: spreads the FFT work over the interval (no CPU spike every 30 ms)
	if (s->cheap) s->st.presetCheaper(ch, (float)sr, true);
	else s->st.presetDefault(ch, (float)sr, true);
	return s;
}
EXPORT("fe_destroy") void fe_destroy(void *p) { delete (Inst *)p; }
EXPORT("fe_cap") int fe_cap() { return CAP; }
EXPORT("fe_in") float *fe_in(void *p) { return ((Inst *)p)->inb.data(); }
EXPORT("fe_out") float *fe_out(void *p) { return ((Inst *)p)->outb.data(); }
EXPORT("fe_reset") void fe_reset(void *p) { ((Inst *)p)->st.reset(); }
// semitones includes cents; formant != 0 keeps the spectral envelope when transposing
EXPORT("fe_set") void fe_set(void *p, double semitones, double rate, int formant) {
	Inst *s = (Inst *)p;
	s->st.setTransposeSemitones((float)semitones, 8000.f / s->sr);
	if (formant) { s->st.setFormantSemitones(0, true); s->st.setFormantBase(0); }
	else { s->st.setFormantSemitones(0, false); }
	(void)rate;
}
// Produces exactly nOut frames from nIn frames of input (an "exact" engine).
EXPORT("fe_process") int fe_process(void *p, int nIn, int nOut) {
	Inst *s = (Inst *)p;
	s->st.process(s->inp, nIn, s->outp, nOut);
	return nOut;
}
// Pre-roll: nIn frames of audio that precede the new playback position.
EXPORT("fe_seek") void fe_seek(void *p, int nIn, double rate) {
	Inst *s = (Inst *)p;
	s->st.seek(s->inp, nIn, rate);
}
EXPORT("fe_seek_len") int fe_seek_len(void *p) { return ((Inst *)p)->st.seekLength(); }
EXPORT("fe_exact") int fe_exact() { return 1; }
}
