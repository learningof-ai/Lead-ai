import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await signup(form.email, form.password, form.full_name);
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--bg)]" data-testid="signup-page">
      <Toaster position="top-right" richColors />
      <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="signup-form">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Get started</div>
          <h1 className="font-display text-3xl tracking-tight">Join your team</h1>
          <p className="text-[var(--text-muted)] mt-1 text-[13px]">
            Already a member?{" "}
            <Link to="/login" className="text-[var(--brand)] underline underline-offset-4">Sign in</Link>
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Full name</label>
            <input data-testid="signup-name" className="input" required value={form.full_name} onChange={set("full_name")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Email</label>
            <input data-testid="signup-email" className="input" type="email" required value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Password</label>
            <input data-testid="signup-password" className="input" type="password" required minLength={8} value={form.password} onChange={set("password")} />
            <p className="text-[11px] text-[var(--text-faint)] mt-1.5">At least 8 characters.</p>
          </div>
        </div>
        <button data-testid="signup-submit" disabled={busy} className="btn-primary w-full" type="submit">
          {busy ? "Creating account..." : "Create account"} <ArrowRight size={14} weight="bold" />
        </button>
      </form>
    </div>
  );
}
