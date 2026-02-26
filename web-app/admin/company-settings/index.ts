import {
  $, showToast,
  iconBuilding, iconGlobe, iconShield, iconSave, iconChevronRight,
  html, setHtml, SafeHtml, trusted,
} from '../../site/script';
import { getCompanySettings } from '../../site/data';

function buildSelectField(id: string, label: string, value: string, options: string[]): SafeHtml {
  return html`<div>
    <label class="label mb-2 block">${label}</label>
    <select class="input" id="${id}">
      ${options.map(option => html`<option value="${option}" ${option === value ? trusted('selected') : html``}>${option}</option>`)}
    </select>
  </div>`;
}

function buildToggleRow(id: string, label: string, description: string, checked: boolean): SafeHtml {
  return html`
    <div class="flex items-center justify-between py-4" style="border-bottom:1px solid hsl(var(--border))">
      <div style="flex:1;min-width:0;margin-right:2rem">
        <p class="font-medium">${label}</p>
        <p class="text-sm text-muted">${description}</p>
      </div>
      <button class="switch" role="switch" aria-checked="${checked}" id="switch-${id}">
        <span class="switch-thumb"></span>
      </button>
    </div>`;
}

export async function init(): Promise<void> {
  const settings = await getCompanySettings();
  const container = $('#company-settings-content');
  if (!container) return;

  setHtml(container, html`
    <div style="max-width:48rem;margin:0 auto">
      <nav class="flex items-center gap-2 text-sm text-muted mb-6">
        <a href="../account/index.html" class="text-primary">Account</a>
        ${iconChevronRight(14)} <span>Company Settings</span>
      </nav>

      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-display font-bold mb-2">Company Settings</h1>
          <p class="text-muted">Manage your organization's configuration</p>
        </div>
        <button class="btn btn-primary gap-2" id="company-settings-save-btn">${iconSave(16)} Save Changes</button>
      </div>

      <div class="card card-hover p-6 mb-6">
        <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconBuilding(20)} General Information</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="label mb-2 block">Company Name</label>
            <input class="input" id="company-settings-name" value="${settings.name}" />
          </div>
          <div>
            <label class="label mb-2 block flex items-center gap-2">${iconGlobe(16)} Domain</label>
            <input class="input" id="company-settings-domain" value="${settings.domain}" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          ${buildSelectField('company-settings-industry', 'Industry', settings.industry, ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Education', 'Other'])}
          ${buildSelectField('company-settings-size', 'Company Size', settings.size, ['1-10', '11-50', '51-200', '201-500', '500+'])}
        </div>
      </div>

      <div class="card card-hover p-6 mb-6">
        <h3 class="font-display font-semibold mb-4">Regional Settings</h3>
        <div class="grid grid-cols-2 gap-4">
          ${buildSelectField('company-settings-timezone', 'Timezone', settings.timezone, ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'])}
          ${buildSelectField('company-settings-language', 'Language', settings.language, ['English', 'Spanish', 'French', 'German', 'Japanese'])}
        </div>
      </div>

      <div class="card card-hover p-6 mb-6">
        <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconShield(20)} Security</h3>
        ${buildToggleRow('company-settings-sso', 'Enforce SSO', 'Require Single Sign-On for all users', settings.isSsoEnforced)}
        ${buildToggleRow('company-settings-2fa', 'Two-Factor Authentication', 'Require 2FA for all users', settings.isTwoFactorEnabled)}
        ${buildToggleRow('company-settings-ip-whitelist', 'IP Whitelist', 'Restrict access to specific IP addresses', settings.isIpWhitelistEnabled)}
        <div class="pt-4">
          ${buildSelectField('company-settings-retention', 'Data Retention Period', settings.dataRetention, ['6 months', '12 months', '24 months', '36 months', 'Indefinite'])}
        </div>
      </div>
    </div>`);

  // Switch toggles
  document.querySelectorAll<HTMLElement>('.switch[role="switch"]').forEach(switchElement => {
    switchElement.addEventListener('click', () => {
      const isChecked = switchElement.getAttribute('aria-checked') === 'true';
      switchElement.setAttribute('aria-checked', String(!isChecked));
    });
  });

  // Save
  $('#company-settings-save-btn')?.addEventListener('click', () => {
    showToast('Company settings saved successfully', 'success');
  });
}
