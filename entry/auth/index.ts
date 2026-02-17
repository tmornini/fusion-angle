import {
  $, showToast, navigateTo,
  iconSparkles, iconArrowRight, iconLoader,
} from '../../site/script';

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

export async function init(): Promise<void> {
  const root = $('#page-root');
  if (!root) return;

  root.innerHTML = `
    <div class="min-h-screen flex bg-background">
      <div class="auth-branding hidden" id="auth-branding">
        <div style="position:relative;z-index:10;display:flex;flex-direction:column;justify-content:center;padding:3rem 5rem;height:100%">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-6">
              <div style="width:3rem;height:3rem;border-radius:var(--radius-xl);background:hsl(var(--accent));display:flex;align-items:center;justify-content:center">
                ${iconSparkles(24)}
              </div>
              <span class="text-3xl font-display font-bold" style="color:hsl(var(--primary-foreground))">Fusion AI</span>
            </div>
          </div>
          <h1 class="font-display font-bold" style="font-size:2.5rem;color:hsl(var(--primary-foreground));line-height:1.2;margin-bottom:1.5rem">
            Transform your business with intelligent automation
          </h1>
          <p style="font-size:var(--text-lg);color:hsl(var(--primary-foreground) / 0.8);max-width:28rem">
            Join thousands of companies using Fusion AI to streamline operations, boost productivity, and unlock new possibilities.
          </p>
          <div class="flex gap-8 mt-12">
            <div><div class="text-3xl font-display font-bold" style="color:hsl(var(--accent))">10K+</div><div class="text-sm" style="color:hsl(var(--primary-foreground) / 0.7)">Active Users</div></div>
            <div><div class="text-3xl font-display font-bold" style="color:hsl(var(--accent))">98%</div><div class="text-sm" style="color:hsl(var(--primary-foreground) / 0.7)">Satisfaction</div></div>
            <div><div class="text-3xl font-display font-bold" style="color:hsl(var(--accent))">50+</div><div class="text-sm" style="color:hsl(var(--primary-foreground) / 0.7)">Integrations</div></div>
          </div>
        </div>
      </div>

      <div style="width:100%;display:flex;align-items:center;justify-content:center;padding:2rem" id="auth-form-wrapper">
        <div style="width:100%;max-width:28rem">
          <div class="flex items-center gap-3 mb-8 justify-center" id="mobile-logo">
            <div class="gradient-hero rounded-xl flex items-center justify-center" style="width:2.5rem;height:2.5rem">
              ${iconSparkles(20)}
            </div>
            <span class="text-2xl font-display font-bold text-foreground">Fusion AI</span>
          </div>

          <div class="card p-8">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-display font-bold text-foreground mb-2" id="auth-title">Welcome back</h2>
              <p class="text-muted" id="auth-subtitle">Sign in to your account to continue</p>
            </div>

            <form id="auth-form" class="flex flex-col gap-5">
              <div>
                <label class="label mb-2 block" for="email">Email</label>
                <input class="input" id="email" type="email" placeholder="you@company.com" autocomplete="email" />
                <p class="text-sm text-error mt-1 hidden" id="email-error"></p>
              </div>

              <div>
                <label class="label mb-2 block" for="password">Password</label>
                <input class="input" id="password" type="password" placeholder="••••••••" autocomplete="current-password" />
                <p class="text-sm text-error mt-1 hidden" id="password-error"></p>
              </div>

              <div id="company-field" class="hidden animate-fade-in">
                <label class="label mb-2 block" for="companyName">
                  Company name <span class="text-muted">(optional)</span>
                </label>
                <input class="input" id="companyName" type="text" placeholder="Acme Inc." />
              </div>

              <button type="submit" class="btn btn-primary w-full" style="height:3rem;font-size:var(--text-base)" id="submit-btn">
                Sign in ${iconArrowRight(20)}
              </button>
            </form>

            <div class="mt-6 text-center">
              <p class="text-muted">
                <span id="toggle-prompt">Don't have an account?</span>
                <button type="button" class="text-primary font-medium ml-2" id="toggle-mode" style="background:none;border:none;cursor:pointer">Sign up</button>
              </p>
            </div>
          </div>

          <p class="mt-6 text-center text-sm text-muted">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>`;

  let isLogin = true;

  const form = $('#auth-form') as HTMLFormElement;
  const emailInput = $('#email') as HTMLInputElement;
  const passwordInput = $('#password') as HTMLInputElement;
  const emailError = $('#email-error') as HTMLElement;
  const passwordError = $('#password-error') as HTMLElement;
  const companyField = $('#company-field') as HTMLElement;
  const toggleMode = $('#toggle-mode') as HTMLElement;
  const togglePrompt = $('#toggle-prompt') as HTMLElement;
  const authTitle = $('#auth-title') as HTMLElement;
  const authSubtitle = $('#auth-subtitle') as HTMLElement;
  const submitBtn = $('#submit-btn') as HTMLElement;

  // Desktop branding visibility
  const branding = $('#auth-branding');
  if (branding && window.innerWidth >= 1024) {
    branding.classList.remove('hidden');
    branding.style.display = '';
    const wrapper = $('#auth-form-wrapper');
    if (wrapper) wrapper.style.width = '50%';
  }
  const mobileLogo = $('#mobile-logo');
  if (mobileLogo && window.innerWidth >= 1024) mobileLogo.classList.add('hidden');

  function updateMode(): void {
    authTitle.textContent = isLogin ? 'Welcome back' : 'Get started';
    authSubtitle.textContent = isLogin ? 'Sign in to your account to continue' : 'Create your account and start your journey';
    companyField.classList.toggle('hidden', isLogin);
    togglePrompt.textContent = isLogin ? "Don't have an account?" : 'Already have an account?';
    toggleMode.textContent = isLogin ? 'Sign up' : 'Sign in';
    submitBtn.innerHTML = (isLogin ? 'Sign in' : 'Create account') + ' ' + iconArrowRight(20);
  }

  toggleMode.addEventListener('click', () => {
    isLogin = !isLogin;
    emailError.classList.add('hidden');
    passwordError.classList.add('hidden');
    updateMode();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    emailError.classList.add('hidden');
    passwordError.classList.add('hidden');

    const email = emailInput.value;
    const password = passwordInput.value;

    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);

    if (emailErr) {
      emailError.textContent = emailErr;
      emailError.classList.remove('hidden');
      emailInput.classList.add('input-error');
    } else {
      emailInput.classList.remove('input-error');
    }

    if (passErr) {
      passwordError.textContent = passErr;
      passwordError.classList.remove('hidden');
      passwordInput.classList.add('input-error');
    } else {
      passwordInput.classList.remove('input-error');
    }

    if (emailErr || passErr) return;

    submitBtn.innerHTML = iconLoader(20, 'animate-spin-slow');
    submitBtn.setAttribute('disabled', '');

    setTimeout(() => {
      if (isLogin) {
        navigateTo('dashboard');
      } else {
        showToast('Welcome to Fusion AI! Your account has been created.', 'success');
        navigateTo('onboarding');
      }
    }, 800);
  });
}
