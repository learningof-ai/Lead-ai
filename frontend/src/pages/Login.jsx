import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Phone, ArrowRight } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--bg)]" data-testid="login-page">
      <Toaster position="top-right" richColors />
      <div
        className="hidden lg:flex lg:w-1/2 relative bg-cover bg-center"
        style={{
          minHeight: "100vh",
          backgroundImage: "url('https://images.pexels.com/photos/30227710/pexels-photo-30227710.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=940')",
        }}
      >
        <div className="absolute inset-0 bg-[var(--brand)]/40" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white flex items-center justify-center">
              <Phone weight="duotone" size={20} color="var(--brand)" />
            </div>
            <div>
              <div className="font-display text-2xl tracking-tight leading-none">LeaseFlow</div>
              <div className="text-[10px] tracking-[0.2em] uppercase opacity-75 mt-0.5">form.rentals</div>
            </div>
          </div>
          <div>
            <h2 className="font-display text-4xl tracking-tight leading-tight max-w-md">
              Every Vapi call. Every lead. One workspace.
            </h2>
            <p className="opacity-80 mt-4 max-w-md leading-relaxed">
              Capture every rental inquiry your AI voice agent receives — and never let one slip through the cracks.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 min-h-screen lg:min-h-0">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Sign in</div>
            <h1 className="font-display text-3xl tracking-tight">Welcome back</h1>
            <p className="text-[var(--text-muted)] mt-1 text-[13px]">
              Don't have an account?{" "}
              <Link to="/signup" className="text-[var(--brand)] underline underline-offset-4">Create one</Link>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Email</label>
              <input data-testid="login-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Password</label>
              <input data-testid="login-password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <button data-testid="login-submit" type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Signing in..." : "Sign in"} <ArrowRight size={14} weight="bold" />
          </button>
          <div className="text-[12px] text-[var(--text-muted)] text-center pt-2">
            Default admin: <span className="font-mono">admin@form.rentals</span> · <span className="font-mono">leaseflow2026</span>
          </div>
        </form>
      </div>
    </div>
  );
}
