import { BeveledPanel } from '@/app/components/BeveledPanel';
import { PrimaryButton } from '@/app/components/PrimaryButton';
import { InstrumentModule } from '@/app/components/InstrumentModule';
import { CheckCircle2, TrendingUp, Users, Shield, BarChart3, Share2, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#e4e1dd]">
      {/* Navigation */}
      <nav className="px-6 py-6 lg:px-12 lg:py-8">
        <div className="max-w-7xl mx-auto">
          <div
            className="rounded-[20px] bg-[#e9e6e2] px-6 py-4"
            style={{
              boxShadow: '6px 6px 18px rgba(0, 0, 0, 0.05), -6px -6px 18px rgba(255, 255, 255, 0.8)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-[#1a1712]">
                Doxa
              </div>

              {/* Desktop Nav */}
              <div className="hidden lg:flex items-center gap-8">
                <a href="#about" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  About
                </a>
                <a href="#how-it-works" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  How it Works
                </a>
                <a href="#topics" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Topics
                </a>
                <a href="#pricing" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Pricing
                </a>
                <a href="#signin" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Sign In
                </a>
                <PrimaryButton variant="primary">Join Waitlist</PrimaryButton>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden text-[#1a1712]"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>

            {/* Mobile Nav */}
            {mobileMenuOpen && (
              <div className="lg:hidden mt-6 pt-6 border-t border-[#d4d1cd] space-y-4">
                <a href="#about" className="block text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  About
                </a>
                <a href="#how-it-works" className="block text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  How it Works
                </a>
                <a href="#topics" className="block text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Topics
                </a>
                <a href="#pricing" className="block text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Pricing
                </a>
                <a href="#signin" className="block text-[#4a4539] hover:text-[#1a1712] transition-colors">
                  Sign In
                </a>
                <PrimaryButton variant="primary" className="w-full">Join Waitlist</PrimaryButton>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-16 lg:px-12 lg:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight text-[#1a1712] leading-tight">
                  See how your beliefs compare across perspectives
                </h1>
                <p className="text-lg lg:text-xl text-[#4a4539] leading-relaxed">
                  Doxa compares narratives and claims across ideological clusters, revealing evidence-backed perspectives and identifying common ground on complex political topics.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <PrimaryButton variant="primary">Join Waitlist</PrimaryButton>
                <PrimaryButton variant="secondary">See Demo</PrimaryButton>
              </div>
            </div>

            {/* Hero Instrument Panel Grid */}
            <div className="grid grid-cols-2 gap-4">
              <InstrumentModule title="Evidence" value="75%" indicator />
              <InstrumentModule title="Consensus" value="40%" />
              <InstrumentModule title="Perspective" value="65%" indicator />
              <InstrumentModule title="Calibration" value="80%" />
              <InstrumentModule title="Bias Check" value="55%" />
              <InstrumentModule title="Timeline" value="90%" indicator />
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="px-6 py-12 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <BeveledPanel>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <p className="text-lg text-[#4a4539] font-medium">
                Built for people who want signal, not noise.
              </p>
              <div className="flex items-center gap-8">
                <div className="w-24 h-8 rounded-[8px] bg-[#d4d1cd] flex items-center justify-center text-xs text-[#6a6053]">
                  Logo 1
                </div>
                <div className="w-24 h-8 rounded-[8px] bg-[#d4d1cd] flex items-center justify-center text-xs text-[#6a6053]">
                  Logo 2
                </div>
                <div className="w-24 h-8 rounded-[8px] bg-[#d4d1cd] flex items-center justify-center text-xs text-[#6a6053]">
                  Logo 3
                </div>
              </div>
            </div>
          </BeveledPanel>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="px-6 py-16 lg:px-12 lg:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight text-[#1a1712]">
              How it Works
            </h2>
            <p className="text-lg text-[#4a4539] max-w-2xl mx-auto">
              Three steps to understand what people actually think
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <BeveledPanel hover>
              <div className="space-y-6">
                <div
                  className="w-16 h-16 rounded-full bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 4px 4px 10px rgba(0, 0, 0, 0.08), inset -4px -4px 10px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <span className="text-2xl font-semibold text-[#c9a55d]">1</span>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-[#1a1712]">
                    Pick a topic
                  </h3>
                  <p className="text-[#4a4539] leading-relaxed">
                    Browse our dynamically updated knowledge base covering hundreds of political topics, from healthcare to climate policy.
                  </p>
                </div>
              </div>
            </BeveledPanel>

            <BeveledPanel hover>
              <div className="space-y-6">
                <div
                  className="w-16 h-16 rounded-full bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 4px 4px 10px rgba(0, 0, 0, 0.08), inset -4px -4px 10px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <span className="text-2xl font-semibold text-[#c9a55d]">2</span>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-[#1a1712]">
                    Compare viewpoints
                  </h3>
                  <p className="text-[#4a4539] leading-relaxed">
                    See how different ideological clusters interpret the same evidence. Discover where perspectives align and diverge.
                  </p>
                </div>
              </div>
            </BeveledPanel>

            <BeveledPanel hover>
              <div className="space-y-6">
                <div
                  className="w-16 h-16 rounded-full bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 4px 4px 10px rgba(0, 0, 0, 0.08), inset -4px -4px 10px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <span className="text-2xl font-semibold text-[#c9a55d]">3</span>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-[#1a1712]">
                    Track calibration
                  </h3>
                  <p className="text-[#4a4539] leading-relaxed">
                    Monitor how your understanding evolves as new evidence emerges and community input shapes the narrative.
                  </p>
                </div>
              </div>
            </BeveledPanel>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-16 lg:px-12 lg:py-24 bg-[#ddd9d3]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight text-[#1a1712]">
              Features
            </h2>
            <p className="text-lg text-[#4a4539] max-w-2xl mx-auto">
              Everything you need to navigate complex political discourse
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <CheckCircle2 size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Evidence-linked claims
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  Every statement backed by verifiable sources and community-validated evidence.
                </p>
              </div>
            </BeveledPanel>

            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <Users size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Perspective clusters
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  See how different ideological groups interpret the same information.
                </p>
              </div>
            </BeveledPanel>

            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <Shield size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Bias checks
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  Automated and community-driven bias detection to keep discourse balanced.
                </p>
              </div>
            </BeveledPanel>

            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <BarChart3 size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Topic timelines
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  Track how understanding and consensus evolve as new information emerges.
                </p>
              </div>
            </BeveledPanel>

            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <TrendingUp size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Calibration score
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  Personal metrics showing how your views align with evidence over time.
                </p>
              </div>
            </BeveledPanel>

            <BeveledPanel hover className="bg-[#e9e6e2]">
              <div className="space-y-4">
                <div
                  className="w-12 h-12 rounded-[12px] bg-[#e4e1dd] flex items-center justify-center"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                >
                  <Share2 size={24} className="text-[#c9a55d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#1a1712]">
                  Shareable snapshots
                </h3>
                <p className="text-[#4a4539] leading-relaxed">
                  Export and share perspective comparisons to foster productive dialogue.
                </p>
              </div>
            </BeveledPanel>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-16 lg:px-12 lg:py-24">
        <div className="max-w-4xl mx-auto">
          <BeveledPanel className="text-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-[#1a1712]">
                  Ready to calibrate your worldview?
                </h2>
                <p className="text-lg text-[#4a4539]">
                  Join the waitlist and be among the first to experience Doxa.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-6 py-4 rounded-[16px] bg-[#e4e1dd] text-[#1a1712] placeholder:text-[#8a7f6f] outline-none focus:ring-2 focus:ring-[#c9a55d]"
                  style={{
                    boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
                  }}
                />
                <PrimaryButton variant="primary" className="whitespace-nowrap">
                  Join Waitlist
                </PrimaryButton>
              </div>
            </div>
          </BeveledPanel>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 lg:px-12 border-t border-[#d4d1cd]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-2xl font-semibold tracking-tight text-[#1a1712]">
              Doxa
            </div>

            <div className="flex flex-wrap justify-center gap-8">
              <a href="#about" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                About
              </a>
              <a href="#how-it-works" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                How it Works
              </a>
              <a href="#topics" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                Topics
              </a>
              <a href="#pricing" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                Pricing
              </a>
              <a href="#privacy" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                Privacy
              </a>
              <a href="#terms" className="text-[#4a4539] hover:text-[#1a1712] transition-colors">
                Terms
              </a>
            </div>

            <div className="text-sm text-[#6a6053]">
              © 2026 Doxa. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
