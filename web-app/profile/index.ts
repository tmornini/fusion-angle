import { $, $input, $select, $textarea, populateIcons } from '../app/dom';
import { html, setHtml, SafeHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
  iconMail, iconPhone, iconBriefcase, iconStar,
  iconSave, iconCheckCircle2, iconCamera, iconChevronRight,
} from '../app/icons';
import { buildErrorState } from '../app/loading-states';
import { getProfile, allStrengths } from '../app/adapters';

const selectedStrengths = new Set(['Strategic Planning', 'Data Analysis', 'Stakeholder Management']);

function buildStrengthChip(name: string): SafeHtml {
  const isActive = selectedStrengths.has(name);
  return html`<button class="strength-chip btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm" data-strength="${name}">
    ${isActive ? html`${iconCheckCircle2(12)} ` : html``}${name}
  </button>`;
}

export async function init(): Promise<void> {
  const container = $('.page-content');
  if (!container) return;
  let profile: Awaited<ReturnType<typeof getProfile>>;
  try {
    profile = await getProfile();
  } catch {
    setHtml(container, buildErrorState('Failed to load profile.'));
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  populateIcons([
    ['#profile-breadcrumb-separator', iconChevronRight(14)],
    ['#profile-save-btn-icon', iconSave(16)],
    ['#profile-avatar-btn', iconCamera(14)],
    ['#profile-email-label', html`${iconMail(16)} Email`],
    ['#profile-phone-label', html`${iconPhone(16)} Phone`],
    ['#profile-role-label', html`${iconBriefcase(16)} Role`],
    ['#profile-strengths-header', html`${iconStar(20, 'text-primary')} My Strengths`],
  ]);

  // Fill form values
  const avatarInitials = $('#profile-avatar-initials');
  if (avatarInitials) avatarInitials.textContent = `${profile.firstName[0]}${profile.lastName[0]}`;
  const firstName = $input('#profile-first-name');
  if (firstName) firstName.value = profile.firstName;
  const lastName = $input('#profile-last-name');
  if (lastName) lastName.value = profile.lastName;
  const email = $input('#profile-email');
  if (email) email.value = profile.email;
  const phone = $input('#profile-phone');
  if (phone) phone.value = profile.phone;
  const role = $input('#profile-role');
  if (role) role.value = profile.role;
  const department = $select('#profile-department');
  if (department) department.value = profile.department;
  const bio = $textarea('#profile-bio');
  if (bio) bio.value = profile.bio;

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
