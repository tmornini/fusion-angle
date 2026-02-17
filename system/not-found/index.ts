import { $ } from '../../site/script';

export async function init(): Promise<void> {
  const root = $('#page-root');
  if (!root) return;

  root.innerHTML = `
    <div class="flex min-h-screen items-center justify-center bg-muted">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4">404</h1>
        <p class="text-xl text-muted mb-4">Oops! Page not found</p>
        <a href="../landing/index.html" class="text-primary" style="text-decoration:underline">Return to Home</a>
      </div>
    </div>`;
}
