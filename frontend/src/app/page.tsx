'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Shield,
  Activity,
  Award,
  Brain,
  ArrowRight,
  Lock,
  FileText,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setIsLoggedIn(!!user);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans selection:bg-primary/30">
      {/* Navbar */}
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 border-b border-transparent ${
          isScrolled ? 'glass border-border/50 py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Image 
              src="/logo.png" 
              alt="SWIMS Logo" 
              width={40} 
              height={40} 
              className="rounded-lg shadow-sm group-hover:scale-105 transition-transform duration-300" 
            />
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              SWIMS
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Features</Link>
            <Link href="#security" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Security</Link>
            <Link href="#compliance" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Compliance</Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn ? (
              <Button onClick={() => router.push('/dashboard')} className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => router.push('/login')} className="hover:bg-primary/10 hover:text-primary">
                  Sign In
                </Button>
                <Button onClick={() => router.push('/login')} className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden glass absolute top-full left-0 w-full border-b border-border p-4 flex flex-col gap-4 animate-in slide-in-from-top-4">
            <Link href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-primary p-2">Features</Link>
            <Link href="#security" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground hover:text-primary p-2">Security</Link>
            <div className="pt-4 flex flex-col gap-2 border-t border-border">
              {isLoggedIn ? (
                <Button onClick={() => router.push('/dashboard')} className="w-full justify-center">Dashboard</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => router.push('/login')} className="w-full justify-center">Sign In</Button>
                  <Button onClick={() => router.push('/login')} className="w-full justify-center">Get Started</Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow pt-24 md:pt-32">
        {/* Hero Section */}
        <section className="relative px-4 md:px-6 py-12 md:py-20 lg:py-32 overflow-hidden">
          {/* Background Decorations */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-50 pointer-events-none" />
          
          <div className="container mx-auto relative z-10 flex flex-col items-center text-center max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
              SWIMS 2.0 is now live
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
              Empowering Schools to <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-chart-4">Nurture Every Student</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
              A comprehensive, secure SaaS platform designed for modern educational institutions to manage incidents, track wellbeing, and unlock AI-powered insights.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
              {isLoggedIn ? (
                <Button size="lg" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto gap-2 h-14 px-8 text-lg rounded-full shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-1 transition-all">
                  Access Dashboard <ArrowRight className="w-5 h-5" />
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={() => router.push('/login')} className="w-full sm:w-auto gap-2 h-14 px-8 text-lg rounded-full shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-1 transition-all">
                    Get Started Free <ArrowRight className="w-5 h-5" />
                  </Button>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 h-14 px-8 text-lg rounded-full hover:bg-muted transition-all">
                    Book a Demo
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 md:py-32 bg-secondary/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need in One Platform</h2>
              <p className="text-muted-foreground text-lg">Replace fragmented spreadsheets and legacy systems with a unified, intelligent command center for student wellbeing.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Granular Access Control",
                  desc: "Advanced RBAC & ABAC ensures staff only see the data they are authorized to access, protecting student privacy.",
                  icon: Shield,
                  color: "text-chart-1",
                  bg: "bg-chart-1/10"
                },
                {
                  title: "Incident Tracking",
                  desc: "Complete lifecycle management for medical and behavioral cases, from initial report to intervention and resolution.",
                  icon: Activity,
                  color: "text-chart-2",
                  bg: "bg-chart-2/10"
                },
                {
                  title: "Positive Observations",
                  desc: "Balance discipline with encouragement. Track achievements, milestones, and positive behaviors effortlessly.",
                  icon: Award,
                  color: "text-chart-3",
                  bg: "bg-chart-3/10"
                },
                {
                  title: "AI-Powered Insights",
                  desc: "Local, secure LLMs analyze patterns, evaluate intervention efficacy, and summarize complex student histories in seconds.",
                  icon: Brain,
                  color: "text-chart-4",
                  bg: "bg-chart-4/10"
                }
              ].map((feature, i) => (
                <Card key={i} className="glass border-border/50 p-6 flex flex-col items-start gap-4 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 group">
                  <div className={`p-3 rounded-2xl ${feature.bg} ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section id="security" className="py-20 md:py-32">
          <div className="container mx-auto px-4 md:px-6 flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 lg:pr-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium mb-6">
                <Lock className="w-4 h-4" /> Built for Compliance
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Bank-Grade Security for Student Data</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Educational data is highly sensitive. SWIMS is engineered from the ground up to exceed international compliance standards (FERPA, GDPR) ensuring your institution is always protected.
              </p>
              
              <ul className="space-y-4">
                {[
                  "Right to Be Forgotten (RTBF) automated scrubbing",
                  "Immutable audit trails for all sensitive actions",
                  "Secure, presigned URLs for media evidence",
                  "End-to-end data encryption at rest and in transit"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-foreground/80 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex-1 w-full max-w-xl">
              <div className="relative aspect-square md:aspect-[4/3] rounded-3xl overflow-hidden glass border border-border p-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-destructive/10" />
                <div className="relative z-10 grid grid-cols-2 gap-4 w-full">
                  <div className="glass rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center shadow-lg transform -rotate-3 hover:rotate-0 transition-all">
                    <Lock className="w-8 h-8 text-primary" />
                    <span className="font-semibold text-sm">Encrypted DB</span>
                  </div>
                  <div className="glass rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center shadow-lg transform translate-y-8 rotate-3 hover:rotate-0 transition-all">
                    <FileText className="w-8 h-8 text-chart-2" />
                    <span className="font-semibold text-sm">Audit Logs</span>
                  </div>
                  <div className="glass rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center shadow-lg transform -translate-y-4 -rotate-2 hover:rotate-0 transition-all">
                    <Shield className="w-8 h-8 text-chart-3" />
                    <span className="font-semibold text-sm">RBAC Rules</span>
                  </div>
                  <div className="glass rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center shadow-lg transform rotate-2 hover:rotate-0 transition-all">
                    <Brain className="w-8 h-8 text-chart-4" />
                    <span className="font-semibold text-sm">Local AI Models</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 md:px-6">
            <div className="glass rounded-3xl p-8 md:p-16 text-center relative overflow-hidden border border-primary/20">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-chart-4/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to Transform Your School's Wellbeing Strategy?</h2>
                <p className="text-lg text-muted-foreground mb-10">
                  Join leading institutions that trust SWIMS to protect, nurture, and empower their students.
                </p>
                <Button size="lg" onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')} className="gap-2 h-14 px-10 text-lg rounded-full shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-1 transition-all">
                  {isLoggedIn ? "Go to Dashboard" : "Start Your Free Trial"} <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-12 mt-auto">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <Image src="/logo.png" alt="SWIMS Logo" width={32} height={32} className="rounded-md" />
                <span className="text-lg font-bold tracking-tight">SWIMS</span>
              </Link>
              <p className="text-sm text-muted-foreground max-w-xs">
                The comprehensive platform for student wellbeing, medical cases, and positive behavior reinforcement.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#features" className="hover:text-primary transition-colors">Features</Link></li>
                <li><Link href="#security" className="hover:text-primary transition-colors">Security</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-primary transition-colors">FERPA Compliance</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} SWIMS Platform. All rights reserved.</p>
            <p>Designed for educational excellence.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
