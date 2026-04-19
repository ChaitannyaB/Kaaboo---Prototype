import { useState, type FormEvent } from "react";
import { useLogin, useRegister } from "@/api/queries/auth";

type TabKey = "login" | "signup";

interface LoginForm {
  email: string;
  password: string;
}
interface SignupForm {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

export function AuthPage() {
  const [tab, setTab] = useState<TabKey>("login");

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState<SignupForm>({
    username: "",
    email: "",
    password: "",
    confirm: "",
  });

  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");

  const login = useLogin();
  const register = useRegister();
  const loading = login.isPending || register.isPending;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      await login.mutateAsync({
        email: loginForm.email,
        password: loginForm.password,
      });
    } catch (err) {
      setLoginError((err as Error).message);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setSignupError("");
    if (signupForm.password !== signupForm.confirm) {
      setSignupError("Passwords do not match");
      return;
    }
    try {
      await register.mutateAsync({
        username: signupForm.username,
        email: signupForm.email,
        password: signupForm.password,
      });
    } catch (err) {
      setSignupError((err as Error).message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card max-w-[98%] md:max-w-[400px] px-[10px] py-[24px] md:px-[36px] md:py-[32px]">
        <h1
          className="title text-[35px] md:text-[48px]"
          style={{ marginBottom: "4px" }}
        >
          KAABOO
        </h1>
        <p className="subtitle" style={{ marginBottom: "24px" }}>
          Real-time multiplayer card game
        </p>

        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === "login" ? " auth-tab-active" : ""}`}
            onClick={() => {
              setTab("login");
              setLoginError("");
            }}
          >
            Login
          </button>
          <button
            className={`auth-tab${tab === "signup" ? " auth-tab-active" : ""}`}
            onClick={() => {
              setTab("signup");
              setSignupError("");
            }}
          >
            Sign Up
          </button>
        </div>

        {tab === "login" && (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, email: e.target.value }))
                }
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, password: e.target.value }))
                }
                required
              />
            </div>
            {loginError && <p className="auth-error">{loginError}</p>}
            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: "8px" }}
            >
              {login.isPending ? "Logging in…" : "Log In"}
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form className="auth-form" onSubmit={handleSignup}>
            <div className="auth-field">
              <label className="auth-label">Username</label>
              <input
                className="input"
                type="text"
                placeholder="2–20 characters"
                value={signupForm.username}
                minLength={2}
                maxLength={20}
                onChange={(e) =>
                  setSignupForm((f) => ({ ...f, username: e.target.value }))
                }
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={signupForm.email}
                onChange={(e) =>
                  setSignupForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="At least 6 characters"
                value={signupForm.password}
                minLength={6}
                onChange={(e) =>
                  setSignupForm((f) => ({ ...f, password: e.target.value }))
                }
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                placeholder="Re-type entered password"
                value={signupForm.confirm}
                onChange={(e) =>
                  setSignupForm((f) => ({ ...f, confirm: e.target.value }))
                }
                required
              />
            </div>
            {signupError && <p className="auth-error">{signupError}</p>}
            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: "8px" }}
            >
              {register.isPending ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
