import { $, iconSparkles, html, setHtml } from '../../site/script';

export async function init(): Promise<void> {
  const root = $('#page-root');
  if (!root) return;

  setHtml(root, html`
    <div class="flex min-h-screen items-center justify-center" style="background:hsl(var(--background))">
      <div class="text-center" style="max-width:24rem;padding:2rem">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:3.5rem;height:3.5rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);margin-bottom:1.5rem">
          ${iconSparkles(28, 'text-primary')}
        </div>
        <h1 class="text-4xl font-display font-bold mb-2" style="color:hsl(var(--foreground))">404</h1>
        <p class="text-muted mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <a href="../landing/index.html" class="btn btn-primary">Return to Home</a>
      </div>
    </div>`);
}
