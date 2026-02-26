import {
  $, showToast,
  iconMail, iconPhone, iconBriefcase, iconStar,
  iconSave, iconCheckCircle2, iconCamera, iconChevronRight,
  html, setHtml, SafeHtml,
} from '../../site/script';
import { getProfile, allStrengths } from '../../site/data';

const selectedStrengths = new Set(['Strategic Planning', 'Data Analysis', 'Stakeholder Management']);

function buildStrengthChip(name: string): SafeHtml {
  const isActive = selectedStrengths.has(name);
  return html`<button class="strength-chip btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm" data-strength="${name}">
    ${isActive ? html`${iconCheckCircle2(12)} ` : html``}${name}
  </button>`;
}

export async function init(): Promise<void> {
  const profile = await getProfile();

  // Breadcrumb chevron
  const breadcrumbSeparatorEl = $('#profile-breadcrumb-separator');
  if (breadcrumbSeparatorEl) setHtml(breadcrumbSeparatorEl, iconChevronRight(14));

  // Icons
  const saveBtnIconEl = $('#profile-save-btn-icon');
  if (saveBtnIconEl) setHtml(saveBtnIconEl, iconSave(16));
  const avatarBtn = $('#profile-avatar-btn');
  if (avatarBtn) setHtml(avatarBtn, iconCamera(14));
  const emailLabel = $('#profile-email-label');
  if (emailLabel) setHtml(emailLabel, html`${iconMail(16)} Email`);
  const phoneLabel = $('#profile-phone-label');
  if (phoneLabel) setHtml(phoneLabel, html`${iconPhone(16)} Phone`);
  const roleLabel = $('#profile-role-label');
  if (roleLabel) setHtml(roleLabel, html`${iconBriefcase(16)} Role`);
  const strengthsHeader = $('#profile-strengths-header');
  if (strengthsHeader) setHtml(strengthsHeader, html`${iconStar(20, 'text-primary')} My Strengths`);

  // Fill form values
  const avatarInitials = $('#profile-avatar-initials');
  if (avatarInitials) avatarInitials.textContent = `${profile.firstName[0]}${profile.lastName[0]}`;
  ($('#profile-first-name') as HTMLInputElement).value = profile.firstName;
  ($('#profile-last-name') as HTMLInputElement).value = profile.lastName;
  ($('#profile-email') as HTMLInputElement).value = profile.email;
  ($('#profile-phone') as HTMLInputElement).value = profile.phone;
  ($('#profile-role') as HTMLInputElement).value = profile.role;
  ($('#profile-department') as HTMLSelectElement).value = profile.department;
  ($('#profile-bio') as HTMLTextAreaElement).value = profile.bio;

  // Strengths
  const strengthsContainer = $('#profile-strengths');
  if (strengthsContainer) {
    setHtml(strengthsContainer, html`${allStrengths.map(buildStrengthChip)}`);
    strengthsContainer.querySelectorAll<HTMLElement>('.strength-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.getAttribute('data-strength') ?? '';
        if (selectedStrengths.has(name)) {
          selectedStrengths.delete(name);
          chip.className = 'strength-chip btn btn-secondary btn-sm';
          chip.textContent = name;
        } else {
          selectedStrengths.add(name);
          chip.className = 'strength-chip btn btn-primary btn-sm';
          setHtml(chip, html`${iconCheckCircle2(12)} ${name}`);
        }
      });
    });
  }

  // Save button
  $('#profile-save-btn')?.addEventListener('click', () => {
    const btn = $('#profile-save-btn')!;
    btn.textContent = 'Saving...';
    btn.setAttribute('disabled', '');
    setTimeout(() => {
      setHtml(btn, html`${iconCheckCircle2(16)} Saved!`);
      btn.removeAttribute('disabled');
      showToast('Profile saved successfully', 'success');
      setTimeout(() => { setHtml(btn, html`${iconSave(16)} Save Changes`); }, 2000);
    }, 800);
  });
}
