// ============================================
// FUSION AI — Icons (inline SVG — Lucide-compatible)
// Each returns SafeHtml; inherits currentColor.
// ============================================

import { SafeHtml } from './safe-html';

function icon(paths: string, size = 16, cssClass = '', ariaLabel?: string): SafeHtml {
  const a11y = ariaLabel
    ? `role="img" aria-label="${ariaLabel}"`
    : 'aria-hidden="true"';
  return new SafeHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cssClass}" ${a11y}>${paths}</svg>`);
}

function iconSparkles(size = 16, cssClass = '') { return icon('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>', size, cssClass); }
function iconHome(size = 16, cssClass = '') { return icon('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', size, cssClass); }
function iconLightbulb(size = 16, cssClass = '') { return icon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>', size, cssClass); }
function iconFolderKanban(size = 16, cssClass = '') { return icon('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>', size, cssClass); }
function iconUsers(size = 16, cssClass = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', size, cssClass); }
function iconUser(size = 16, cssClass = '') { return icon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', size, cssClass); }
function iconTarget(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', size, cssClass); }
function iconDatabase(size = 16, cssClass = '') { return icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>', size, cssClass); }
function iconGitBranch(size = 16, cssClass = '') { return icon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>', size, cssClass); }
function iconPalette(size = 16, cssClass = '') { return icon('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', size, cssClass); }
function iconLogOut(size = 16, cssClass = '') { return icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>', size, cssClass); }
function iconMenu(size = 16, cssClass = '') { return icon('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>', size, cssClass); }
function iconSearch(size = 16, cssClass = '') { return icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', size, cssClass); }
function iconBell(size = 16, cssClass = '') { return icon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', size, cssClass); }
function iconSun(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', size, cssClass); }
function iconMoon(size = 16, cssClass = '') { return icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', size, cssClass); }
function iconMonitor(size = 16, cssClass = '') { return icon('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>', size, cssClass); }
function iconX(size = 16, cssClass = '') { return icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', size, cssClass); }
function iconChevronDown(size = 16, cssClass = '') { return icon('<path d="m6 9 6 6 6-6"/>', size, cssClass); }
function iconChevronRight(size = 16, cssClass = '') { return icon('<path d="m9 18 6-6-6-6"/>', size, cssClass); }
function iconChevronLeft(size = 16, cssClass = '') { return icon('<path d="m15 18-6-6 6-6"/>', size, cssClass); }
function iconPanelLeftClose(size = 16, cssClass = '') { return icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>', size, cssClass); }
function iconPanelLeft(size = 16, cssClass = '') { return icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>', size, cssClass); }
function iconPlus(size = 16, cssClass = '') { return icon('<path d="M5 12h14"/><path d="M12 5v14"/>', size, cssClass); }
function iconArrowLeft(size = 16, cssClass = '') { return icon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', size, cssClass); }
function iconArrowRight(size = 16, cssClass = '') { return icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', size, cssClass); }
function iconCheck(size = 16, cssClass = '') { return icon('<path d="M20 6 9 17l-5-5"/>', size, cssClass); }
function iconLoader(size = 16, cssClass = '') { return icon('<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>', size, cssClass); }
function iconSettings(size = 16, cssClass = '') { return icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', size, cssClass); }
function iconExternalLink(size = 16, cssClass = '') { return icon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', size, cssClass); }
function iconFilter(size = 16, cssClass = '') { return icon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', size, cssClass); }
function iconMoreHorizontal(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', size, cssClass); }
function iconMoreVertical(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>', size, cssClass); }
function iconStar(size = 16, cssClass = '') { return icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', size, cssClass); }
function iconHeart(size = 16, cssClass = '') { return icon('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>', size, cssClass); }
function iconTrendingUp(size = 16, cssClass = '') { return icon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>', size, cssClass); }
function iconTrendingDown(size = 16, cssClass = '') { return icon('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>', size, cssClass); }
function iconAlertCircle(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>', size, cssClass); }
function iconAlertTriangle(size = 16, cssClass = '') { return icon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', size, cssClass); }
function iconCheckCircle(size = 16, cssClass = '') { return icon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>', size, cssClass); }
function iconInfo(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', size, cssClass); }
function iconMail(size = 16, cssClass = '') { return icon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', size, cssClass); }
function iconPhone(size = 16, cssClass = '') { return icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', size, cssClass); }
function iconCalendar(size = 16, cssClass = '') { return icon('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>', size, cssClass); }
function iconClock(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', size, cssClass); }
function iconUpload(size = 16, cssClass = '') { return icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>', size, cssClass); }
function iconDownload(size = 16, cssClass = '') { return icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>', size, cssClass); }
function iconTrash(size = 16, cssClass = '') { return icon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>', size, cssClass); }
function iconEdit(size = 16, cssClass = '') { return icon('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>', size, cssClass); }
function iconEye(size = 16, cssClass = '') { return icon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', size, cssClass); }
function iconCopy(size = 16, cssClass = '') { return icon('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', size, cssClass); }
function iconSave(size = 16, cssClass = '') { return icon('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>', size, cssClass); }
function iconSend(size = 16, cssClass = '') { return icon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', size, cssClass); }
function iconShare(size = 16, cssClass = '') { return icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>', size, cssClass); }
function iconGlobe(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>', size, cssClass); }
function iconRocket(size = 16, cssClass = '') { return icon('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>', size, cssClass); }
function iconZap(size = 16, cssClass = '') { return icon('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>', size, cssClass); }
function iconAward(size = 16, cssClass = '') { return icon('<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>', size, cssClass); }
function iconBrain(size = 16, cssClass = '') { return icon('<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>', size, cssClass); }
function iconWand(size = 16, cssClass = '') { return icon('<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>', size, cssClass); }
function iconActivity(size = 16, cssClass = '') { return icon('<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>', size, cssClass); }
function iconBarChart(size = 16, cssClass = '') { return icon('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', size, cssClass); }
function iconFileText(size = 16, cssClass = '') { return icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', size, cssClass); }
function iconShield(size = 16, cssClass = '') { return icon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>', size, cssClass); }
function iconBuilding(size = 16, cssClass = '') { return icon('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>', size, cssClass); }
function iconCrown(size = 16, cssClass = '') { return icon('<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>', size, cssClass); }
function iconBriefcase(size = 16, cssClass = '') { return icon('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>', size, cssClass); }
function iconClipboardCheck(size = 16, cssClass = '') { return icon('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', size, cssClass); }
function iconDollarSign(size = 16, cssClass = '') { return icon('<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', size, cssClass); }
function iconSmartphone(size = 16, cssClass = '') { return icon('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>', size, cssClass); }
function iconCode(size = 16, cssClass = '') { return icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', size, cssClass); }
function iconHash(size = 16, cssClass = '') { return icon('<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>', size, cssClass); }
function iconGripVertical(size = 16, cssClass = '') { return icon('<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>', size, cssClass); }
function iconGauge(size = 16, cssClass = '') { return icon('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>', size, cssClass); }
function iconLineChart(size = 16, cssClass = '') { return icon('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>', size, cssClass); }
function iconArrowUpRight(size = 16, cssClass = '') { return icon('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', size, cssClass); }
function iconArrowDownRight(size = 16, cssClass = '') { return icon('<path d="m7 7 10 10"/><path d="M17 7v10H7"/>', size, cssClass); }
function iconCamera(size = 16, cssClass = '') { return icon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', size, cssClass); }
function iconCreditCard(size = 16, cssClass = '') { return icon('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>', size, cssClass); }
function iconCircle(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/>', size, cssClass); }
function iconMessageSquare(size = 16, cssClass = '') { return icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', size, cssClass); }
function iconUserPlus(size = 16, cssClass = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>', size, cssClass); }
function iconUserCheck(size = 16, cssClass = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>', size, cssClass); }
function iconUserX(size = 16, cssClass = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>', size, cssClass); }
function iconXCircle(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>', size, cssClass); }
function iconCheckCircle2(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', size, cssClass); }
function iconHelpCircle(size = 16, cssClass = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', size, cssClass); }
function iconMinus(size = 16, cssClass = '') { return icon('<path d="M5 12h14"/>', size, cssClass); }
function iconFolderOpen(size = 16, cssClass = '') { return icon('<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>', size, cssClass); }
function iconFileSpreadsheet(size = 16, cssClass = '') { return icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>', size, cssClass); }
function iconListTodo(size = 16, cssClass = '') { return icon('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><line x1="13" x2="21" y1="6" y2="6"/><line x1="13" x2="21" y1="12" y2="12"/><line x1="13" x2="21" y1="18" y2="18"/>', size, cssClass); }
function iconToggleLeft(size = 16, cssClass = '') { return icon('<rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/>', size, cssClass); }
function iconType(size = 16, cssClass = '') { return icon('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>', size, cssClass); }
function iconTable(size = 16, cssClass = '') { return icon('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>', size, cssClass); }
function iconSlider(size = 16, cssClass = '') { return icon('<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>', size, cssClass); }
function iconDot(size = 16, cssClass = '') { return icon('<circle cx="12.1" cy="12.1" r="1"/>', size, cssClass); }
function iconLayoutGrid(size = 16, cssClass = '') { return icon('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>', size, cssClass); }
function iconChevronUp(size = 16, cssClass = '') { return icon('<path d="m18 15-6-6-6 6"/>', size, cssClass); }
function iconHistory(size = 16, cssClass = '') { return icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', size, cssClass); }

// Auto-generated icons map for lookup by kebab-case name.
// Converts "iconFolderKanban" → "folder-kanban" etc.
const _allIcons = [
  iconSparkles, iconHome, iconLightbulb, iconFolderKanban, iconUsers, iconUser,
  iconTarget, iconDatabase, iconGitBranch, iconPalette, iconLogOut, iconMenu,
  iconSearch, iconBell, iconSun, iconMoon, iconMonitor, iconX,
  iconChevronDown, iconChevronRight, iconChevronLeft,
  iconPanelLeftClose, iconPanelLeft, iconPlus, iconArrowLeft, iconArrowRight,
  iconCheck, iconLoader, iconSettings, iconExternalLink, iconFilter,
  iconMoreHorizontal, iconMoreVertical, iconStar, iconHeart,
  iconTrendingUp, iconTrendingDown, iconAlertCircle, iconAlertTriangle,
  iconCheckCircle, iconInfo, iconMail, iconPhone, iconCalendar, iconClock,
  iconUpload, iconDownload, iconTrash, iconEdit, iconEye, iconCopy, iconSave,
  iconSend, iconShare, iconGlobe, iconRocket, iconZap, iconAward, iconBrain,
  iconWand, iconActivity, iconBarChart, iconFileText, iconShield, iconBuilding,
  iconCrown, iconBriefcase, iconClipboardCheck, iconDollarSign, iconSmartphone,
  iconCode, iconHash, iconGripVertical, iconGauge, iconLineChart,
  iconArrowUpRight, iconArrowDownRight, iconCamera, iconCreditCard, iconCircle,
  iconMessageSquare, iconUserPlus, iconUserCheck, iconUserX, iconXCircle,
  iconCheckCircle2, iconHelpCircle, iconMinus, iconFolderOpen,
  iconFileSpreadsheet, iconListTodo, iconToggleLeft, iconType, iconTable,
  iconSlider, iconDot, iconLayoutGrid, iconChevronUp, iconHistory,
];
const icons: Record<string, (size?: number, cssClass?: string) => SafeHtml> = {};
for (const fn of _allIcons) {
  const pascalName = fn.name.replace(/^icon/, '');
  const kebabName = pascalName.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase()).replace(/(\d+)/g, '-$1');
  const camelName = pascalName[0]!.toLowerCase() + pascalName.slice(1);
  icons[kebabName] = fn;
  if (camelName !== kebabName) icons[camelName] = fn;
}

export {
  icon, icons,
  iconSparkles, iconHome, iconLightbulb, iconFolderKanban, iconUsers, iconUser,
  iconTarget, iconDatabase, iconGitBranch, iconPalette, iconLogOut, iconMenu,
  iconSearch, iconBell, iconSun, iconMoon, iconMonitor, iconX,
  iconChevronDown, iconChevronRight, iconChevronLeft,
  iconPanelLeftClose, iconPanelLeft, iconPlus, iconArrowLeft, iconArrowRight,
  iconCheck, iconLoader, iconSettings, iconExternalLink, iconFilter,
  iconMoreHorizontal, iconMoreVertical, iconStar, iconHeart,
  iconTrendingUp, iconTrendingDown, iconAlertCircle, iconAlertTriangle,
  iconCheckCircle, iconInfo, iconMail, iconPhone, iconCalendar, iconClock,
  iconUpload, iconDownload, iconTrash, iconEdit, iconEye, iconCopy, iconSave,
  iconSend, iconShare, iconGlobe, iconRocket, iconZap, iconAward, iconBrain,
  iconWand, iconActivity, iconBarChart, iconFileText, iconShield, iconBuilding,
  iconCrown, iconBriefcase, iconClipboardCheck, iconDollarSign, iconSmartphone,
  iconCode, iconHash, iconGripVertical, iconGauge, iconLineChart,
  iconArrowUpRight, iconArrowDownRight, iconCamera, iconCreditCard, iconCircle,
  iconMessageSquare, iconUserPlus, iconUserCheck, iconUserX, iconXCircle,
  iconCheckCircle2, iconHelpCircle, iconMinus, iconFolderOpen,
  iconFileSpreadsheet, iconListTodo, iconToggleLeft, iconType, iconTable,
  iconSlider, iconDot, iconLayoutGrid, iconChevronUp, iconHistory,
};
