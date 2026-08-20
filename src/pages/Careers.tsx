import { useState } from "react";
import CorporateNav from "@/components/corporate/CorporateNav";
import CorporateFooter from "@/components/corporate/CorporateFooter";
import { Briefcase, MapPin, Clock, Users, GraduationCap, Heart, Zap, Coffee, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const positions = [
  { title: "Senior Cloud Engineer", dept: "Cloud Engineering", loc: "Bangalore", type: "Full-time", desc: "Design and manage enterprise cloud infrastructure on AWS/Azure/GCP." },
  { title: "AI/ML Engineer", dept: "AI & Machine Learning", loc: "Bangalore", type: "Full-time", desc: "Build and deploy ML models for enterprise AI solutions." },
  { title: "Full Stack Developer", dept: "Digital Transformation", loc: "Bangalore", type: "Full-time", desc: "Develop cloud-native enterprise applications with modern stacks." },
  { title: "Cyber Security Analyst", dept: "Cyber Security", loc: "Bangalore", type: "Full-time", desc: "Conduct security assessments, penetration testing, and compliance audits." },
  { title: "Data Engineer", dept: "Data Engineering", loc: "Bangalore", type: "Full-time", desc: "Build data pipelines, warehouses, and analytics platforms." },
  { title: "UI/UX Designer", dept: "Digital Transformation", loc: "Bangalore", type: "Full-time", desc: "Design intuitive enterprise applications with focus on user experience." },
];

const benefits = [
  { icon: Heart, title: "Health Insurance", desc: "Comprehensive medical coverage for you and your family." },
  { icon: Zap, title: "Learning Budget", desc: "Annual budget for courses, conferences, and certifications." },
  { icon: Coffee, title: "Flexible Hours", desc: "Flexible work schedules and remote-friendly environment." },
  { icon: Users, title: "Team Events", desc: "Regular team outings, hackathons, and cultural events." },
  { icon: GraduationCap, title: "Mentorship", desc: "Structured mentorship programs and career growth paths." },
  { icon: Clock, title: "Paid Time Off", desc: "Generous vacation policy and paid holidays." },
];

export default function Careers() {
  const [activeDept, setActiveDept] = useState("All");

  const departments = ["All", "Cloud Engineering", "AI & Machine Learning", "Cyber Security", "Data Engineering", "Digital Transformation"];
  const filtered = activeDept === "All" ? positions : positions.filter((p) => p.dept === activeDept);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <CorporateNav />

      {/* Hero */}
      <section className="relative pt-32 pb-20 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:scale-105">
              <img src="/fwc-logo.png" alt="FWC Logo" className="w-12 h-12 object-contain" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-6">
            Join Our Team
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white mb-6">
            Shape the <span className="text-indigo-600 dark:text-indigo-400">Future</span> With Us
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            At FWC, we're looking for passionate individuals who want to build enterprise technology that makes a difference.
          </p>
        </div>
      </section>

      {/* Why Join */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">Why Join FWC?</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-16 max-w-2xl mx-auto">
            We invest in our people because they're our greatest asset
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b) => (
              <div key={b.title} className="p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
                <b.icon className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{b.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">Open Positions</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-8 max-w-2xl mx-auto">
            Find your next opportunity at FWC
          </p>

          {/* Department Filter */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {departments.map((dept) => (
              <button key={dept} onClick={() => setActiveDept(dept)} className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${activeDept === dept ? "bg-indigo-600 text-white shadow-md" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400"}`}>
                {dept}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-slate-500 py-12">No open positions in this category right now.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {filtered.map((pos) => (
                <div key={pos.title} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{pos.title}</h3>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">{pos.dept}</p>
                    </div>
                    <Briefcase className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{pos.desc}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{pos.loc}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{pos.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Internships */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium mb-6">
            <GraduationCap className="w-4 h-4" /> Internships
          </div>
          <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Start Your Career at FWC</h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-10">
            Our internship program offers hands-on experience with real enterprise projects, mentorship from industry experts, 
            and a path to full-time employment.
          </p>
          <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 transition-all shadow-lg">
            Apply Now <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <CorporateFooter />
    </div>
  );
}
