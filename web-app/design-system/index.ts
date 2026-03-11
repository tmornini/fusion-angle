import { $ } from '../app/dom';
import { html, setHtml, type SafeHtml } from '../app/safe-html';
import {
  iconCheck, iconX, iconAlertTriangle, iconInfo, iconSearch, iconPlus,
  iconArrowRight, iconTrash, iconSparkles, iconHome, iconTarget, iconUpload, iconAlertCircle,
} from '../app/icons';

function buildColorSwatch(name: string, variable: string, style: string): SafeHtml {
  return html`<div style="display:flex;flex-direction:column;gap:0.5rem">
    <div style="height:4rem;width:100%;border-radius:0.5rem;border:1px solid hsl(var(--border));${style}"></div>
    <div class="text-sm font-medium">${name}</div>
    <code class="text-xs text-muted">${variable}</code>
  </div>`;
}

function buildTypographyRow(label: string, className: string, sample: string): SafeHtml {
  return html`<div style="display:flex;flex-direction:column;gap:0.25rem;padding:0.75rem 0;border-bottom:1px solid hsl(var(--border))">
    <code class="text-xs text-muted">${label}</code>
    <p class="${className}">${sample}</p>
  </div>`;
}

function buildShadowBox(name: string, variable: string): SafeHtml {
  return html`<div style="display:flex;flex-direction:column;align-items:center;gap:0.75rem">
    <div style="width:100%;height:5rem;border-radius:0.75rem;background:hsl(var(--card));box-shadow:var(${variable});border:1px solid hsl(var(--border))"></div>
    <code class="text-xs text-muted">${name}</code>
  </div>`;
}

export async function init(): Promise<void> {
  const root = $('#design-system-content');
  if (!root) return;

  setHtml(root, html`
    <div style="display:flex;flex-direction:column;gap:3rem;padding-bottom:4rem">
      <div>
        <h1 class="text-3xl font-bold font-display">Fusion AI Design System</h1>
        <p class="text-muted" style="margin-top:0.5rem">A production-ready design system for enterprise applications prioritizing clarity, trust, focus, and calm decision-making.</p>
      </div>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Brand Colors</h2><p class="text-muted mt-1">Primary brand colors for Fusion AI</p></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Primary Blue', '--primary', 'background:hsl(var(--primary))')}
          ${buildColorSwatch('Primary Foreground', '--primary-foreground', 'background:hsl(var(--primary-foreground));border-width:2px')}
          ${buildColorSwatch('Accent Yellow', '--accent', 'background:hsl(var(--accent))')}
          ${buildColorSwatch('Accent Foreground', '--accent-foreground', 'background:hsl(var(--accent-foreground))')}
        </div>
      </section>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Blue Scale</h2><p class="text-muted mt-1">Full blue color ramp for nuanced UI design</p></div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Blue 50', '--blue-50', 'background:hsl(var(--blue-50))')}
          ${buildColorSwatch('Blue 100', '--blue-100', 'background:hsl(var(--blue-100))')}
          ${buildColorSwatch('Blue 200', '--blue-200', 'background:hsl(var(--blue-200))')}
          ${buildColorSwatch('Blue 300', '--blue-300', 'background:hsl(var(--blue-300))')}
          ${buildColorSwatch('Blue 400', '--blue-400', 'background:hsl(var(--blue-400))')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Blue 500', '--blue-500', 'background:hsl(var(--blue-500))')}
          ${buildColorSwatch('Blue 600', '--blue-600', 'background:hsl(var(--blue-600))')}
          ${buildColorSwatch('Blue 700', '--blue-700', 'background:hsl(var(--blue-700))')}
          ${buildColorSwatch('Blue 800', '--blue-800', 'background:hsl(var(--blue-800))')}
          ${buildColorSwatch('Blue 900', '--blue-900', 'background:hsl(var(--blue-900))')}
        </div>
      </section>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Semantic Colors</h2><p class="text-muted mt-1">Status and feedback colors (WCAG AA compliant)</p></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Success', '--success', 'background:hsl(var(--success))')}
          ${buildColorSwatch('Warning', '--warning', 'background:hsl(var(--warning))')}
          ${buildColorSwatch('Destructive', '--destructive', 'background:hsl(var(--destructive))')}
          ${buildColorSwatch('Info', '--info', 'background:hsl(var(--primary))')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Success Soft', '--success-soft', 'background:hsl(var(--success-soft))')}
          ${buildColorSwatch('Warning Soft', '--warning-soft', 'background:hsl(var(--warning-soft))')}
          ${buildColorSwatch('Error Soft', '--error-soft', 'background:hsl(var(--error-soft))')}
          ${buildColorSwatch('Info Soft', '--info-soft', 'background:hsl(var(--primary)/0.1)')}
        </div>
      </section>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">UI Colors</h2><p class="text-muted mt-1">Background, surface, and border colors</p></div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:1.5rem" class="stats-grid">
          ${buildColorSwatch('Background', '--background', 'background:hsl(var(--background))')}
          ${buildColorSwatch('Foreground', '--foreground', 'background:hsl(var(--foreground))')}
          ${buildColorSwatch('Card', '--card', 'background:hsl(var(--card))')}
          ${buildColorSwatch('Muted', '--muted', 'background:hsl(var(--muted))')}
          ${buildColorSwatch('Border', '--border', 'background:hsl(var(--border))')}
          ${buildColorSwatch('Ring', '--ring', 'background:hsl(var(--ring))')}
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Typography</h2><p class="text-muted mt-1">IBM Plex Sans for display, Inter for body text</p></div>
        <div class="card" style="padding:1.5rem">
          ${buildTypographyRow('text-4xl / font-display / font-bold', 'text-4xl font-display font-bold', 'Hero Headlines')}
          ${buildTypographyRow('text-3xl / font-display / font-bold', 'text-3xl font-display font-bold', 'Page Titles')}
          ${buildTypographyRow('text-2xl / font-semibold', 'text-2xl font-semibold', 'Section Headers')}
          ${buildTypographyRow('text-xl / font-semibold', 'text-xl font-semibold', 'Subsection Headers')}
          ${buildTypographyRow('text-lg / font-medium', 'text-lg font-medium', 'Card Titles')}
          ${buildTypographyRow('text-base', 'text-base', 'Body text for general content and descriptions')}
          ${buildTypographyRow('text-sm', 'text-sm', 'Dense body text for tables and lists')}
          ${buildTypographyRow('text-xs', 'text-xs', 'Labels and helper text')}
          ${buildTypographyRow('text-2xs', 'text-2xs', 'Fine print and micro labels')}
          ${buildTypographyRow('font-mono / text-sm', 'font-mono text-sm', "const code = 'monospace';")}
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Buttons</h2><p class="text-muted mt-1">All button variants and sizes</p></div>
        <div class="card" style="padding:1.5rem">
          <h3 class="font-semibold mb-4">Variants</h3>
          <div class="flex flex-wrap gap-3 mb-4">
            <button class="btn btn-primary">Default</button>
            <button class="btn btn-secondary">Secondary</button>
            <button class="btn btn-outline">Outline</button>
            <button class="btn btn-ghost">Ghost</button>
            <button class="btn btn-destructive">Destructive</button>
            <button class="btn btn-success">Success</button>
            <button class="btn btn-hero">Hero</button>
          </div>
          <h3 class="font-semibold mb-4">Soft Variants</h3>
          <div class="flex flex-wrap gap-3 mb-4">
            <button class="btn" style="background:hsl(var(--primary)/0.1);color:hsl(var(--primary))">Soft Primary</button>
            <button class="btn" style="background:hsl(var(--success-soft));color:hsl(var(--success-text))">Soft Success</button>
            <button class="btn" style="background:hsl(var(--warning-soft));color:hsl(var(--warning-text))">Soft Warning</button>
            <button class="btn" style="background:hsl(var(--error-soft));color:hsl(var(--error-text))">Soft Destructive</button>
          </div>
          <h3 class="font-semibold mb-4">Disabled</h3>
          <div class="flex flex-wrap gap-3 mb-4">
            <button class="btn btn-primary" disabled>Disabled</button>
            <button class="btn btn-outline" disabled>Disabled Outline</button>
          </div>
          <h3 class="font-semibold mb-4">Sizes</h3>
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <button class="btn btn-primary btn-xs">Extra Small</button>
            <button class="btn btn-primary btn-sm">Small</button>
            <button class="btn btn-primary">Default</button>
            <button class="btn btn-primary btn-lg">Large</button>
            <button class="btn btn-primary btn-xl">Extra Large</button>
          </div>
          <h3 class="font-semibold mb-4">With Icons</h3>
          <div class="flex flex-wrap gap-3">
            <button class="btn btn-primary gap-2">${iconPlus(16)} Create</button>
            <button class="btn btn-outline gap-2">${iconSearch(16)} Search</button>
            <button class="btn btn-outline gap-2">Continue ${iconArrowRight(16)}</button>
            <button class="btn btn-destructive gap-2">${iconTrash(16)} Delete</button>
            <button class="btn btn-primary btn-icon">${iconPlus(20)}</button>
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Badges</h2><p class="text-muted mt-1">Status indicators and labels</p></div>
        <div class="card" style="padding:1.5rem">
          <h3 class="font-semibold mb-4">Standard</h3>
          <div class="flex flex-wrap gap-3 mb-4">
            <span class="badge badge-default">Default</span>
            <span class="badge badge-secondary">Secondary</span>
            <span class="badge badge-outline">Outline</span>
            <span class="badge badge-primary">Primary</span>
            <span class="badge badge-destructive">Destructive</span>
          </div>
          <h3 class="font-semibold mb-4">Status with Dot</h3>
          <div class="flex flex-wrap gap-3 mb-4">
            <span class="badge badge-success">${iconCheck(12)} Approved</span>
            <span class="badge badge-warning">${iconAlertTriangle(12)} Pending</span>
            <span class="badge badge-error">${iconX(12)} Rejected</span>
            <span class="status-badge-info">${iconInfo(12)} Info</span>
          </div>
          <h3 class="font-semibold mb-4">Soft Accent</h3>
          <div class="flex flex-wrap gap-3">
            <span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:hsl(var(--accent-soft));color:hsl(var(--accent-foreground));border:1px solid hsl(var(--accent)/0.3)">Accent Badge</span>
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Form Elements</h2><p class="text-muted mt-1">Input fields and text areas</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="convert-grid">
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-4">Inputs</h3>
            <div style="display:flex;flex-direction:column;gap:1rem">
              <div><label class="label mb-1 text-sm">Default Input</label><input class="input" placeholder="Enter text..."/></div>
              <div><label class="label mb-1 text-sm">With Value</label><input class="input" value="Sample content"/></div>
              <div>
                <label class="label mb-1 text-sm">Error State</label>
                <input class="input input-error" value="Invalid input"/>
                <p class="text-xs mt-1" style="color:hsl(var(--destructive))">This field is required</p>
              </div>
              <div><label class="label mb-1 text-sm">Disabled</label><input class="input" disabled placeholder="Disabled input"/></div>
            </div>
          </div>
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-4">Textareas</h3>
            <div style="display:flex;flex-direction:column;gap:1rem">
              <div><label class="label mb-1 text-sm">Default Textarea</label><textarea class="textarea" placeholder="Enter longer text..."></textarea></div>
              <div>
                <label class="label mb-1 text-sm">Error State</label>
                <textarea class="textarea input-error">Invalid content</textarea>
                <p class="text-xs mt-1" style="color:hsl(var(--destructive))">Please provide a valid description</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Cards</h2><p class="text-muted mt-1">Content containers with consistent styling</p></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem" class="score-grid">
          <div class="card card-hover" style="padding:1.5rem">
            <h3 class="font-semibold mb-1">Fusion Card</h3>
            <p class="text-xs text-muted mb-2">With hover effect</p>
            <p class="text-sm text-muted">Hover over this card to see the subtle shadow effect.</p>
          </div>
          <div class="card card-flat" style="padding:1.5rem">
            <h3 class="font-semibold mb-1">Flat Card</h3>
            <p class="text-xs text-muted mb-2">No shadow or hover</p>
            <p class="text-sm text-muted">A minimal card with just a border, suitable for secondary content.</p>
          </div>
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-1">Standard Card</h3>
            <p class="text-xs text-muted mb-2">Default styling</p>
            <p class="text-sm text-muted">The standard card with subtle shadow, suitable for most content.</p>
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Elevation & Shadows</h2><p class="text-muted mt-1">Shadow scale for depth and hierarchy</p></div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1.5rem" class="stats-grid">
          ${buildShadowBox('shadow-xs', '--shadow-xs')}
          ${buildShadowBox('shadow-sm', '--shadow-sm')}
          ${buildShadowBox('shadow-md', '--shadow-md')}
          ${buildShadowBox('shadow-lg', '--shadow-lg')}
          ${buildShadowBox('shadow-xl', '--shadow-xl')}
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Iconography</h2><p class="text-muted mt-1">Lucide-compatible inline SVG icons at standard sizes</p></div>
        <div class="card" style="padding:1.5rem">
          <div class="flex items-end gap-8">
            ${[16, 20, 24, 48].map(size => html`
              <div style="display:flex;flex-direction:column;align-items:center;gap:0.75rem">
                <div style="color:hsl(var(--primary))">${iconSparkles(size)}</div>
                <code class="text-xs text-muted">${size}px</code>
              </div>
            `)}
          </div>
          <div class="flex flex-wrap gap-4 mt-6 pt-4" style="border-top:1px solid hsl(var(--border))">
            ${[
              { fn: iconHome, name: 'Home' },
              { fn: iconSearch, name: 'Search' },
              { fn: iconPlus, name: 'Plus' },
              { fn: iconCheck, name: 'Check' },
              { fn: iconX, name: 'X' },
              { fn: iconTarget, name: 'Target' },
              { fn: iconAlertTriangle, name: 'Alert' },
              { fn: iconInfo, name: 'Info' },
              { fn: iconTrash, name: 'Trash' },
              { fn: iconUpload, name: 'Upload' },
            ].map(entry => html`
              <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;width:3.5rem">
                <div style="color:hsl(var(--foreground))">${entry.fn(20)}</div>
                <span class="text-2xs text-muted">${entry.name}</span>
              </div>
            `)}
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Spacing System</h2><p class="text-muted mt-1">8pt grid for consistent spacing</p></div>
        <div class="card" style="padding:1.5rem">
          ${[
            { name: 'space-1', value: '4px', w: '0.25rem' },
            { name: 'space-2', value: '8px', w: '0.5rem' },
            { name: 'space-3', value: '12px', w: '0.75rem' },
            { name: 'space-4', value: '16px', w: '1rem' },
            { name: 'space-6', value: '24px', w: '1.5rem' },
            { name: 'space-8', value: '32px', w: '2rem' },
            { name: 'space-12', value: '48px', w: '3rem' },
            { name: 'space-16', value: '64px', w: '4rem' },
          ].map(space => html`
            <div class="flex items-center gap-4" style="margin-bottom:0.75rem">
              <code class="text-xs text-muted" style="width:5rem">${space.name}</code>
              <div style="height:1rem;background:hsl(var(--primary));border-radius:0.25rem;width:${space.w}"></div>
              <span class="text-sm text-muted">${space.value}</span>
            </div>
          `)}
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Error & System States</h2><p class="text-muted mt-1">Patterns for validation errors, failures, and system messages</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="convert-grid">
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-3">Inline Validation</h3>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              <div>
                <label class="label mb-1 text-sm">Email Address</label>
                <input class="input input-error" value="invalid-email"/>
                <p class="text-xs mt-1 flex items-center gap-1" style="color:hsl(var(--destructive))">${iconAlertCircle(12)} Please enter a valid email address</p>
              </div>
              <div>
                <label class="label mb-1 text-sm">Project Name</label>
                <input class="input" value="AI Segmentation" style="border-color:hsl(var(--success))"/>
                <p class="text-xs mt-1 flex items-center gap-1" style="color:hsl(var(--success))">${iconCheck(12)} Looks good!</p>
              </div>
            </div>
          </div>
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-3">Upload Failed</h3>
            <div style="padding:1.5rem;border-radius:var(--radius-lg);background:hsl(var(--error-soft));border:1px solid hsl(var(--error-border));text-align:center">
              ${iconUpload(32, 'text-error')}
              <p class="font-medium text-sm mt-2" style="color:hsl(var(--error-text))">Upload Failed</p>
              <p class="text-xs text-muted mt-1">File exceeds maximum size of 10MB</p>
              <button class="btn btn-outline btn-sm mt-3">Try Again</button>
            </div>
          </div>
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-3">Save Failed</h3>
            <div style="padding:1rem;border-radius:var(--radius);background:hsl(var(--error-soft));border:1px solid hsl(var(--error-border));display:flex;align-items:flex-start;gap:0.75rem">
              ${iconAlertCircle(20, 'text-error')}
              <div style="flex:1">
                <p class="text-sm font-medium" style="color:hsl(var(--error-text))">Changes could not be saved</p>
                <p class="text-xs text-muted mt-0.5">Please check your connection and try again.</p>
              </div>
              <button class="btn btn-outline btn-xs">Retry</button>
            </div>
          </div>
          <div class="card" style="padding:1.5rem">
            <h3 class="font-semibold mb-3">Connection Issue</h3>
            <div style="padding:1rem;border-radius:var(--radius);background:hsl(var(--warning-soft));border:1px solid hsl(var(--warning-border));display:flex;align-items:flex-start;gap:0.75rem">
              ${iconAlertTriangle(20, 'text-warning')}
              <div style="flex:1">
                <p class="text-sm font-medium" style="color:hsl(var(--warning-text))">Connection interrupted</p>
                <p class="text-xs text-muted mt-0.5">Reconnecting automatically...</p>
              </div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:1.5rem">
          <h3 class="font-semibold mb-3">Inline System Error</h3>
          <div style="padding:1rem;border-radius:var(--radius);background:hsl(var(--error-soft));border:1px solid hsl(var(--error-border));display:flex;align-items:flex-start;gap:0.75rem">
            ${iconAlertCircle(20, 'text-error')}
            <div style="flex:1">
              <p class="text-sm font-medium" style="color:hsl(var(--error-text))">Something went wrong</p>
              <p class="text-xs text-muted mt-0.5">An unexpected error occurred while loading this section. Our team has been notified.</p>
            </div>
            <button class="btn btn-outline btn-sm">Reload Section</button>
          </div>
        </div>
        <div class="card" style="padding:3rem;text-align:center">
          <h3 class="font-semibold mb-3">Full Page Error</h3>
          <div style="padding:2rem">
            ${iconAlertTriangle(48, 'text-error')}
            <h3 class="text-xl font-display font-semibold mt-4">Something went wrong</h3>
            <p class="text-sm text-muted mt-2" style="max-width:28rem;margin:0.5rem auto 0">We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.</p>
            <div class="flex justify-center gap-3 mt-6">
              <button class="btn btn-primary">Refresh Page</button>
              <button class="btn btn-outline">Contact Support</button>
            </div>
          </div>
        </div>
      </section>

      <hr style="border:none;border-top:1px solid hsl(var(--border))"/>

      <section style="display:flex;flex-direction:column;gap:1.5rem">
        <div><h2 class="text-2xl font-semibold font-display">Usage Guidelines</h2><p class="text-muted mt-1">Do's and don'ts for the design system</p></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="convert-grid">
          <div class="card" style="padding:1.5rem;border-color:hsl(var(--success) / 0.3);background:hsl(var(--success-soft)/0.3)">
            <h3 class="font-semibold text-success flex items-center gap-2 mb-4">${iconCheck(20)} Do</h3>
            <div class="text-sm" style="display:flex;flex-direction:column;gap:0.5rem">
              <p>${iconCheck(14, 'text-success')} Use semantic color tokens, not raw hex values</p>
              <p>${iconCheck(14, 'text-success')} Maintain consistent spacing with the 8pt grid</p>
              <p>${iconCheck(14, 'text-success')} Ensure all interactive elements have focus states</p>
              <p>${iconCheck(14, 'text-success')} Use the proper typography scale for hierarchy</p>
              <p>${iconCheck(14, 'text-success')} Test contrast ratios for accessibility</p>
            </div>
          </div>
          <div class="card" style="padding:1.5rem;border-color:hsl(var(--error)/0.3);background:hsl(var(--error-soft)/0.3)">
            <h3 class="font-semibold text-error flex items-center gap-2 mb-4">${iconX(20)} Don't</h3>
            <div class="text-sm" style="display:flex;flex-direction:column;gap:0.5rem">
              <p>${iconX(14, 'text-error')} Use pure black (#000) for text</p>
              <p>${iconX(14, 'text-error')} Create custom colors outside the system</p>
              <p>${iconX(14, 'text-error')} Use decorative animations</p>
              <p>${iconX(14, 'text-error')} Skip focus states on interactive elements</p>
              <p>${iconX(14, 'text-error')} Mix typography scales inconsistently</p>
            </div>
          </div>
        </div>
      </section>
    </div>`);
}
