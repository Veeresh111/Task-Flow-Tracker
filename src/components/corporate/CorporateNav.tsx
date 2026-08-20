import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { Menu, X, Sun, Moon, ChevronDown } from "lucide-react";

const navItems = [
  { name: "Home", path: "/" },
  {
    name: "About", path: "/about",
    children: [
      { name: "Company Overview", path: "/about" },
      { name: "Leadership", path: "/about#leadership" },
      { name: "Culture", path: "/about#culture" },
    ],
  },
  {
    name: "Services", path: "/services",
    children: [
      { name: "Cloud Engineering", path: "/services#cloud" },
      { name: "AI & Machine Learning", path: "/services#ai" },
      { name: "Cyber Security", path: "/services#security" },
      { name: "Data Engineering", path: "/services#data" },
      { name: "Digital Transformation", path: "/services#digital" },
      { name: "IT Consulting", path: "/services#consulting" },
    ],
  },
  { name: "Careers", path: "/careers" },
  { name: "Contact", path: "/contact" },
];

interface Props {
  transparent?: boolean;
}

export default function CorporateNav({ transparent }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); setOpenDropdown(null); }, [location]);

  const isSolid = !transparent || scrolled || mobileOpen;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isSolid ? "bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <img src="/fwc-logo.png" alt="FWC Logo" className={`h-10 w-auto transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] ${isSolid ? "dark:drop-shadow-[0_0_6px_rgba(99,102,241,0.3)]" : "drop-shadow-[0_0_6px_rgba(255,255,255,0.3)]"}`} />
            <span className={`text-xl font-extrabold tracking-wider transition-colors duration-300 ${isSolid ? "text-slate-900 dark:text-white" : "text-white"}`}>FWC</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <div key={item.name} className="relative group" onMouseEnter={() => setOpenDropdown(item.name)} onMouseLeave={() => setOpenDropdown(null)}>
                <Link to={item.path} className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-full transition-colors ${isSolid ? "text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50" : "text-white/80 hover:text-white hover:bg-white/10"}`}>
                  {item.name}
                  {item.children && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === item.name ? "rotate-180" : ""}`} />}
                </Link>
                {item.children && openDropdown === item.name && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {item.children.map((child) => (
                      <Link key={child.name} to={child.path} className="block px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors">
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="ml-4 flex items-center gap-3">
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={`p-2 rounded-full transition-colors ${isSolid ? "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800" : "text-white/80 hover:text-white hover:bg-white/10"}`} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <Link to="/login" className={`text-sm font-semibold px-5 py-2 rounded-full transition-all ${isSolid ? "text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400" : "text-white border border-white/30 hover:bg-white/10"}`}>Sign In</Link>
              <Link to="/register" className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-full transition-all shadow-md hover:shadow-lg">Get Started</Link>
            </div>
          </div>

          {/* Mobile Toggle */}
          <div className="lg:hidden flex items-center gap-3">
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={`p-2 rounded-full transition-colors ${isSolid ? "text-slate-500" : "text-white"}`} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className={`p-2 ${isSolid ? "text-slate-700 dark:text-slate-200" : "text-white"}`} aria-label="Menu">
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shadow-xl max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <div key={item.name}>
                <Link to={item.path} className="block px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors">
                  {item.name}
                </Link>
                {item.children && (
                  <div className="ml-4 space-y-1 pb-2">
                    {item.children.map((child) => (
                      <Link key={child.name} to={child.path} className="block px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors">
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="pt-4 space-y-3 border-t border-slate-100 dark:border-slate-800">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="block w-full text-center px-4 py-3 text-sm font-semibold text-indigo-600 border border-indigo-200 dark:border-indigo-800 rounded-full">Sign In</Link>
              <Link to="/register" onClick={() => setMobileOpen(false)} className="block w-full text-center px-4 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-full">Get Started</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
