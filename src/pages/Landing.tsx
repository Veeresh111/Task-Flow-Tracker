import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import CorporateNav from "@/components/corporate/CorporateNav";
import CorporateFooter from "@/components/corporate/CorporateFooter";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight,
  Users,
  Building2,
  Globe2,
  Shield,
  Cloud,
  Cpu,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Laptop,
  Database,
  Eye,
  Target,
  TrendingUp,
  Award,
  Sparkles,
  Mail,
  MapPin,
  Phone,
  ExternalLink,
} from "lucide-react";

const services = [
  { icon: Cloud, title: "Cloud Engineering", desc: "Enterprise cloud infrastructure, migration, and managed services on AWS, Azure, and GCP." },
  { icon: Cpu, title: "AI & Machine Learning", desc: "Custom AI solutions, NLP, computer vision, and predictive analytics for enterprise transformation." },
  { icon: Shield, title: "Cyber Security", desc: "Comprehensive security auditing, penetration testing, SOC operations, and compliance management." },
  { icon: Database, title: "Data Engineering", desc: "Data warehousing, ETL pipelines, real-time analytics, and business intelligence platforms." },
  { icon: Laptop, title: "Digital Transformation", desc: "End-to-end digital strategy, legacy modernization, and enterprise software development." },
  { icon: BarChart3, title: "IT Consulting", desc: "Strategic technology advisory, architecture design, and digital roadmap planning." },
];

const industries = [
  { name: "Healthcare", desc: "HIPAA-compliant systems, EHR platforms, telemedicine solutions" },
  { name: "Banking & Finance", desc: "Secure banking platforms, payment gateways, risk management systems" },
  { name: "Retail & E-Commerce", desc: "Omnichannel platforms, inventory management, customer analytics" },
  { name: "Manufacturing", desc: "IoT-enabled factories, supply chain optimization, predictive maintenance" },
  { name: "Logistics & Supply Chain", desc: "Fleet management, route optimization, warehouse automation" },
  { name: "Education", desc: "LMS platforms, virtual classrooms, student information systems" },
];

const stats = [
  { value: "10+", label: "Years in Enterprise Tech" },
  { value: "100+", label: "Enterprise Clients" },
  { value: "500+", label: "Technology Professionals" },
  { value: "99.9%", label: "Platform Uptime" },
];

const whyFwc = [
  { icon: Target, title: "Domain Expertise", desc: "Deep industry knowledge across healthcare, finance, retail, and more." },
  { icon: Award, title: "Enterprise Grade", desc: "ISO-certified processes, enterprise security standards, and 24/7 support." },
  { icon: TrendingUp, title: "Innovation First", desc: "Continuous investment in AI, cloud, and emerging technologies." },
  { icon: Users, title: "Talent Driven", desc: "2,000+ skilled professionals dedicated to client success." },
  { icon: Eye, title: "Transparent Delivery", desc: "Agile methodologies with complete visibility into project progress." },
  { icon: Sparkles, title: "AI-Native Approach", desc: "AI embedded in every solution for smarter, faster outcomes." },
];

export default function Landing() {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const heroRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [contactForm, setContactForm] = useState({ firstName: "", lastName: "", email: "", message: "" });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <CorporateNav />

      {/* HERO */}
      <section
        ref={heroRef}
        id="home"
        className="relative min-h-screen flex items-center pt-16 lg:pt-20 overflow-hidden"
      >
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950" />
          <div
            className="absolute inset-0 opacity-40 dark:opacity-20 transition-opacity duration-700"
            style={{
              background: `radial-gradient(800px circle at ${mousePos.x}% ${mousePos.y}%, rgba(99,102,241,0.15), transparent 50%)`,
            }}
          />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-100/50 to-transparent dark:from-indigo-900/10" />

          {/* Floating orbs */}
          <div className="absolute top-20 left-[20%] w-48 h-48 bg-indigo-200/20 dark:bg-indigo-800/10 rounded-full blur-3xl animate-float-hero" />
          <div className="absolute bottom-20 right-[25%] w-64 h-64 bg-blue-200/20 dark:bg-blue-800/10 rounded-full blur-3xl animate-float-hero" style={{ animationDelay: "3s" }} />
          <div className="absolute top-[40%] left-[60%] w-32 h-32 bg-violet-200/15 dark:bg-violet-800/8 rounded-full blur-3xl animate-float-hero" style={{ animationDelay: "6s" }} />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium backdrop-blur-sm border border-indigo-200/50 dark:border-indigo-700/30">
                <img src="/fwc-logo.png" alt="FWC Logo" className="h-5 w-auto" />
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Enterprise Digital Transformation Partner
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                Future
                <span className="text-indigo-600 dark:text-indigo-400"> Worthy</span>
                <br />
                Consulting
              </h1>

              <p className="text-xl text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                FWC delivers enterprise-grade technology solutions — from AI and cloud engineering
                to cyber security and digital transformation — trusted by enterprises worldwide.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full transition-all shadow-lg hover:shadow-xl hover:shadow-indigo-500/25 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.08)_50%,transparent_75%)] bg-[length:250%_250%] group-hover:bg-[position:100%_100%] transition-all duration-700" />
                  <span className="relative">Explore Opportunities</span>
                  <ArrowRight className="relative w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a
                  href="#services"
                  className="group inline-flex items-center gap-2 px-8 py-4 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-full hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                >
                  Our Services
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>

              <div className="flex items-center gap-6 pt-4">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`w-10 h-10 rounded-full border-2 border-white dark:border-slate-950 bg-gradient-to-br ${['from-indigo-400 to-purple-500','from-blue-400 to-cyan-500','from-emerald-400 to-teal-500','from-amber-400 to-orange-500'][i - 1]}`}
                    />
                  ))}
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">Enterprise</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Grade Solutions</div>
                </div>
              </div>
            </div>

            <div className="hidden lg:block relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent rounded-3xl" />
              <div className="relative bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-200/50 dark:border-slate-700/50 shadow-2xl">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
                      <img src="/fwc-logo.png" alt="FWC Logo" className="w-9 h-9 object-contain" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">Platform Overview</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Enterprise Suite</div>
                    </div>
                  </div>
                  {[
                    { label: "Active Employees", value: "500+", color: "from-indigo-500 to-purple-500" },
                    { label: "Enterprise Clients", value: "100+", color: "from-blue-500 to-cyan-500" },
                    { label: "Platform Uptime", value: "99.9%", color: "from-emerald-500 to-teal-500" },
                    { label: "AI Models Deployed", value: "50+", color: "from-violet-500 to-pink-500" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                      <span className={`text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r ${item.color}`}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      All systems operational
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="relative py-20 bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-900 dark:to-violet-900 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((item) => (
              <div key={item.label} className="text-center group">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1 group-hover:scale-105 transition-transform">
                  {item.value}
                </div>
                <div className="text-sm text-indigo-200/80">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="relative py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">
                <Building2 className="w-4 h-4" />
                About FWC
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight">
                Engineering the<br />
                <span className="text-indigo-600 dark:text-indigo-400">Future</span> of Enterprise
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                FWC is an enterprise technology firm headquartered in Bangalore, India. 
                We partner with organizations to architect, build, and deploy digital solutions 
                that drive measurable business outcomes.
              </p>
              <Link to="/about" className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold hover:gap-3 transition-all">
                Learn more about us <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { number: "10+", label: "Years in Enterprise Tech" },
                { number: "100+", label: "Enterprise Clients" },
                { number: "500+", label: "Technology Professionals" },
                { number: "6", label: "Global Service Regions" },
              ].map((item) => (
                <div key={item.label} className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group">
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-1 group-hover:scale-105 transition-transform">{item.number}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="relative py-24 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-4">
              <Cloud className="w-4 h-4" />
              Our Services
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Enterprise Technology <span className="text-indigo-600 dark:text-indigo-400">Solutions</span>
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Comprehensive services designed to help enterprises innovate and scale.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((svc) => (
              <div key={svc.title} className="group p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-xl transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svc.icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{svc.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{svc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section id="industries" className="relative py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-4">
              <Globe2 className="w-4 h-4" />
              Industries
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Serving <span className="text-indigo-600 dark:text-indigo-400">Diverse</span> Industries
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Deep domain expertise across multiple sectors.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {industries.map((ind) => (
              <div key={ind.name} className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group cursor-default">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{ind.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">{ind.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY FWC */}
      <section id="why-fwc" className="relative py-24 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-4">
              <Award className="w-4 h-4" />
              Why FWC
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Built for <span className="text-indigo-600 dark:text-indigo-400">Enterprise</span> Excellence
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyFwc.map((item) => (
              <div key={item.title} className="group p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-lg transition-all">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <item.icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-900 dark:to-violet-900 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute top-[-10%] left-[30%] w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Ready to Transform Your Enterprise?
          </h2>
          <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto">
            Join leading enterprises that trust FWC for their digital transformation journey.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/register"
              className="group relative inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-semibold rounded-full hover:bg-indigo-50 transition-all shadow-lg overflow-hidden"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(99,102,241,0.05)_50%,transparent_75%)] bg-[length:250%_250%] group-hover:bg-[position:100%_100%] transition-all duration-700" />
              <span className="relative">Get Started</span>
              <ArrowRight className="relative w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-full hover:bg-white/10 transition-all"
            >
              Sign In <ExternalLink className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">
                <Mail className="w-4 h-4" />
                Get In Touch
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight">
                Let's Discuss Your<br />
                <span className="text-indigo-600 dark:text-indigo-400">Next Project</span>
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                Have a project in mind? Reach out to our team for a consultation.
              </p>
              <div className="space-y-4">
                {[
                  { icon: MapPin, label: "Headquarters", value: "Bangalore, India" },
                  { icon: Phone, label: "Phone", value: "+91 80 4XXX XXXX" },
                  { icon: Mail, label: "Email", value: "contact@fwc.co.in" },
                  { icon: Globe2, label: "Website", value: "www.fwc.co.in" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">
                    <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                      <item.icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{item.label}</div>
                      <div className="font-semibold text-slate-900 dark:text-white">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-700">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Send a Message</h3>
              {contactSubmitted ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-slate-700 dark:text-slate-300 font-medium">Thank you for reaching out!</p>
                  <p className="text-sm text-slate-500 mt-1">Our team will get back to you shortly.</p>
                </div>
              ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSubmitted(true); toast({ title: "Message Sent", description: "We'll get back to you shortly." }); }} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="First Name" required value={contactForm.firstName} onChange={e => setContactForm(f => ({...f, firstName: e.target.value}))} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                  <input type="text" placeholder="Last Name" required value={contactForm.lastName} onChange={e => setContactForm(f => ({...f, lastName: e.target.value}))} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                </div>
                <input type="email" placeholder="Email" required value={contactForm.email} onChange={e => setContactForm(f => ({...f, email: e.target.value}))} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                <textarea rows={4} placeholder="Tell us about your project..." required value={contactForm.message} onChange={e => setContactForm(f => ({...f, message: e.target.value}))} className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none" />
                <button type="submit" className="w-full px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg">
                  Send Message
                </button>
              </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <CorporateFooter />

      <style>{`
        @keyframes float-hero {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.5; }
          50% { transform: translateY(-30px) scale(1.05); opacity: 0.8; }
        }
        .animate-float-hero {
          animation: float-hero 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
