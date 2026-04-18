import { useState } from 'react';
import { App, Button, Form, Input, Tabs } from 'antd';
import { useLogin, useRegister } from '@/api/queries/auth';

type TabKey = 'login' | 'signup';

interface LoginForm { email: string; password: string; }
interface SignupForm { username: string; email: string; password: string; confirm: string; }

export function AuthPage() {
  const [tab, setTab] = useState<TabKey>('login');
  const { message } = App.useApp();
  const login = useLogin();
  const register = useRegister();

  async function onLoginSubmit(values: LoginForm) {
    try {
      await login.mutateAsync({ email: values.email, password: values.password });
    } catch (err) {
      message.error((err as Error).message);
    }
  }

  async function onSignupSubmit(values: SignupForm) {
    if (values.password !== values.confirm) {
      message.error('Passwords do not match');
      return;
    }
    try {
      await register.mutateAsync({
        username: values.username,
        email: values.email,
        password: values.password,
      });
    } catch (err) {
      message.error((err as Error).message);
    }
  }

  return (
    <div className="auth-page flex min-h-screen items-center justify-center p-4">
      <div className="auth-card w-full max-w-md rounded-lg border border-border bg-panel p-6 shadow-lg">
        <h1 className="title mb-1 text-center">KAABOO</h1>
        <p className="subtitle mb-6 text-center text-inkDim">Real-time multiplayer card game</p>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          centered
          items={[
            {
              key: 'login',
              label: 'Login',
              children: (
                <Form<LoginForm>
                  layout="vertical"
                  onFinish={onLoginSubmit}
                  autoComplete="off"
                  requiredMark={false}
                >
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
                    <Input placeholder="you@example.com" autoFocus />
                  </Form.Item>
                  <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Password is required' }]}>
                    <Input.Password placeholder="••••••••" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={login.isPending}>
                    Log In
                  </Button>
                </Form>
              ),
            },
            {
              key: 'signup',
              label: 'Sign Up',
              children: (
                <Form<SignupForm>
                  layout="vertical"
                  onFinish={onSignupSubmit}
                  autoComplete="off"
                  requiredMark={false}
                >
                  <Form.Item name="username" label="Username" rules={[{ required: true, min: 2, max: 20, message: '2–20 characters' }]}>
                    <Input placeholder="2–20 characters" autoFocus />
                  </Form.Item>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
                    <Input placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item name="password" label="Password" rules={[{ required: true, min: 6, message: 'At least 6 characters' }]}>
                    <Input.Password placeholder="At least 6 characters" />
                  </Form.Item>
                  <Form.Item name="confirm" label="Confirm Password" dependencies={['password']} rules={[{ required: true, message: 'Confirm your password' }]}>
                    <Input.Password placeholder="Repeat password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={register.isPending}>
                    Create Account
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

