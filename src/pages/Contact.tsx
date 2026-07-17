import { useState } from "react";
import CorporateNav from "@/components/corporate/CorporateNav";
import CorporateFooter from "@/components/corporate/CorporateFooter";
import { Mail, MapPin, Phone, Globe2, Send, CheckCircle2 } from "lucide-react";

const contactInfo = [
  { icon: MapPin, label: "Headquarters", value: "Bangalore, India" },
  { icon: Phone, label: "Phone", value: "+91 80 4XXX XXXX" },
  { icon: Mail, label: "Email", value: "contact@fwc.co.in" },
  { icon: Globe2, label: "Website", value: "www.fwc.co.in" },
];

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

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
            Get In Touch
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-white mb-6">
            Let's <span className="text-indigo-600 dark:text-indigo-400">Talk</span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Have a project in mind? Reach out to our team for a consultation.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Contact Info */}
            <div className="space-y-8">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Contact Information</h2>
              <p className="text-slate-600 dark:text-slate-300">
                Fill out the form and our team will get back to you within 24 hours.
              </p>
              <div className="space-y-4">
                {contactInfo.map((item) => (
                  <div key={item.label} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
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

            {/* Form */}
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-700">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="w-16 h-16 text-indigo-600 dark:text-indigo-400 mb-4" />
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Thank You!</h3>
                  <p className="text-slate-600 dark:text-slate-300">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                      <input type="text" required className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" placeholder="John" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                      <input type="text" required className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" placeholder="Doe" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                    <input type="email" required className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" placeholder="john@company.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company</label>
                    <input type="text" className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" placeholder="Company name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Message</label>
                    <textarea rows={5} required className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none" placeholder="Tell us about your project..." />
                  </div>
                  <button type="submit" className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg">
                    <Send className="w-5 h-5" /> Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <CorporateFooter />
    </div>
  );
}
