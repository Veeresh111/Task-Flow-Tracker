import CorporateNav from "@/components/corporate/CorporateNav";
import CorporateFooter from "@/components/corporate/CorporateFooter";
import { Target, Eye, Users, Award, TrendingUp } from "lucide-react";

const timeline = [
  { year: "2015", title: "Founded", desc: "FWC established in Bangalore with a vision to deliver enterprise-grade technology consulting." },
  { year: "2017", title: "Cloud Practice", desc: "Launched dedicated cloud engineering division — AWS, Azure, and GCP certified." },
  { year: "2019", title: "AI & ML Division", desc: "Invested in AI research and development, building custom ML solutions for enterprise clients." },
  { year: "2021", title: "Global Expansion", desc: "Opened delivery centers serving clients across multiple regions and industries." },
  { year: "2023", title: "AI-Native Platform", desc: "Launched AI-powered HRMS/ATS platform integrating recruitment, payroll, and workforce management." },
  { year: "2025", title: "Enterprise Scale", desc: "500+ professionals, 100+ enterprise clients, end-to-end digital transformation partner." },
];

const leadership = [
  { name: "Prakash Mulge", title: "Founder & CEO", desc: "Visionary leader with deep expertise in enterprise technology and digital transformation." },
  { name: "Leadership Team", title: "Engineering, AI, Cloud, Security", desc: "Experienced leaders driving innovation across all technology domains." },
];

export default function About() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <CorporateNav />

      {/* Hero */}
      <section className="relative pt-32 pb-20 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all duration-500" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-all duration-300">
                <img src="/fwc-logo.png" alt="FWC" className="w-12 h-12 brightness-0 invert" />
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-6">
            About FWC
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white mb-6">
            Building the <span className="text-indigo-600 dark:text-indigo-400">Future</span> of Enterprise Technology
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Future Worthy Consulting (FWC) is an enterprise technology firm headquartered in Bangalore, India. 
            We partner with organizations to architect, build, and deploy digital solutions that drive measurable business outcomes.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="p-8 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
              <Target className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mb-4" />
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Our Mission</h3>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                To empower enterprises with future-ready technology solutions that drive efficiency, 
                innovation, and growth in an increasingly digital world.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
              <Eye className="w-10 h-10 text-blue-600 dark:text-blue-400 mb-4" />
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Our Vision</h3>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                To be the most trusted technology partner for enterprises worldwide, 
                known for technical excellence, innovation, and unwavering commitment to client success.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">Our Journey</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-16 max-w-2xl mx-auto">
            From a startup to an enterprise technology partner
          </p>
          <div className="space-y-8">
            {timeline.map((item, i) => (
              <div key={item.year} className="flex gap-6 items-start">
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${i === timeline.length - 1 ? "bg-indigo-600 text-white" : "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"}`}>
                    {item.year}
                  </div>
                  {i < timeline.length - 1 && <div className="w-0.5 h-full bg-indigo-200 dark:bg-indigo-800" />}
                </div>
                <div className="pb-8">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{item.title}</h3>
                  <p className="text-slate-600 dark:text-slate-300">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leadership */}
      <section id="leadership" className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">Leadership</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-16 max-w-2xl mx-auto">
            Experienced leaders driving innovation across all technology domains
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {leadership.map((person) => (
              <div key={person.name} className="p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{person.name}</h3>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-3">{person.title}</p>
                <p className="text-slate-600 dark:text-slate-300">{person.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Culture */}
      <section id="culture" className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">Our Culture</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-16 max-w-2xl mx-auto">
            What makes FWC a great place to work
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, title: "Collaborative", desc: "Cross-functional teams working together to solve complex problems." },
              { icon: Award, title: "Excellence", desc: "Commitment to quality, continuous learning, and professional growth." },
              { icon: TrendingUp, title: "Innovation", desc: "Encouraging creative thinking and experimentation with emerging technologies." },
              { icon: Target, title: "Impact-Driven", desc: "Focused on delivering measurable value to clients and stakeholders." },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
                <item.icon className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CorporateFooter />
    </div>
  );
}
