import { Link } from "react-router-dom";

export default function CorporateFooter() {
  return (
    <footer className="bg-slate-900 dark:bg-slate-950 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 group">
              <img src="/fwc-logo.png" alt="FWC Logo" className="h-10 w-auto transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              <span className="text-xl font-extrabold text-white tracking-wider">FWC</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Enterprise technology solutions for the digital age.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Services</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              {["Cloud Engineering", "AI & ML", "Cyber Security", "Data Engineering", "Digital Transformation", "IT Consulting"].map((item) => (
                <li key={item}><Link to="/services" className="hover:text-indigo-400 transition-colors">{item}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              {["About Us", "Careers", "Leadership", "Contact"].map((item) => (
                <li key={item}><Link to={item === "About Us" ? "/about" : item === "Careers" ? "/careers" : item === "Contact" ? "/contact" : "/about"} className="hover:text-indigo-400 transition-colors">{item}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Connect</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li>Bangalore, India</li>
              <li>contact@fwc.co.in</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500"> 2026 FWC. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-indigo-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
