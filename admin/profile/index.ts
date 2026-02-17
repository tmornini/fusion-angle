import {
  $, showToast, escapeHtml,
  iconMail, iconPhone, iconBriefcase, iconStar,
  iconSave, iconCheckCircle2, iconCamera, iconChevronRight,
} from '../../site/script';
import { getProfileData, allStrengths } from '../../site/data';

const selectedStrengths = new Set(['Strategic Planning', 'Data Analysis', 'Stakeholder Management']);

function strengthChip(name: string): string {
  const active = selectedStrengths.has(name);
  return `<button class="strength-chip btn ${active ? 'btn-primary' : 'btn-secondary'} btn-sm" data-strength="${escapeHtml(name)}">
    ${active ? iconCheckCircle2(12) + ' ' : ''}${escapeHtml(name)}
  </button>`;
}

export async function init(): Promise<void> {
  const p = await getProfileData();

  // Breadcrumb chevron
  const chevronEl = $('#breadcrumb-chevron');
  if (chevronEl) chevronEl.innerHTML = iconChevronRight(14);

  // Icons
  const iconSaveEl = $('#icon-save');
  if (iconSaveEl) iconSaveEl.innerHTML = iconSave(16);
  const avatarBtn = $('#avatar-btn');
  if (avatarBtn) avatarBtn.innerHTML = iconCamera(14);
  const emailLabel = $('#email-label');
  if (emailLabel) emailLabel.innerHTML = `${iconMail(16)} Email`;
  const phoneLabel = $('#phone-label');
  if (phoneLabel) phoneLabel.innerHTML = `${iconPhone(16)} Phone`;
  const roleLabel = $('#role-label');
  if (roleLabel) roleLabel.innerHTML = `${iconBriefcase(16)} Role`;
  const strengthsHeader = $('#strengths-header');
  if (strengthsHeader) strengthsHeader.innerHTML = `${iconStar(20, 'text-primary')} My Strengths`;

  // Fill form values
  const avatarInitials = $('#avatar-initials');
  if (avatarInitials) avatarInitials.textContent = `${p.firstName[0]}${p.lastName[0]}`;
  ($('#firstName') as HTMLInputElement).value = p.firstName;
  ($('#lastName') as HTMLInputElement).value = p.lastName;
  ($('#email') as HTMLInputElement).value = p.email;
  ($('#phone') as HTMLInputElement).value = p.phone;
  ($('#role') as HTMLInputElement).value = p.role;
  ($('#department') as HTMLSelectElement).value = p.department;
  ($('#bio') as HTMLTextAreaElement).value = p.bio;

  // Strengths
  const strengthsContainer = $('#strengths-container');
  if (strengthsContainer) {
    strengthsContainer.innerHTML = allStrengths.map(strengthChip).join('');
    strengthsContainer.querySelectorAll<HTMLElement>('.strength-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.getAttribute('data-strength') ?? '';
        if (selectedStrengths.has(name)) {
          selectedStrengths.delete(name);
          chip.className = 'strength-chip btn btn-secondary btn-sm';
          chip.innerHTML = escapeHtml(name);
        } else {
          selectedStrengths.add(name);
          chip.className = 'strength-chip btn btn-primary btn-sm';
          chip.innerHTML = iconCheckCircle2(12) + ' ' + escapeHtml(name);
        }
      });
    });
  }

  // Save button
  $('#save-btn')?.addEventListener('click', () => {
    const btn = $('#save-btn')!;
    btn.innerHTML = 'Saving...';
    btn.setAttribute('disabled', '');
    setTimeout(() => {
      btn.innerHTML = iconCheckCircle2(16) + ' Saved!';
      btn.removeAttribute('disabled');
      showToast('Profile saved successfully', 'success');
      setTimeout(() => { btn.innerHTML = iconSave(16) + ' Save Changes'; }, 2000);
    }, 800);
  });
}
