import {
  $,
  iconSparkles, iconArrowRight, iconMenu, iconX, iconCheck,
  iconBrain, iconUsers, iconZap, iconShield, iconLineChart, iconMessageSquare,
} from '../../site/script';

const features = [
  { icon: iconBrain, title: 'Intelligent Augmentation', description: 'AI that learns from your expertise and amplifies your decision-making capabilities without replacing human judgment.' },
  { icon: iconUsers, title: 'Collaborative Workflows', description: 'Seamlessly integrate AI assistance into your team\'s existing processes with human oversight at every step.' },
  { icon: iconZap, title: 'Real-Time Insights', description: 'Get instant analysis and recommendations while maintaining full control over the final decisions.' },
  { icon: iconShield, title: 'Enterprise Security', description: 'Bank-grade encryption and compliance with SOC 2, GDPR, and HIPAA requirements built-in.' },
  { icon: iconLineChart, title: 'Transparent Analytics', description: 'Understand how AI arrives at its suggestions with clear explanations and confidence scores.' },
  { icon: iconMessageSquare, title: 'Natural Communication', description: 'Interact with AI using natural language. No technical expertise required to get powerful results.' },
];

const steps = [
  { number: '01', title: 'Connect Your Data', description: 'Securely integrate with your existing tools and data sources. Our platform adapts to your infrastructure.', points: ['One-click integrations', 'Enterprise SSO', 'Custom API support'] },
  { number: '02', title: 'Configure Your Workflows', description: 'Set up AI-assisted processes that match your team\'s needs with human checkpoints where they matter.', points: ['Visual workflow builder', 'Role-based permissions', 'Audit trails'] },
  { number: '03', title: 'Amplify Your Team', description: 'Let AI handle routine tasks while your team focuses on high-value decisions and creative work.', points: ['Real-time collaboration', 'Smart recommendations', 'Continuous learning'] },
];

const companies = ['TechCorp', 'InnovateLab', 'DataFlow', 'NexGen', 'Synergi'];

function renderNavbar(): string {
  return `
    <nav class="navbar" id="navbar">
      <div class="container">
        <div class="navbar-inner">
          <a href="../landing/index.html" class="navbar-logo">
            <div class="navbar-logo-icon">F</div>
            <span class="navbar-logo-text">Fusion AI</span>
          </a>
          <div class="navbar-links">
            <a href="#features" class="navbar-link">Features</a>
            <a href="#how-it-works" class="navbar-link">How It Works</a>
            <a href="#about" class="navbar-link">About</a>
          </div>
          <div class="navbar-cta">
            <button class="btn btn-ghost" data-goto-auth>Sign In</button>
            <button class="btn btn-primary" data-goto-auth>Get Started</button>
          </div>
          <button class="navbar-mobile-toggle" id="mobile-menu-toggle" aria-label="Toggle menu">
            ${iconMenu(24)}
          </button>
        </div>
        <div class="navbar-mobile-menu hidden" id="mobile-menu">
          <a href="#features" class="navbar-link">Features</a>
          <a href="#how-it-works" class="navbar-link">How It Works</a>
          <a href="#about" class="navbar-link">About</a>
          <div class="flex flex-col gap-2 mt-4">
            <button class="btn btn-ghost" data-goto-auth>Sign In</button>
            <button class="btn btn-primary" data-goto-auth>Get Started</button>
          </div>
        </div>
      </div>
    </nav>`;
}

function renderHero(): string {
  return `
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-blob hero-blob-1"></div>
      <div class="hero-blob hero-blob-2"></div>
      <div class="container">
        <div class="hero-content">
          <div class="hero-badge">
            ${iconSparkles(16)}
            <span>Human-Intelligence First</span>
          </div>
          <h1 class="animate-fade-in-up">
            AI That Amplifies <span class="highlight">Human Intelligence</span>
          </h1>
          <p class="hero-subtitle animate-fade-in-up">
            Fusion AI puts humans at the center. Our platform augments your expertise with intelligent automation, helping teams make better decisions faster.
          </p>
          <div class="hero-buttons animate-fade-in-up">
            <button class="btn btn-accent btn-xl" data-goto-auth>
              Start Free Trial ${iconArrowRight(20)}
            </button>
            <button class="btn btn-outline-hero btn-xl">Watch Demo</button>
          </div>
          <div class="hero-trust animate-fade-in-up">
            <p>Trusted by forward-thinking teams</p>
            <div class="hero-trust-logos">
              ${companies.map(c => `<span>${c}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function renderFeatures(): string {
  const cards = features.map(f => `
    <div class="card card-hover feature-card">
      <div class="feature-icon">${f.icon(24)}</div>
      <h3>${f.title}</h3>
      <p>${f.description}</p>
    </div>`).join('');

  return `
    <section id="features" class="features-section bg-background">
      <div class="container">
        <div class="section-header">
          <h2>Built for the Way You Work</h2>
          <p>Powerful AI capabilities designed around human needs, not the other way around.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>
      </div>
    </section>`;
}

function renderHowItWorks(): string {
  const stepCards = steps.map(s => `
    <div class="step">
      <div class="step-number"><span>${s.number}</span></div>
      <div class="card card-flat step-content p-6">
        <h3>${s.title}</h3>
        <p>${s.description}</p>
        <ul class="step-points">
          ${s.points.map(p => `
            <li class="step-point">
              <div class="step-point-icon">${iconCheck(12)}</div>
              <span>${p}</span>
            </li>`).join('')}
        </ul>
      </div>
    </div>`).join('');

  return `
    <section id="how-it-works" class="how-it-works-section">
      <div class="container">
        <div class="section-header">
          <h2>Get Started in Minutes</h2>
          <p>A straightforward path from setup to value, with support at every step.</p>
        </div>
        <div class="steps-list">${stepCards}</div>
      </div>
    </section>`;
}

function renderCTA(): string {
  return `
    <section class="cta-section">
      <div class="cta-bg"></div>
      <div class="cta-blob cta-blob-1"></div>
      <div class="cta-blob cta-blob-2"></div>
      <div class="container">
        <div class="cta-content">
          <h2>Ready to Transform How Your Team Works?</h2>
          <p>Join thousands of teams who use Fusion AI to amplify their human intelligence. Start your free trial today — no credit card required.</p>
          <div class="cta-buttons">
            <button class="btn btn-accent btn-xl" data-goto-auth>
              Start Free Trial ${iconArrowRight(20)}
            </button>
            <button class="btn btn-outline-light btn-xl">Talk to Sales</button>
          </div>
        </div>
      </div>
    </section>`;
}

function renderFooter(): string {
  const year = new Date().getFullYear();
  return `
    <footer id="about" class="footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="navbar-logo">
              <div class="navbar-logo-icon">F</div>
              <span class="navbar-logo-text">Fusion AI</span>
            </div>
            <p>Human-Intelligence first AI platform. Amplifying expertise, not replacing it.</p>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#">Features</a></li>
              <li><a href="#">Integrations</a></li>
              <li><a href="#">Pricing</a></li>
              <li><a href="#">Changelog</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About Us</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Security</a></li>
              <li><a href="#">GDPR</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; ${year} Fusion AI. All rights reserved.</p>
          <div class="footer-socials">
            <a href="#">Twitter</a>
            <a href="#">LinkedIn</a>
            <a href="#">GitHub</a>
          </div>
        </div>
      </div>
    </footer>`;
}

export async function init(): Promise<void> {
  const root = $('#page-root');
  if (!root) return;

  root.innerHTML = `
    <div class="min-h-screen bg-background">
      ${renderNavbar()}
      <main>
        ${renderHero()}
        ${renderFeatures()}
        ${renderHowItWorks()}
        ${renderCTA()}
      </main>
      ${renderFooter()}
    </div>`;

  // Mobile menu toggle
  const toggle = $('#mobile-menu-toggle');
  const menu = $('#mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const isHidden = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !isHidden);
      toggle.innerHTML = isHidden ? iconX(24) : iconMenu(24);
    });
  }

  // Navigation to auth
  document.querySelectorAll<HTMLElement>('[data-goto-auth]').forEach(el => {
    el.addEventListener('click', () => {
      window.location.href = '../auth/index.html';
    });
  });
}
