import CorporateNav from "@/components/corporate/CorporateNav";
import CorporateFooter from "@/components/corporate/CorporateFooter";
import { Cloud, Cpu, Shield, Database, Laptop, BarChart3, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const serviceDetails = [
  {
    id: "cloud",
    icon: Cloud,
    title: "Cloud Engineering",
    desc: "End-to-end cloud solutions including infrastructure design, migration, optimization, and managed services across AWS, Azure, and GCP.",
    features: ["Cloud architecture & strategy", "Migration & modernization", "DevOps & CI/CD pipelines", "Managed cloud operations", "Cost optimization", "Security & compliance"],
  },
  {
    id: "ai",
    icon: Cpu,
    title: "AI & Machine Learning",
    desc: "Custom AI solutions that transform business processes — from predictive analytics to natural language processing and computer vision.",
    features: ["Machine learning models", "Natural language processing", "Computer vision systems", "Predictive analytics", "Recommendation engines", "AI-powered automation"],
  },
  {
    id: "security",
    icon: Shield,
    title: "Cyber Security",
    desc: "Comprehensive security services to protect enterprise infrastructure, data, and applications from evolving threats.",
    features: ["Security audits & assessments", "Penetration testing", "SOC operations", "Compliance management", "Incident response", "Security architecture"],
  },
  {
    id: "data",
    icon: Database,
    title: "Data Engineering",
    desc: "Build robust data platforms that enable real-time analytics, business intelligence, and data-driven decision making.",
    features: ["Data warehousing", "ETL pipeline development", "Real-time analytics", "Business intelligence", "Data governance", "Big data solutions"],
  },
  {
    id: "digital",
    icon: Laptop,
    title: "Digital Transformation",
    desc: "End-to-end digital strategy and implementation to modernize legacy systems and create new digital capabilities.",
    features: ["Digital strategy & roadmap", "Legacy modernization", "Enterprise software development", "Cloud-native applications", "API & microservices", "UX/UI design"],
  },
  {
    id: "consulting",
    icon: BarChart3,
    title: "IT Consulting",
    desc: "Strategic technology advisory services to help enterprises make informed decisions about their technology investments.",
    features: ["Technology strategy", "Architecture design", "Vendor evaluation", "Digital roadmap", "IT governance", "Technology risk assessment"],
  },
];

export default function Services() {
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
            Our Services
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white mb-6">
            Enterprise Technology <span className="text-indigo-600 dark:text-indigo-400">Solutions</span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Comprehensive technology services designed to help enterprises innovate, scale, and succeed in the digital era.
          </p>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-24">
            {serviceDetails.map((svc, i) => (
              <div key={svc.id} id={svc.id} className={`grid lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:direction-rtl" : ""}`}>
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-6">
                    <svc.icon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{svc.title}</h2>
                  <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">{svc.desc}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {svc.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="text-sm">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-3xl p-12 flex items-center justify-center min-h-[300px] border border-indigo-100 dark:border-indigo-900/50">
                    <svc.icon className="w-32 h-32 text-indigo-600/20 dark:text-indigo-400/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-indigo-600 to-indigo-800 dark:from-indigo-900 dark:to-indigo-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Transform Your Business?</h2>
          <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto">
            Let's discuss how FWC can help you achieve your technology goals.
          </p>
          <Link to="/contact" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 font-semibold rounded-full hover:bg-indigo-50 transition-all shadow-lg">
            Contact Us <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <CorporateFooter />
    </div>
  );
}
